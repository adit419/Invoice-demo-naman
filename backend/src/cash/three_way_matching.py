"""
O2C Cash Application - 3-Way Matching Engine
Implements reconciliation between Bank Statement, Payment Gateway, and Revenue Orders
"""
import csv
import re
from difflib import SequenceMatcher
from typing import Dict, List, Tuple, Optional
from .models import ReconciliationStatus


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


def parse_amount(amount_str) -> int:
    """Parse amount string to integer, handling various formats."""
    if not amount_str:
        return 0
    if isinstance(amount_str, (int, float)):
        return int(amount_str)
    cleaned = str(amount_str).replace('"', '').replace(',', '').replace(' ', '')
    try:
        return int(float(cleaned))
    except (ValueError, TypeError):
        return 0


def extract_order_id(text: str) -> Optional[str]:
    """Extract Order ID from text if present."""
    if not text:
        return None
    match = re.search(r'(OD\d{9,})', text)
    if match:
        return match.group(1)
    return None


def extract_gateway_id(text: str) -> Optional[str]:
    """Extract Gateway transaction ID from text if present."""
    if not text:
        return None
    match = re.search(r'(PG\d{9,})', text)
    if match:
        return match.group(1)
    return None


def load_payment_gateway_data(filepath: str) -> List[Dict]:
    """Load payment gateway data from CSV."""
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append({
                'gateway_txn_id': row.get('gateway_txn_id', ''),
                'order_id': row.get('order_id', ''),
                'merchant_id': row.get('merchant_id', ''),
                'payment_method': row.get('payment_method', ''),
                'gateway_name': row.get('gateway_name', ''),
                'gross_amount': parse_amount(row.get('gross_amount', 0)),
                'fee_amount': parse_amount(row.get('fee_amount', 0)),
                'net_amount': parse_amount(row.get('net_amount', 0)),
                'currency': row.get('currency', 'IDR'),
                'status': row.get('status', ''),
                'customer_name': row.get('customer_name', ''),
                'payer_email': row.get('payer_email', ''),
                'initiated_at': row.get('initiated_at', ''),
                'completed_at': row.get('completed_at', ''),
                'settled_at': row.get('settled_at', ''),
                'bank_settlement_ref': row.get('bank_settlement_ref', '')
            })
    return data


class ThreeWayMatchingEngine:
    """
    3-Way Reconciliation Matching Engine

    Matches between:
    - Bank Statement (bank transactions)
    - Payment Gateway (payment processor records)
    - Revenue Orders (order system)

    Matching hierarchy:
    1. Bank → Gateway via bank_settlement_ref matching Reference field
    2. Gateway → Order via order_id field
    3. Bank → Order directly via Order ID in description (legacy)
    4. Fuzzy matching for remaining unmatched
    """

    def __init__(self, bank_transactions: List[Dict], gateway_transactions: List[Dict],
                 orders: List[Dict]):
        self.bank_transactions = bank_transactions
        self.gateway_transactions = gateway_transactions
        self.orders = orders

        # Build lookup indices
        self.order_lookup = self._build_order_lookup()
        self.gateway_by_ref = self._build_gateway_by_ref()
        self.gateway_by_order = self._build_gateway_by_order()

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

    def _build_gateway_by_ref(self) -> Dict:
        """Build lookup of gateway transactions by bank settlement reference."""
        lookup = {}
        for gw in self.gateway_transactions:
            ref = gw.get('bank_settlement_ref', '')
            if ref:
                lookup[ref] = gw
        return lookup

    def _build_gateway_by_order(self) -> Dict:
        """Build lookup of gateway transactions by order_id."""
        lookup = {}
        for gw in self.gateway_transactions:
            oid = gw.get('order_id', '')
            if oid:
                lookup[oid] = gw
        return lookup

    def run_matching(self) -> List[Dict]:
        """Run full 3-way matching process and return results."""
        self.results = []
        matched_order_ids = set()
        matched_gateway_ids = set()

        total = len(self.bank_transactions)
        print(f"  Processing {total} bank transactions...")

        for i, txn in enumerate(self.bank_transactions):
            if (i + 1) % 500 == 0 or i == 0:
                print(f"  Progress: {i + 1}/{total} transactions processed...")

            result = self._match_transaction(txn, matched_order_ids, matched_gateway_ids)
            self.results.append(result)

            if result.get('order_id'):
                matched_order_ids.add(result['order_id'])
            if result.get('gateway_txn_id'):
                matched_gateway_ids.add(result['gateway_txn_id'])

        print(f"  Completed: {total} transactions processed")
        return self.results

    def _match_transaction(self, txn: Dict, matched_order_ids: set,
                           matched_gateway_ids: set) -> Dict:
        """Match a single bank transaction using 3-way reconciliation."""
        txn_id = txn.get('Transaction_ID', txn.get('Transaction ID', ''))
        description = txn.get('Description', '')
        name = txn.get('Name', '')
        amount = parse_amount(txn.get('Amount', 0))
        txn_date = txn.get('Transaction_Date', txn.get('date', ''))
        reference = txn.get('Reference', '')
        channel = txn.get('Payment_Channel', txn.get('Payment Channel', ''))

        result = {
            'transaction_id': txn_id,
            'bank_amount': amount,
            'bank_name': name,
            'bank_description': description,
            'bank_date': txn_date,
            'bank_reference': reference,
            'payment_channel': channel,
            'gateway_txn_id': None,
            'gateway_amount': None,
            'gateway_fee': None,
            'gateway_net': None,
            'gateway_name': None,
            'gateway_status': None,
            'order_id': None,
            'order_amount': None,
            'order_store_name': None,
            'order_date': None,
            'reconciliation_status': ReconciliationStatus.UNMATCHED.value,
            'confidence': 0.0,
            'amount_variance': 0,
            'match_details': {}
        }

        # TIER 1: Match Bank → Gateway via Reference
        gateway = None
        if reference and reference in self.gateway_by_ref:
            gw = self.gateway_by_ref[reference]
            if gw['gateway_txn_id'] not in matched_gateway_ids:
                gateway = gw

        # TIER 2: If we found a gateway, try Gateway → Order via order_id
        order = None
        if gateway:
            result['gateway_txn_id'] = gateway['gateway_txn_id']
            result['gateway_amount'] = gateway['gross_amount']
            result['gateway_fee'] = gateway['fee_amount']
            result['gateway_net'] = gateway['net_amount']
            result['gateway_name'] = gateway['gateway_name']
            result['gateway_status'] = gateway['status']

            order_id = gateway.get('order_id', '')
            if order_id and order_id in self.order_lookup:
                if order_id not in matched_order_ids:
                    order = self.order_lookup[order_id]

        # If we have both Gateway and Order - FULL 3-WAY MATCH
        if gateway and order:
            result['order_id'] = order['order_id']
            result['order_amount'] = order['amount']
            result['order_store_name'] = order['store_name']
            result['order_date'] = order['order_date']
            result['reconciliation_status'] = ReconciliationStatus.FULL_MATCH.value
            result['confidence'] = 1.0
            result['amount_variance'] = self._calculate_variance(
                amount, gateway['gross_amount'], order['amount']
            )
            result['match_details'] = {
                'match_path': 'bank→gateway→order',
                'gateway_link': 'bank_settlement_ref',
                'order_link': 'gateway_order_id'
            }
            return result

        # If we have Gateway but no Order - BANK_PG_ONLY
        if gateway and not order:
            result['reconciliation_status'] = ReconciliationStatus.BANK_PG_ONLY.value
            result['confidence'] = 0.8
            result['amount_variance'] = abs(amount - gateway['net_amount'])
            result['match_details'] = {
                'match_path': 'bank→gateway',
                'gateway_link': 'bank_settlement_ref',
                'missing': 'order'
            }
            return result

        # TIER 3: Direct Bank → Order matching (legacy, no gateway)
        order_id_from_desc = extract_order_id(description)
        if order_id_from_desc and order_id_from_desc in self.order_lookup:
            if order_id_from_desc not in matched_order_ids:
                order = self.order_lookup[order_id_from_desc]

                # Check if there's a gateway for this order (PG-Order only)
                if order_id_from_desc in self.gateway_by_order:
                    gw = self.gateway_by_order[order_id_from_desc]
                    result['gateway_txn_id'] = gw['gateway_txn_id']
                    result['gateway_amount'] = gw['gross_amount']
                    result['gateway_fee'] = gw['fee_amount']
                    result['gateway_net'] = gw['net_amount']
                    result['gateway_name'] = gw['gateway_name']
                    result['gateway_status'] = gw['status']

                    result['order_id'] = order['order_id']
                    result['order_amount'] = order['amount']
                    result['order_store_name'] = order['store_name']
                    result['order_date'] = order['order_date']
                    result['reconciliation_status'] = ReconciliationStatus.FULL_MATCH.value
                    result['confidence'] = 0.95
                    result['amount_variance'] = self._calculate_variance(
                        amount, gw['gross_amount'], order['amount']
                    )
                    result['match_details'] = {
                        'match_path': 'bank→order (id in desc)→gateway',
                        'order_link': 'order_id_in_description',
                        'gateway_link': 'order_id'
                    }
                    return result
                else:
                    # Bank-Order only, no gateway
                    result['order_id'] = order['order_id']
                    result['order_amount'] = order['amount']
                    result['order_store_name'] = order['store_name']
                    result['order_date'] = order['order_date']
                    result['reconciliation_status'] = ReconciliationStatus.BANK_ORDER_ONLY.value
                    result['confidence'] = 0.9
                    result['amount_variance'] = abs(amount - order['amount'])
                    result['match_details'] = {
                        'match_path': 'bank→order',
                        'order_link': 'order_id_in_description',
                        'missing': 'gateway'
                    }
                    return result

        # TIER 4: Fuzzy matching for remaining unmatched
        fuzzy_match = self._fuzzy_match(name, description, amount,
                                         matched_order_ids, matched_gateway_ids)
        if fuzzy_match:
            result.update(fuzzy_match)
            return result

        # No match found
        result['reconciliation_status'] = ReconciliationStatus.UNMATCHED.value
        result['confidence'] = 0.0
        result['match_details'] = {'match_path': 'none'}
        return result

    def _fuzzy_match(self, name: str, description: str, amount: int,
                     matched_order_ids: set, matched_gateway_ids: set) -> Optional[Dict]:
        """Find best fuzzy match based on name similarity and amount."""
        normalized_name = normalize_name(name)
        normalized_desc = normalize_name(description)

        best_match = None
        best_score = 0.0
        candidates_checked = 0
        best_candidate_info = None

        for order_id, order in self.order_lookup.items():
            if order_id in matched_order_ids:
                continue

            candidates_checked += 1
            order_name = self.normalized_order_names.get(order_id, '')
            order_amount = order['amount']

            # Calculate name similarity
            name_sim = max(
                similarity(normalized_name, order_name),
                similarity(normalized_desc, order_name)
            )

            # Calculate amount match
            amount_match = 0.0
            if amount and order_amount:
                if amount == order_amount:
                    amount_match = 1.0
                else:
                    amount_diff = abs(amount - order_amount) / max(amount, order_amount)
                    if amount_diff < 0.05:
                        amount_match = 0.9
                    elif amount_diff < 0.10:
                        amount_match = 0.7

            # Combined score - lowered thresholds for more fuzzy matches
            score = 0.0
            if name_sim > 0.85 and amount_match >= 0.9:
                score = (name_sim * 0.5 + amount_match * 0.5)
            elif name_sim > 0.7 and amount_match == 1.0:
                score = (name_sim * 0.4 + amount_match * 0.6)
            elif name_sim > 0.6 and amount_match >= 0.9:
                score = (name_sim * 0.4 + amount_match * 0.6)
            elif name_sim > 0.09 and amount_match >= 0.7:
                # Lower threshold for partial matches
                score = (name_sim * 0.3 + amount_match * 0.7)
            elif amount_match == 1.0 and name_sim > 0.09:
                # Exact amount match with any name similarity above 9%
                score = (name_sim * 0.2 + amount_match * 0.8)

            # Track best candidate even if it doesn't meet threshold
            if name_sim > 0.3 or amount_match > 0:
                if best_candidate_info is None or (name_sim + amount_match) > (best_candidate_info['name_sim'] + best_candidate_info['amount_match']):
                    best_candidate_info = {
                        'order_id': order_id,
                        'name_sim': name_sim,
                        'amount_match': amount_match,
                        'score': score,
                        'bank_amt': amount,
                        'order_amt': order_amount
                    }

            if score > best_score and score >= 0.09:
                best_score = score

                # Check if there's a gateway for this order
                gateway_data = {}
                recon_status = ReconciliationStatus.BANK_ORDER_ONLY.value
                if order_id in self.gateway_by_order:
                    gw = self.gateway_by_order[order_id]
                    if gw['gateway_txn_id'] not in matched_gateway_ids:
                        gateway_data = {
                            'gateway_txn_id': gw['gateway_txn_id'],
                            'gateway_amount': gw['gross_amount'],
                            'gateway_fee': gw['fee_amount'],
                            'gateway_net': gw['net_amount'],
                            'gateway_name': gw['gateway_name'],
                            'gateway_status': gw['status']
                        }
                        recon_status = ReconciliationStatus.FULL_MATCH.value

                best_match = {
                    'order_id': order_id,
                    'order_amount': order_amount,
                    'order_store_name': order['store_name'],
                    'order_date': order['order_date'],
                    'reconciliation_status': recon_status,
                    'confidence': round(score, 2),
                    'amount_variance': abs(amount - order_amount),
                    'match_details': {
                        'match_path': 'fuzzy',
                        'name_similarity': round(name_sim, 2),
                        'amount_match': round(amount_match, 2)
                    },
                    **gateway_data
                }

        return best_match

    def _calculate_variance(self, bank_amt: int, gateway_amt: int, order_amt: int) -> int:
        """Calculate total amount variance across the three sources."""
        if not all([bank_amt, gateway_amt, order_amt]):
            return 0
        max_amt = max(bank_amt, gateway_amt, order_amt)
        min_amt = min(bank_amt, gateway_amt, order_amt)
        return max_amt - min_amt

    def get_statistics(self) -> Dict:
        """Get 3-way matching statistics."""
        if not self.results:
            self.run_matching()

        total = len(self.results)
        full_matches = sum(1 for r in self.results
                          if r['reconciliation_status'] == ReconciliationStatus.FULL_MATCH.value)
        bank_pg = sum(1 for r in self.results
                      if r['reconciliation_status'] == ReconciliationStatus.BANK_PG_ONLY.value)
        pg_order = sum(1 for r in self.results
                       if r['reconciliation_status'] == ReconciliationStatus.PG_ORDER_ONLY.value)
        bank_order = sum(1 for r in self.results
                         if r['reconciliation_status'] == ReconciliationStatus.BANK_ORDER_ONLY.value)
        unmatched = sum(1 for r in self.results
                        if r['reconciliation_status'] == ReconciliationStatus.UNMATCHED.value)

        total_matched = full_matches + bank_pg + pg_order + bank_order

        # Calculate amounts
        total_amount = sum(r['bank_amount'] for r in self.results)
        matched_amount = sum(r['bank_amount'] for r in self.results
                            if r['reconciliation_status'] != ReconciliationStatus.UNMATCHED.value)
        unmatched_amount = sum(r['bank_amount'] for r in self.results
                               if r['reconciliation_status'] == ReconciliationStatus.UNMATCHED.value)
        total_variance = sum(r.get('amount_variance', 0) for r in self.results)

        return {
            'total_transactions': total,
            'full_matches': full_matches,
            'bank_pg_only': bank_pg,
            'pg_order_only': pg_order,
            'bank_order_only': bank_order,
            'total_matched': total_matched,
            'unmatched': unmatched,
            'match_rate': round(total_matched / total * 100, 1) if total > 0 else 0,
            'total_amount': total_amount,
            'matched_amount': matched_amount,
            'unmatched_amount': unmatched_amount,
            'total_variance': total_variance,
            'total_gateway_transactions': len(self.gateway_transactions),
            # Legacy compatibility
            'tier1_matches': full_matches + bank_order,
            'tier2_matches': bank_pg + pg_order,
            'needs_review': bank_pg + pg_order,
            'tier1_rate': round((full_matches + bank_order) / total * 100, 1) if total > 0 else 0,
            'tier2_rate': round((bank_pg + pg_order) / total * 100, 1) if total > 0 else 0
        }

    def get_matched(self) -> List[Dict]:
        """Get all matched transactions (full or partial matches)."""
        if not self.results:
            self.run_matching()
        return [r for r in self.results
                if r['reconciliation_status'] != ReconciliationStatus.UNMATCHED.value]

    def get_exceptions(self) -> List[Dict]:
        """Get all unmatched/exception transactions."""
        if not self.results:
            self.run_matching()
        return [r for r in self.results
                if r['reconciliation_status'] == ReconciliationStatus.UNMATCHED.value]

    def get_partial_matches(self) -> List[Dict]:
        """Get partial matches (2-of-3 only)."""
        if not self.results:
            self.run_matching()
        partial_statuses = [
            ReconciliationStatus.BANK_PG_ONLY.value,
            ReconciliationStatus.PG_ORDER_ONLY.value,
            ReconciliationStatus.BANK_ORDER_ONLY.value
        ]
        return [r for r in self.results if r['reconciliation_status'] in partial_statuses]

    def get_suggested_matches(self, transaction_id: str, limit: int = 5) -> List[Dict]:
        """Get suggested matches for an unmatched transaction."""
        txn = next((r for r in self.results if r['transaction_id'] == transaction_id), None)
        if not txn:
            return []

        name = txn.get('bank_name', '')
        description = txn.get('bank_description', '')
        amount = txn.get('bank_amount', 0)

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
                # Check if there's a gateway for this order
                gateway_info = None
                if order_id in self.gateway_by_order:
                    gw = self.gateway_by_order[order_id]
                    gateway_info = {
                        'gateway_txn_id': gw['gateway_txn_id'],
                        'gateway_amount': gw['gross_amount'],
                        'gateway_name': gw['gateway_name']
                    }

                suggestions.append({
                    'order_id': order_id,
                    'store_name': order['store_name'],
                    'amount': order['amount'],
                    'name_similarity': round(name_sim, 2),
                    'amount_match': amount == order['amount'],
                    'gateway': gateway_info
                })

        suggestions.sort(key=lambda x: x['name_similarity'], reverse=True)
        return suggestions[:limit]
