from .in_memory_db import InMemoryClient, InMemoryDatabase

client: InMemoryClient | None = None


def get_client() -> InMemoryClient:
    return client


def get_db() -> InMemoryDatabase:
    return client["invoice_demo"]


async def connect_db():
    global client
    client = InMemoryClient()
    print("[DB] ✅ In-memory database initialized (no MongoDB required)")


async def close_db():
    global client
    if client:
        client.close()
        client = None
        print("[DB] In-memory database closed")
