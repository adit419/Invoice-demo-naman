"""
O2C Cash Application - Pydantic Models
Supports 3-way reconciliation: Bank Statement ↔ Payment Gateway ↔ Revenue Orders
"""
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum


class MatchType(str, Enum):
    ORDER_ID = "order_id"
    FUZZY = "fuzzy"
    UNMATCHED = "unmatched"
    MANUAL = "manual"
    GATEWAY = "gateway"  # Matched via payment gateway


class MatchStatus(str, Enum):
    MATCHED = "matched"
    REVIEW = "review"
    EXCEPTION = "exception"
    RESOLVED = "resolved"


class ReconciliationStatus(str, Enum):
    """3-way reconciliation status"""
    FULL_MATCH = "full_match"          # All 3 sources match (Bank + Gateway + Order)
    BANK_PG_ONLY = "bank_pg_only"      # Bank + Gateway match, no Order
    PG_ORDER_ONLY = "pg_order_only"    # Gateway + Order match, no Bank settlement
    BANK_ORDER_ONLY = "bank_order_only"  # Bank + Order match directly, no Gateway
    UNMATCHED = "unmatched"            # No matches found


class ActionType(str, Enum):
    MANUAL_MATCH = "manual_match"
    CREATE_ORDER = "create_order"
    MARK_DUPLICATE = "mark_duplicate"
    FLAG_REVIEW = "flag_review"
    REJECT = "reject"
    WRITE_OFF = "write_off"
    LINK_GATEWAY = "link_gateway"      # Link to a gateway transaction
    LINK_ORDER = "link_order"          # Link gateway to order


class Client(BaseModel):
    id: str
    name: str
    description: str
    transaction_count: int
    order_count: int
    gateway_count: int = 0


class DashboardStats(BaseModel):
    total_transactions: int
    tier1_matches: int
    tier2_matches: int
    total_matched: int
    unmatched: int
    needs_review: int
    match_rate: float
    tier1_rate: float
    tier2_rate: float
    total_amount: int
    matched_amount: int
    unmatched_amount: int
    # 3-way reconciliation stats
    full_matches: int = 0           # Bank + Gateway + Order all match
    bank_pg_only: int = 0           # Bank + Gateway match, no Order
    pg_order_only: int = 0          # Gateway + Order match, no Bank
    bank_order_only: int = 0        # Bank + Order match, no Gateway
    total_gateway_transactions: int = 0
    total_variance: int = 0         # Sum of amount differences


class Transaction(BaseModel):
    transaction_id: str
    description: str
    name: str
    amount: int
    transaction_date: str
    payment_channel: str
    match_type: str
    matched_order_id: Optional[str]
    matched_store_name: Optional[str]
    matched_amount: Optional[int]
    confidence: float
    status: str
    # 3-way reconciliation fields
    gateway_txn_id: Optional[str] = None
    gateway_amount: Optional[int] = None
    gateway_fee: Optional[int] = None
    gateway_name: Optional[str] = None
    reconciliation_status: Optional[str] = None
    amount_variance: Optional[int] = None


class PaymentGateway(BaseModel):
    """Payment Gateway transaction record"""
    gateway_txn_id: str
    order_id: Optional[str]
    merchant_id: str
    payment_method: str
    gateway_name: str
    gross_amount: int
    fee_amount: int
    net_amount: int
    currency: str
    status: str
    customer_name: str
    payer_email: Optional[str]
    initiated_at: str
    completed_at: Optional[str]
    settled_at: Optional[str]
    bank_settlement_ref: Optional[str]


class ThreeWayMatch(BaseModel):
    """Result of 3-way reconciliation matching"""
    transaction_id: str
    # Bank statement data
    bank_amount: int
    bank_name: str
    bank_description: str
    bank_date: str
    bank_reference: Optional[str]
    # Payment gateway data
    gateway_txn_id: Optional[str] = None
    gateway_amount: Optional[int] = None
    gateway_fee: Optional[int] = None
    gateway_net: Optional[int] = None
    gateway_name: Optional[str] = None
    gateway_status: Optional[str] = None
    # Order data
    order_id: Optional[str] = None
    order_amount: Optional[int] = None
    order_store_name: Optional[str] = None
    order_date: Optional[str] = None
    # Match metadata
    reconciliation_status: str
    confidence: float
    amount_variance: int = 0
    match_details: Optional[Dict[str, Any]] = None


class SuggestedMatch(BaseModel):
    order_id: str
    store_name: str
    amount: int
    name_similarity: float
    amount_match: bool


class ExceptionAction(BaseModel):
    action: ActionType
    order_id: Optional[str] = None
    note: Optional[str] = None


class ActionResponse(BaseModel):
    success: bool
    message: str
    transaction_id: str
    new_status: str


class MatchingRunResponse(BaseModel):
    success: bool
    message: str
    stats: DashboardStats
