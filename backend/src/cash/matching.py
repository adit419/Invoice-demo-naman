"""
O2C Cash Application - Matching Engine
Implements Tier 1 (Order ID) and Tier 2 (Fuzzy) matching
"""
from difflib import SequenceMatcher
from typing import Dict, List, Tuple, Optional
import re


def similarity(a: str, b: str) -> float:
    """Calculate string similarity ratio between two strings."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def normalize_name(name: str) -> str:
    """Normalize store/business name by removing common prefixes."""
    if not name:
        return ""
    name = name.lower().strip()
    prefixes = ['toko ', 'tk ', 'warung ', 'w ', 'ud ', 'cv ', 'pt ',
                'kios ', 'depot ', 'grosir ', 'agen ', 'tb ']
    for prefix in prefixes:
        if name.startswith(prefix):
            name = name[len(prefix):]
    return name.strip()


def parse_amount(amount_str: str) -> int:
    """Parse amount string to integer, handling various formats."""
    if not amount_str:
        return 0
    # Remove quotes, commas, and whitespace
    cleaned = str(amount_str).replace('"', '').replace(',', '').replace(' ', '')
    try:
        return int(float(cleaned))
    except (ValueError, TypeError):
        return 0


def extract_order_id(description: str) -> Optional[str]:
    """Extract Order ID from description if present."""
    if not description:
        return None
    # Order IDs start with 'OD' followed by digits
    match = re.search(r'(OD\d{9,})', description)
    if match:
        return match.group(1)
    return None


class MatchingEngine:
    """
    O2C Cash Application Matching Engine

    Performs two-tier matching:
    - Tier 1: Direct Order ID matching (highest confidence)
    - Tier 2: Fuzzy matching based on name similarity and amount
    """

    def __init__(self, orders: List[Dict], bank_transactions: List[Dict]):
        self.orders = orders
        self.bank_transactions = bank_transactions
        self.order_lookup = self._build_order_lookup()
        # Pre-compute normalized order names for faster fuzzy matching
        self.normalized_order_names = {
            oid: normalize_name(order['store_name'])
            for oid, order in self.order_lookup.items()
        }
        self.results = []

    def _build_order_lookup(self) -> Dict:
        """Build lookup dictionary from orders by order_id."""
        lookup = {}
        for order in self.orders:
            oid = order.get('order_id', '')
            if oid and oid not in lookup:
                lookup[oid] = {
                    'order_id': oid,
                    'store_name': order.get('store_name', ''),
                    'amount': parse_amount(order.get('total_amount_collected', 0)),
                    'order_date': order.get('order_date', ''),
                    'status': order.get('order_status', order.get('status', ''))
                }
        return lookup

    def run_matching(self) -> List[Dict]:
        """Run full matching process and return results."""
        self.results = []
        matched_order_ids = set()

        total = len(self.bank_transactions)
        print(f"  Processing {total} transactions (2-way matching)...")

        for i, txn in enumerate(self.bank_transactions):
            if (i + 1) % 500 == 0 or i == 0:
                print(f"  2-way progress: {i + 1}/{total}...")

            result = self._match_transaction(txn, matched_order_ids)
            self.results.append(result)
            if result['matched_order_id']:
                matched_order_ids.add(result['matched_order_id'])

        print(f"  2-way matching completed: {total} transactions")
        return self.results

    def _match_transaction(self, txn: Dict, matched_order_ids: set) -> Dict:
        """Match a single bank transaction to an order."""
        txn_id = txn.get('Transaction_ID', txn.get('Transaction ID', ''))
        description = txn.get('Description', '')
        name = txn.get('Name', '')
        amount = parse_amount(txn.get('Amount', 0))
        txn_date = txn.get('Transaction_Date', txn.get('date', ''))
        channel = txn.get('Payment_Channel', txn.get('Payment Channel', ''))

        result = {
            'transaction_id': txn_id,
            'description': description,
            'name': name,
            'amount': amount,
            'transaction_date': txn_date,
            'payment_channel': channel,
            'match_type': 'unmatched',
            'matched_order_id': None,
            'matched_store_name': None,
            'matched_amount': None,
            'confidence': 0.0,
            'status': 'exception'
        }

        # Tier 1: Direct Order ID match
        order_id = extract_order_id(description)
        if order_id and order_id in self.order_lookup:
            order = self.order_lookup[order_id]
            if order_id not in matched_order_ids:
                result.update({
                    'match_type': 'order_id',
                    'matched_order_id': order_id,
                    'matched_store_name': order['store_name'],
                    'matched_amount': order['amount'],
                    'confidence': 1.0,
                    'status': 'matched'
                })
                return result

        # Tier 2: Fuzzy matching
        best_match = self._fuzzy_match(name, description, amount, matched_order_ids)
        if best_match:
            result.update({
                'match_type': 'fuzzy',
                'matched_order_id': best_match['order_id'],
                'matched_store_name': best_match['store_name'],
                'matched_amount': best_match['amount'],
                'confidence': best_match['confidence'],
                'status': 'matched' if best_match['confidence'] >= 0.85 else 'review'
            })

        return result

    def _fuzzy_match(self, name: str, description: str, amount: int,
                     matched_order_ids: set) -> Optional[Dict]:
        """Find best fuzzy match based on name similarity and amount."""
        normalized_name = normalize_name(name)
        normalized_desc = normalize_name(description)

        best_match = None
        best_score = 0.0

        for order_id, order in self.order_lookup.items():
            if order_id in matched_order_ids:
                continue

            order_name = self.normalized_order_names.get(order_id, '')
            order_amount = order['amount']

            # Calculate name similarity
            name_sim = max(
                similarity(normalized_name, order_name),
                similarity(normalized_desc, order_name)
            )

            # Calculate amount match (STRICT: must match or be within 5%)
            amount_match = 0.0
            if amount and order_amount:
                if amount == order_amount:
                    amount_match = 1.0
                else:
                    amount_diff = abs(amount - order_amount) / max(amount, order_amount)
                    if amount_diff < 0.05:  # Within 5% tolerance
                        amount_match = 0.9
                    elif amount_diff < 0.10:  # Within 10% tolerance
                        amount_match = 0.7

            # Combined score - TIGHTENED: Now requires BOTH name AND amount match
            score = 0.0
            if name_sim > 0.85 and amount_match >= 0.9:
                # High confidence: excellent name match + exact/near-exact amount
                score = (name_sim * 0.5 + amount_match * 0.5)
            elif name_sim > 0.7 and amount_match == 1.0:
                # Good name match + exact amount
                score = (name_sim * 0.4 + amount_match * 0.6)
            elif name_sim > 0.6 and amount_match >= 0.9:
                # Moderate name match + exact/near-exact amount
                score = (name_sim * 0.4 + amount_match * 0.6)

            if score > best_score and score >= 0.75:
                best_score = score
                best_match = {
                    'order_id': order_id,
                    'store_name': order['store_name'],
                    'amount': order_amount,
                    'confidence': round(score, 2)
                }

        return best_match

    def get_statistics(self) -> Dict:
        """Get matching statistics."""
        if not self.results:
            self.run_matching()

        total = len(self.results)
        tier1 = sum(1 for r in self.results if r['match_type'] == 'order_id')
        tier2 = sum(1 for r in self.results if r['match_type'] == 'fuzzy')
        unmatched = sum(1 for r in self.results if r['match_type'] == 'unmatched')
        review = sum(1 for r in self.results if r['status'] == 'review')

        return {
            'total_transactions': total,
            'tier1_matches': tier1,
            'tier2_matches': tier2,
            'total_matched': tier1 + tier2,
            'unmatched': unmatched,
            'needs_review': review,
            'match_rate': round((tier1 + tier2) / total * 100, 1) if total > 0 else 0,
            'tier1_rate': round(tier1 / total * 100, 1) if total > 0 else 0,
            'tier2_rate': round(tier2 / total * 100, 1) if total > 0 else 0
        }

    def get_matched(self) -> List[Dict]:
        """Get all matched transactions."""
        if not self.results:
            self.run_matching()
        return [r for r in self.results if r['status'] in ('matched', 'review')]

    def get_exceptions(self) -> List[Dict]:
        """Get all unmatched/exception transactions."""
        if not self.results:
            self.run_matching()
        return [r for r in self.results if r['status'] == 'exception']

    def get_suggested_matches(self, transaction_id: str, limit: int = 5) -> List[Dict]:
        """Get suggested matches for an unmatched transaction."""
        txn = next((r for r in self.results if r['transaction_id'] == transaction_id), None)
        if not txn:
            return []

        name = txn.get('name', '')
        description = txn.get('description', '')
        amount = txn.get('amount', 0)

        normalized_name = normalize_name(name)
        normalized_desc = normalize_name(description)

        suggestions = []
        for order_id, order in self.order_lookup.items():
            order_name = self.normalized_order_names.get(order_id, '')

            name_sim = max(
                similarity(normalized_name, order_name),
                similarity(normalized_desc, order_name)
            )

            amount_diff = abs(amount - order['amount']) / max(amount, order['amount'], 1)

            if name_sim > 0.3 or amount_diff < 0.2:
                suggestions.append({
                    'order_id': order_id,
                    'store_name': order['store_name'],
                    'amount': order['amount'],
                    'name_similarity': round(name_sim, 2),
                    'amount_match': amount == order['amount']
                })

        # Sort by name similarity descending
        suggestions.sort(key=lambda x: x['name_similarity'], reverse=True)
        return suggestions[:limit]
