"""
O2C Cash Application - FastAPI Router
Merged into main backend. Routes exposed at /cash-api/* prefix.
"""
import csv
import json
import os
from typing import List, Dict

from fastapi import APIRouter, HTTPException

from .models import (
    Client, DashboardStats, Transaction, SuggestedMatch,
    ExceptionAction, ActionResponse, MatchingRunResponse, ActionType,
    PaymentGateway, ThreeWayMatch, ReconciliationStatus
)
from .matching import MatchingEngine, parse_amount
from .three_way_matching import ThreeWayMatchingEngine, load_payment_gateway_data
from . import database as db
from . import ai_matching

router = APIRouter()

# Data paths — pointing to the O2C data directory
O2C_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'Downloads', 'home', 'ubuntu', 'O2C')
O2C_DIR = os.path.abspath(O2C_DIR)

BANK_STATEMENT_FILE = os.path.join(O2C_DIR, "Bank_Statement.csv")
ORDERS_FILE = os.path.join(O2C_DIR, "Revenue_Orders.csv")
GATEWAY_FILE = os.path.join(O2C_DIR, "Payment_Gateway.csv")

# In-memory cache
clients_data: Dict[str, Dict] = {}
matching_engines: Dict[str, MatchingEngine] = {}
three_way_engines: Dict[str, ThreeWayMatchingEngine] = {}


def load_csv(filepath: str) -> List[Dict]:
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append(dict(row))
    return data


def initialize_clients():
    global clients_data, matching_engines, three_way_engines

    bank_data = load_csv(BANK_STATEMENT_FILE)
    orders_data = load_csv(ORDERS_FILE)

    gateway_data = []
    if os.path.exists(GATEWAY_FILE):
        gateway_data = load_payment_gateway_data(GATEWAY_FILE)
        print(f"Loaded {len(gateway_data)} payment gateway transactions")

    unique_orders = {}
    for order in orders_data:
        oid = order.get('order_id', '')
        if oid and oid not in unique_orders:
            unique_orders[oid] = order

    clients_data['acme'] = {
        'id': 'acme', 'name': 'PT Sinar Mas Distribusi',
        'description': 'National FMCG distributor with 2000+ transactions (3-way reconciliation)',
        'bank_data': bank_data, 'orders_data': orders_data, 'gateway_data': gateway_data,
        'transaction_count': len(bank_data), 'order_count': len(unique_orders),
        'gateway_count': len(gateway_data)
    }

    beta_bank = bank_data[:1000]
    beta_gateway = [g for g in gateway_data if any(
        b.get('Reference') == g.get('bank_settlement_ref') for b in beta_bank if b.get('Reference')
    )][:600]
    clients_data['beta'] = {
        'id': 'beta', 'name': 'CV Berkah Jaya Retail',
        'description': 'Regional retail chain - West Java (3-way reconciliation)',
        'bank_data': beta_bank, 'orders_data': orders_data,
        'gateway_data': beta_gateway if beta_gateway else gateway_data[:600],
        'transaction_count': len(beta_bank), 'order_count': len(unique_orders),
        'gateway_count': len(beta_gateway) if beta_gateway else 600
    }

    gamma_bank = bank_data[-700:]
    gamma_gateway = [g for g in gateway_data if any(
        b.get('Reference') == g.get('bank_settlement_ref') for b in gamma_bank if b.get('Reference')
    )][:300]
    clients_data['gamma'] = {
        'id': 'gamma', 'name': 'PT Nusantara Dagang',
        'description': 'Inter-island trading - higher exception rate (3-way reconciliation)',
        'bank_data': gamma_bank, 'orders_data': orders_data,
        'gateway_data': gamma_gateway if gamma_gateway else gateway_data[:300],
        'transaction_count': len(gamma_bank), 'order_count': len(unique_orders),
        'gateway_count': len(gamma_gateway) if gamma_gateway else 300
    }

    for client_id, client in clients_data.items():
        three_way_engine = ThreeWayMatchingEngine(
            client['bank_data'], client['gateway_data'], client['orders_data']
        )
        if db.has_three_way_results(client_id):
            print(f"Loading existing 3-way results for {client_id} from database")
            db_results = db.get_three_way_results(client_id)
            three_way_engine.results = db_results
        else:
            print(f"Running initial 3-way matching for {client_id}")
            three_way_engine.run_matching()
            db.save_three_way_results(client_id, three_way_engine.results)
        three_way_engines[client_id] = three_way_engine

        engine = MatchingEngine(client['orders_data'], client['bank_data'])
        if db.has_matching_results(client_id):
            db_results = db.get_matching_results(client_id)
            engine.results = [
                {'transaction_id': r['transaction_id'], 'description': r['description'],
                 'name': r['name'], 'amount': r['amount'], 'transaction_date': r['transaction_date'],
                 'payment_channel': r['payment_channel'], 'match_type': r['match_type'],
                 'matched_order_id': r['matched_order_id'], 'matched_store_name': r['matched_store_name'],
                 'matched_amount': r['matched_amount'], 'confidence': r['confidence'], 'status': r['status']}
                for r in db_results
            ]
        else:
            engine.run_matching()
            db.save_matching_results(client_id, engine.results)
            db.save_matching_run(client_id, engine.get_statistics())
        matching_engines[client_id] = engine


def startup():
    db.init_db()
    initialize_clients()


@router.get("/clients", response_model=List[Client])
async def get_clients():
    return [
        Client(id=c['id'], name=c['name'], description=c['description'],
               transaction_count=c['transaction_count'], order_count=c['order_count'],
               gateway_count=c.get('gateway_count', 0))
        for c in clients_data.values()
    ]


@router.get("/dashboard/{client_id}", response_model=DashboardStats)
async def get_dashboard(client_id: str):
    if client_id not in three_way_engines:
        raise HTTPException(status_code=404, detail="Client not found")
    engine = three_way_engines[client_id]
    stats = engine.get_statistics()
    return DashboardStats(
        total_transactions=stats['total_transactions'],
        tier1_matches=stats['tier1_matches'], tier2_matches=stats['tier2_matches'],
        total_matched=stats['total_matched'], unmatched=stats['unmatched'],
        needs_review=stats['needs_review'], match_rate=stats['match_rate'],
        tier1_rate=stats['tier1_rate'], tier2_rate=stats['tier2_rate'],
        total_amount=stats.get('total_amount', 0), matched_amount=stats.get('matched_amount', 0),
        unmatched_amount=stats.get('unmatched_amount', 0), full_matches=stats['full_matches'],
        bank_pg_only=stats['bank_pg_only'], pg_order_only=stats['pg_order_only'],
        bank_order_only=stats['bank_order_only'],
        total_gateway_transactions=stats['total_gateway_transactions'],
        total_variance=stats['total_variance']
    )


@router.get("/matches/{client_id}", response_model=List[Transaction])
async def get_matches(client_id: str, limit: int = 500, offset: int = 0):
    if client_id not in three_way_engines:
        raise HTTPException(status_code=404, detail="Client not found")
    engine = three_way_engines[client_id]
    matched = []
    for r in engine.results:
        recon_stat = r.get('reconciliation_status', '')
        if recon_stat in ('full_match', 'bank_pg_only', 'pg_order_only', 'bank_order_only'):
            status = 'matched'
            if recon_stat == 'bank_pg_only':
                match_type = 'gateway'
            elif recon_stat in ('pg_order_only', 'bank_order_only'):
                match_type = 'order_id'
            elif r.get('gateway_txn_id'):
                match_type = 'gateway'
            else:
                match_type = 'order_id'
            matched.append(Transaction(
                transaction_id=r.get('transaction_id', ''), description=r.get('bank_description', ''),
                name=r.get('bank_name', ''), amount=r.get('bank_amount', 0),
                transaction_date=r.get('bank_date', ''), payment_channel=r.get('payment_channel', ''),
                match_type=match_type, matched_order_id=r.get('order_id'),
                matched_store_name=r.get('order_store_name'), matched_amount=r.get('order_amount'),
                confidence=r.get('confidence', 0.0), status=status,
                gateway_txn_id=r.get('gateway_txn_id'), gateway_amount=r.get('gateway_amount'),
                gateway_fee=r.get('gateway_fee'), gateway_name=r.get('gateway_name'),
                reconciliation_status=recon_stat, amount_variance=r.get('amount_variance', 0)
            ))
    return matched[offset:offset + limit]


@router.get("/exceptions/{client_id}", response_model=List[Transaction])
async def get_exceptions(client_id: str, limit: int = 500, offset: int = 0):
    if client_id not in three_way_engines:
        raise HTTPException(status_code=404, detail="Client not found")
    engine = three_way_engines[client_id]
    exceptions = engine.get_exceptions()
    actions = db.get_exception_actions(client_id)
    unresolved = []
    for e in exceptions:
        if e.get('transaction_id') not in actions:
            unresolved.append(Transaction(
                transaction_id=e.get('transaction_id', ''), description=e.get('bank_description', ''),
                name=e.get('bank_name', ''), amount=e.get('bank_amount', 0),
                transaction_date=e.get('bank_date', ''), payment_channel=e.get('payment_channel', ''),
                match_type='unmatched', matched_order_id=None, matched_store_name=None,
                matched_amount=None, confidence=0.0, status='exception',
                gateway_txn_id=e.get('gateway_txn_id'), gateway_amount=e.get('gateway_amount'),
                gateway_fee=e.get('gateway_fee'), gateway_name=e.get('gateway_name'),
                reconciliation_status=e.get('reconciliation_status'),
                amount_variance=e.get('amount_variance', 0)
            ))
    return unresolved[offset:offset + limit]


@router.get("/gateway/{client_id}", response_model=List[PaymentGateway])
async def get_gateway_transactions(client_id: str, limit: int = 500, offset: int = 0):
    if client_id not in clients_data:
        raise HTTPException(status_code=404, detail="Client not found")
    gateway_data = clients_data[client_id].get('gateway_data', [])
    result = []
    for g in gateway_data[offset:offset + limit]:
        result.append(PaymentGateway(
            gateway_txn_id=g.get('gateway_txn_id', ''), order_id=g.get('order_id'),
            merchant_id=g.get('merchant_id', ''), payment_method=g.get('payment_method', ''),
            gateway_name=g.get('gateway_name', ''), gross_amount=g.get('gross_amount', 0),
            fee_amount=g.get('fee_amount', 0), net_amount=g.get('net_amount', 0),
            currency=g.get('currency', 'IDR'), status=g.get('status', ''),
            customer_name=g.get('customer_name', ''), payer_email=g.get('payer_email'),
            initiated_at=g.get('initiated_at', ''), completed_at=g.get('completed_at'),
            settled_at=g.get('settled_at'), bank_settlement_ref=g.get('bank_settlement_ref')
        ))
    return result


@router.get("/exceptions/{client_id}/{transaction_id}/suggestions", response_model=List[SuggestedMatch])
async def get_suggestions(client_id: str, transaction_id: str):
    if client_id not in three_way_engines:
        raise HTTPException(status_code=404, detail="Client not found")
    engine = three_way_engines[client_id]
    suggestions = engine.get_suggested_matches(transaction_id)
    return [SuggestedMatch(
        order_id=s['order_id'], store_name=s['store_name'], amount=s['amount'],
        name_similarity=s['name_similarity'], amount_match=s['amount_match']
    ) for s in suggestions]


@router.post("/exceptions/{client_id}/{transaction_id}/action", response_model=ActionResponse)
async def take_action(client_id: str, transaction_id: str, action: ExceptionAction):
    if client_id not in matching_engines:
        raise HTTPException(status_code=404, detail="Client not found")
    engine = matching_engines[client_id]
    txn = next((r for r in engine.results if r['transaction_id'] == transaction_id), None)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    new_status = "resolved"
    message = ""
    action_type = action.action.value

    if action.action == ActionType.MANUAL_MATCH:
        if not action.order_id:
            raise HTTPException(status_code=400, detail="Order ID required for manual match")
        message = f"Transaction manually matched to order {action.order_id}"
    elif action.action == ActionType.CREATE_ORDER:
        message = "New order created from transaction"
    elif action.action == ActionType.MARK_DUPLICATE:
        new_status = "duplicate"; message = "Transaction marked as duplicate"
    elif action.action == ActionType.FLAG_REVIEW:
        new_status = "flagged"; message = "Transaction flagged for review"
    elif action.action == ActionType.REJECT:
        new_status = "rejected"; message = "Transaction rejected"
    elif action.action == ActionType.WRITE_OFF:
        new_status = "written_off"; message = "Transaction written off"

    db.save_exception_action(client_id, transaction_id, action_type, action.order_id, action.note, new_status)
    return ActionResponse(success=True, message=message, transaction_id=transaction_id, new_status=new_status)


@router.post("/run-matching/{client_id}", response_model=MatchingRunResponse)
async def run_matching(client_id: str):
    if client_id not in clients_data:
        raise HTTPException(status_code=404, detail="Client not found")
    client = clients_data[client_id]
    three_way_engine = ThreeWayMatchingEngine(client['bank_data'], client['gateway_data'], client['orders_data'])
    three_way_engine.run_matching()
    three_way_engines[client_id] = three_way_engine
    db.clear_exception_actions(client_id)
    db.clear_three_way_results(client_id)
    db.save_three_way_results(client_id, three_way_engine.results)
    stats = three_way_engine.get_statistics()
    db.save_matching_run(client_id, stats)
    engine = MatchingEngine(client['orders_data'], client['bank_data'])
    engine.run_matching()
    matching_engines[client_id] = engine
    db.save_matching_results(client_id, engine.results)
    return MatchingRunResponse(
        success=True,
        message=f"3-way matching completed. {stats['full_matches']} full matches, {stats['total_matched']} total matched.",
        stats=DashboardStats(
            total_transactions=stats['total_transactions'], tier1_matches=stats['tier1_matches'],
            tier2_matches=stats['tier2_matches'], total_matched=stats['total_matched'],
            unmatched=stats['unmatched'], needs_review=stats['needs_review'],
            match_rate=stats['match_rate'], tier1_rate=stats['tier1_rate'], tier2_rate=stats['tier2_rate'],
            total_amount=stats.get('total_amount', 0), matched_amount=stats.get('matched_amount', 0),
            unmatched_amount=stats.get('unmatched_amount', 0), full_matches=stats['full_matches'],
            bank_pg_only=stats['bank_pg_only'], pg_order_only=stats['pg_order_only'],
            bank_order_only=stats['bank_order_only'],
            total_gateway_transactions=stats['total_gateway_transactions'],
            total_variance=stats['total_variance']
        )
    )


@router.get("/transaction/{client_id}/{transaction_id}/details")
async def get_transaction_details(client_id: str, transaction_id: str):
    if client_id not in clients_data:
        raise HTTPException(status_code=404, detail="Client not found")
    client = clients_data[client_id]
    three_way_engine = three_way_engines.get(client_id)
    txn_result = None
    if three_way_engine:
        txn_result = next((r for r in three_way_engine.results if r.get('transaction_id') == transaction_id), None)
    if not txn_result:
        raise HTTPException(status_code=404, detail="Transaction not found")

    bank_raw = next((b for b in client['bank_data']
                     if b.get('Transaction ID', b.get('Transaction_ID')) == transaction_id), None)
    gateway_raw = None
    gateway_txn_id = txn_result.get('gateway_txn_id')
    if gateway_txn_id:
        gateway_raw = next((g for g in client.get('gateway_data', [])
                            if g.get('gateway_txn_id') == gateway_txn_id), None)
    order_raw = None
    order_id = txn_result.get('order_id')
    if order_id:
        order_items = [o for o in client['orders_data'] if o.get('order_id') == order_id]
        if order_items:
            order_raw = {
                'order_id': order_id, 'store_name': order_items[0].get('store_name'),
                'total_amount': order_items[0].get('total_amount_collected'),
                'order_date': order_items[0].get('order_date'),
                'order_status': order_items[0].get('order_status', order_items[0].get('status')),
                'city': order_items[0].get('store_city', order_items[0].get('city', order_items[0].get('City2'))),
                'line_items': len(order_items), 'raw_fields': order_items[0]
            }

    recon_status = txn_result.get('reconciliation_status', '')
    match_details = txn_result.get('match_details', {})
    if recon_status == ReconciliationStatus.FULL_MATCH.value:
        explanation = f"Full 3-way match: Bank → Gateway ({gateway_txn_id}) → Order ({order_id}). Path: {match_details.get('match_path', 'direct')}"
    elif recon_status == ReconciliationStatus.BANK_PG_ONLY.value:
        explanation = f"Partial match: Bank → Gateway ({gateway_txn_id}). Missing: Order record."
    elif recon_status == ReconciliationStatus.PG_ORDER_ONLY.value:
        explanation = f"Partial match: Gateway → Order ({order_id}). Missing: Bank settlement."
    elif recon_status == ReconciliationStatus.BANK_ORDER_ONLY.value:
        explanation = f"Direct match: Bank → Order ({order_id}). No payment gateway record."
    else:
        explanation = "No match found across Bank, Gateway, or Order records."

    return {
        'transaction': txn_result, 'bank_statement_raw': bank_raw,
        'gateway_raw': gateway_raw, 'order_raw': order_raw,
        'match_explanation': explanation, 'reconciliation_status': recon_status,
        'confidence': txn_result.get('confidence', 0), 'amount_variance': txn_result.get('amount_variance', 0)
    }


@router.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0", "database": "sqlite"}
