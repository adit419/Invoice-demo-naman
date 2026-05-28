"""
In-memory database implementation.
Provides a Motor-like API for demo purposes without requiring MongoDB.

Supports:
  • CRUD: insert_one / insert_many / find_one / find / update_one / update_many /
    delete_one / delete_many / count_documents / create_index
  • Optional Mongo projections on find_one / find (silently accepted; documents
    are returned in full — projections in this demo are non-load-bearing)
  • update_one(..., upsert=True) / update_many(..., upsert=True)
  • Update operators: $set, $unset, $push (with $each), $pull, $addToSet, $inc
  • Filter operators: $eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $exists, $regex
"""

import re
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from bson import ObjectId


@dataclass
class InsertOneResult:
    """Mimics Motor's InsertOneResult."""
    inserted_id: Any


@dataclass
class UpdateResult:
    """Mimics Motor's UpdateResult."""
    modified_count: int
    upserted_id: Optional[Any] = None


@dataclass
class DeleteResult:
    """Mimics Motor's DeleteResult."""
    deleted_count: int


@dataclass
class InsertManyResult:
    """Mimics Motor's InsertManyResult."""
    inserted_ids: List[Any]


# ── Filter / update operator helpers ──────────────────────────────────────────

def _matches_value(doc_value: Any, expected: Any) -> bool:
    """Check whether ``doc_value`` satisfies ``expected``.

    ``expected`` can be a plain value (equality check) or a Mongo-style
    operator dict, e.g. ``{"$gt": 5}``, ``{"$in": [...]}``.
    """
    if isinstance(expected, dict) and expected and all(k.startswith("$") for k in expected.keys()):
        for op, arg in expected.items():
            if op == "$eq":
                if doc_value != arg:
                    return False
            elif op == "$ne":
                if doc_value == arg:
                    return False
            elif op == "$in":
                if doc_value not in arg:
                    return False
            elif op == "$nin":
                if doc_value in arg:
                    return False
            elif op == "$gt":
                if not (doc_value is not None and doc_value > arg):
                    return False
            elif op == "$gte":
                if not (doc_value is not None and doc_value >= arg):
                    return False
            elif op == "$lt":
                if not (doc_value is not None and doc_value < arg):
                    return False
            elif op == "$lte":
                if not (doc_value is not None and doc_value <= arg):
                    return False
            elif op == "$exists":
                # `arg` is bool; we approximate by treating missing keys as
                # absent and present-but-None as present.
                present = doc_value is not None or _SENTINEL_PRESENT  # placeholder
                # NOTE: this helper doesn't know whether the key was present in
                # the doc when value is None — for our demo usage `$exists` is
                # not actually used, so we just check truthiness.
                if bool(arg) and doc_value is None:
                    return False
                if not bool(arg) and doc_value is not None:
                    return False
                _ = present  # silence lint
            elif op == "$regex":
                if doc_value is None or not isinstance(doc_value, str):
                    return False
                flags = 0
                pattern = arg
                if isinstance(arg, re.Pattern):
                    pattern = arg.pattern
                    flags = arg.flags
                if not re.search(pattern, doc_value, flags):
                    return False
            else:
                # Unknown operator — be permissive (silently accept).
                continue
        return True

    # Plain equality
    return doc_value == expected


_SENTINEL_PRESENT = object()


def _document_matches(document: Dict[str, Any], filter: Dict[str, Any]) -> bool:
    """Check whether ``document`` satisfies the given Mongo-style ``filter``."""
    for key, expected in filter.items():
        if key == "$or":
            if not any(_document_matches(document, sub) for sub in expected):
                return False
            continue
        if key == "$and":
            if not all(_document_matches(document, sub) for sub in expected):
                return False
            continue
        # Support dotted keys ("a.b") by walking into nested dicts.
        doc_value: Any = document
        for part in key.split("."):
            if isinstance(doc_value, dict) and part in doc_value:
                doc_value = doc_value[part]
            else:
                doc_value = None
                break

        if not _matches_value(doc_value, expected):
            return False
    return True


def _apply_set(doc: Dict[str, Any], spec: Dict[str, Any]) -> None:
    """Apply a ``$set`` spec, honouring dotted paths."""
    for key, value in spec.items():
        if "." in key:
            parts = key.split(".")
            cursor = doc
            for part in parts[:-1]:
                nxt = cursor.get(part)
                if not isinstance(nxt, dict):
                    nxt = {}
                    cursor[part] = nxt
                cursor = nxt
            cursor[parts[-1]] = value
        else:
            doc[key] = value


def _apply_unset(doc: Dict[str, Any], spec: Dict[str, Any]) -> None:
    for key in spec.keys():
        if "." in key:
            parts = key.split(".")
            cursor = doc
            for part in parts[:-1]:
                nxt = cursor.get(part)
                if not isinstance(nxt, dict):
                    return
                cursor = nxt
            cursor.pop(parts[-1], None)
        else:
            doc.pop(key, None)


def _apply_push(doc: Dict[str, Any], spec: Dict[str, Any]) -> None:
    for key, value in spec.items():
        target = doc.get(key)
        if not isinstance(target, list):
            target = []
            doc[key] = target
        if isinstance(value, dict) and "$each" in value:
            target.extend(value["$each"])
        else:
            target.append(value)


def _apply_pull(doc: Dict[str, Any], spec: Dict[str, Any]) -> None:
    for key, value in spec.items():
        target = doc.get(key)
        if not isinstance(target, list):
            continue
        if isinstance(value, dict):
            doc[key] = [item for item in target if not (isinstance(item, dict) and _document_matches(item, value))]
        else:
            doc[key] = [item for item in target if item != value]


def _apply_add_to_set(doc: Dict[str, Any], spec: Dict[str, Any]) -> None:
    for key, value in spec.items():
        target = doc.get(key)
        if not isinstance(target, list):
            target = []
            doc[key] = target
        values = value["$each"] if isinstance(value, dict) and "$each" in value else [value]
        for v in values:
            if v not in target:
                target.append(v)


def _apply_inc(doc: Dict[str, Any], spec: Dict[str, Any]) -> None:
    for key, delta in spec.items():
        cur = doc.get(key) or 0
        doc[key] = cur + delta


_UPDATE_OPERATORS = {
    "$set": _apply_set,
    "$unset": _apply_unset,
    "$push": _apply_push,
    "$pull": _apply_pull,
    "$addToSet": _apply_add_to_set,
    "$inc": _apply_inc,
}


def _apply_update(doc: Dict[str, Any], update: Dict[str, Any]) -> None:
    """Apply all Mongo-style update operators present in ``update``."""
    for op, spec in update.items():
        fn = _UPDATE_OPERATORS.get(op)
        if fn:
            fn(doc, spec)
        elif not op.startswith("$"):
            # Whole-document replace (Mongo behaviour for un-operator'd updates).
            # We don't have a primary-key concept beyond _id, so do a shallow
            # overwrite of all keys.
            doc.clear()
            doc.update(update)
            return


def _seed_from_filter(filter: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort: when an upsert with no match fires, seed a new doc with the
    equality clauses of the filter so the resulting doc satisfies the filter.
    Operator dicts are skipped.
    """
    seed: Dict[str, Any] = {}
    for key, expected in filter.items():
        if key.startswith("$"):
            continue
        if isinstance(expected, dict) and any(k.startswith("$") for k in expected.keys()):
            continue
        if "." in key:
            parts = key.split(".")
            cursor = seed
            for part in parts[:-1]:
                nxt = cursor.setdefault(part, {})
                if not isinstance(nxt, dict):
                    nxt = {}
                    cursor[part] = nxt
                cursor = nxt
            cursor[parts[-1]] = expected
        else:
            seed[key] = expected
    return seed


# ── Cursor ────────────────────────────────────────────────────────────────────

class InMemoryCursor:
    """A cursor-like object that mimics Motor's AsyncIOMotorCursor."""

    def __init__(self, documents: List[Dict[str, Any]]):
        self._documents = documents
        self._sort_spec: List[tuple] = []
        self._skip_count = 0
        self._limit_count = 0

    def sort(self, key_or_list: Any, direction: Optional[int] = None) -> "InMemoryCursor":
        if isinstance(key_or_list, str) and direction is not None:
            self._sort_spec.append((key_or_list, direction))
        elif isinstance(key_or_list, list):
            self._sort_spec.extend(key_or_list)
        return self

    def skip(self, count: int) -> "InMemoryCursor":
        self._skip_count = count
        return self

    def limit(self, count: int) -> "InMemoryCursor":
        self._limit_count = count
        return self

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        docs = self._apply_operations()
        if length is None:
            return docs
        return docs[:length]

    def _apply_operations(self) -> List[Dict[str, Any]]:
        docs = self._documents[:]
        for key, direction in reversed(self._sort_spec):
            reverse = direction == -1
            try:
                docs.sort(key=lambda d: d.get(key, ""), reverse=reverse)
            except TypeError:
                docs.sort(
                    key=lambda d: (d.get(key) is None, d.get(key)),
                    reverse=reverse,
                )
        if self._skip_count > 0:
            docs = docs[self._skip_count:]
        if self._limit_count > 0:
            docs = docs[: self._limit_count]
        return docs

    def __aiter__(self):
        self._docs = self._apply_operations()
        self._index = 0
        return self

    async def __anext__(self):
        if self._index >= len(self._docs):
            raise StopAsyncIteration
        doc = self._docs[self._index]
        self._index += 1
        return doc


# ── Collection ────────────────────────────────────────────────────────────────

class InMemoryCollection:
    """Dictionary-backed collection mimicking AsyncIOMotorCollection."""

    def __init__(self, name: str):
        self.name = name
        self.documents: Dict[str, Dict[str, Any]] = {}

    async def insert_one(self, document: Dict[str, Any]) -> InsertOneResult:
        if "_id" not in document:
            document["_id"] = ObjectId()
        doc_id = str(document["_id"])
        self.documents[doc_id] = document
        return InsertOneResult(inserted_id=document["_id"])

    async def insert_many(self, documents: List[Dict[str, Any]]) -> InsertManyResult:
        inserted_ids = []
        for document in documents:
            if "_id" not in document:
                document["_id"] = ObjectId()
            doc_id = str(document["_id"])
            self.documents[doc_id] = document
            inserted_ids.append(document["_id"])
        return InsertManyResult(inserted_ids=inserted_ids)

    async def find_one(
        self,
        filter: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Find the first matching document.

        ``projection`` is accepted for Motor API compatibility but ignored —
        callers in this demo don't depend on it filtering fields.
        """
        _ = projection
        filter = filter or {}
        for doc in self.documents.values():
            if _document_matches(doc, filter):
                return doc
        return None

    def find(
        self,
        filter: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
    ) -> "InMemoryCursor":
        _ = projection
        filter = filter or {}
        matching = [doc for doc in self.documents.values() if _document_matches(doc, filter)]
        return InMemoryCursor(matching)

    async def update_one(
        self,
        filter: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False,
    ) -> UpdateResult:
        for doc in self.documents.values():
            if _document_matches(doc, filter):
                _apply_update(doc, update)
                return UpdateResult(modified_count=1)

        if upsert:
            seed = _seed_from_filter(filter)
            if "_id" not in seed:
                seed["_id"] = ObjectId()
            _apply_update(seed, update)
            self.documents[str(seed["_id"])] = seed
            return UpdateResult(modified_count=0, upserted_id=seed["_id"])

        return UpdateResult(modified_count=0)

    async def update_many(
        self,
        filter: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False,
    ) -> UpdateResult:
        count = 0
        for doc in self.documents.values():
            if _document_matches(doc, filter):
                _apply_update(doc, update)
                count += 1

        if count == 0 and upsert:
            seed = _seed_from_filter(filter)
            if "_id" not in seed:
                seed["_id"] = ObjectId()
            _apply_update(seed, update)
            self.documents[str(seed["_id"])] = seed
            return UpdateResult(modified_count=0, upserted_id=seed["_id"])

        return UpdateResult(modified_count=count)

    async def delete_one(self, filter: Optional[Dict[str, Any]] = None) -> DeleteResult:
        filter = filter or {}
        for doc_id, doc in list(self.documents.items()):
            if _document_matches(doc, filter):
                del self.documents[doc_id]
                return DeleteResult(deleted_count=1)
        return DeleteResult(deleted_count=0)

    async def delete_many(self, filter: Optional[Dict[str, Any]] = None) -> DeleteResult:
        filter = filter or {}
        to_delete = [doc_id for doc_id, doc in self.documents.items() if _document_matches(doc, filter)]
        for doc_id in to_delete:
            del self.documents[doc_id]
        return DeleteResult(deleted_count=len(to_delete))

    async def create_index(self, index_list: List[tuple], **kwargs) -> str:
        """No-op for in-memory; preserves Motor API shape."""
        _ = (index_list, kwargs)
        return f"index_{self.name}"

    async def count_documents(self, filter: Optional[Dict[str, Any]] = None) -> int:
        filter = filter or {}
        return sum(1 for doc in self.documents.values() if _document_matches(doc, filter))

    async def distinct(self, key: str, filter: Optional[Dict[str, Any]] = None) -> List[Any]:
        filter = filter or {}
        seen = []
        for doc in self.documents.values():
            if _document_matches(doc, filter):
                v = doc.get(key)
                if v not in seen:
                    seen.append(v)
        return seen


# ── Database / Client ─────────────────────────────────────────────────────────

class InMemoryDatabase:
    """Dictionary-backed database mimicking AsyncIOMotorDatabase."""

    def __init__(self):
        self.collections: Dict[str, InMemoryCollection] = {}

    def __getitem__(self, name: str) -> InMemoryCollection:
        if name not in self.collections:
            self.collections[name] = InMemoryCollection(name)
        return self.collections[name]

    async def command(self, command: str) -> Dict[str, Any]:
        if command == "ping":
            return {"ok": 1}
        return {}

    def drop_collection(self, name: str) -> None:
        if name in self.collections:
            del self.collections[name]

    def get_collection_names(self) -> List[str]:
        return list(self.collections.keys())


class InMemoryClient:
    """Dictionary-backed client mimicking AsyncIOMotorClient."""

    def __init__(self):
        self.databases: Dict[str, InMemoryDatabase] = {}

    def __getitem__(self, name: str) -> InMemoryDatabase:
        if name not in self.databases:
            self.databases[name] = InMemoryDatabase()
        return self.databases[name]

    def close(self) -> None:
        self.databases.clear()

    async def admin_command(self, command: str) -> Dict[str, Any]:
        return {"ok": 1}


# `deepcopy` is imported above in case future call sites need true copy
# semantics on find_one — left here intentionally even if unused now.
_ = deepcopy
