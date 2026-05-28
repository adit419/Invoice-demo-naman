"""
O2C Cash Application - AI-Powered Matching using Claude API
Uses Anthropic's Claude to analyze transaction context and suggest matches
Supports 3-way reconciliation: Bank Statement ↔ Payment Gateway ↔ Revenue Orders
"""
import os
import json
from typing import List, Dict, Optional
import anthropic

# Initialize Anthropic client
client = None

def init_client(api_key: str = None):
    """Initialize the Anthropic client with API key."""
    global client
    key = api_key or os.environ.get('ANTHROPIC_API_KEY')
    if key:
        client = anthropic.Anthropic(api_key=key)
        return True
    return False


def get_ai_match_suggestions(
    transaction: Dict,
    candidate_orders: List[Dict],
    gateway_data: List[Dict] = None,
    max_suggestions: int = 5
) -> Dict:
    """
    Use Claude to analyze a transaction and suggest potential order matches.
    Supports 3-way reconciliation with optional gateway data.

    Args:
        transaction: Bank statement transaction data
        candidate_orders: List of potential order matches to evaluate
        gateway_data: Optional list of payment gateway transactions
        max_suggestions: Maximum number of suggestions to return

    Returns:
        Dict with AI analysis and ranked suggestions
    """
    global client

    if not client:
        # Try to initialize with environment variable
        if not init_client():
            return {
                'success': False,
                'error': 'Claude API not configured. Set ANTHROPIC_API_KEY environment variable.',
                'suggestions': []
            }

    # Prepare transaction summary
    txn_summary = f"""
Transaction to match:
- Transaction ID: {transaction.get('transaction_id', 'N/A')}
- Payer Name: {transaction.get('name', transaction.get('bank_name', 'N/A'))}
- Description: {transaction.get('description', transaction.get('bank_description', 'N/A'))}
- Amount: {transaction.get('amount', transaction.get('bank_amount', 0)):,} IDR
- Date: {transaction.get('transaction_date', transaction.get('bank_date', 'N/A'))}
- Payment Channel: {transaction.get('payment_channel', 'N/A')}
- Bank Reference: {transaction.get('bank_reference', 'N/A')}
"""

    # Add gateway info if available
    gateway_summary = ""
    if gateway_data:
        gateway_summary = "\nPayment Gateway Records (potential links):\n"
        for i, gw in enumerate(gateway_data[:5], 1):
            gateway_summary += f"""
Gateway {i}:
- Gateway TXN ID: {gw.get('gateway_txn_id', 'N/A')}
- Order ID: {gw.get('order_id', 'N/A')}
- Gateway: {gw.get('gateway_name', 'N/A')}
- Amount: {gw.get('gross_amount', 0):,} IDR
- Fee: {gw.get('fee_amount', 0):,} IDR
- Net Amount: {gw.get('net_amount', 0):,} IDR
- Status: {gw.get('status', 'N/A')}
- Bank Ref: {gw.get('bank_settlement_ref', 'N/A')}
"""

    # Prepare candidate orders (limit to top 10 for context window)
    orders_summary = "Candidate Orders to match against:\n"
    for i, order in enumerate(candidate_orders[:10], 1):
        # Check if order has gateway info attached
        gateway_info = order.get('gateway', {})
        gateway_note = ""
        if gateway_info:
            gateway_note = f"  (Has Gateway: {gateway_info.get('gateway_txn_id', 'N/A')})"

        orders_summary += f"""
Order {i}:{gateway_note}
- Order ID: {order.get('order_id', 'N/A')}
- Store Name: {order.get('store_name', 'N/A')}
- Amount: {order.get('amount', 0):,} IDR
- City: {order.get('city', 'N/A')}
- Order Date: {order.get('order_date', 'N/A')}
"""

    prompt = f"""You are an expert in Order-to-Cash reconciliation for a B2B retail business in Indonesia.

Your task is to analyze a bank transaction and determine which order(s) it most likely corresponds to.
This is a 3-WAY RECONCILIATION system that matches: Bank Statement ↔ Payment Gateway ↔ Revenue Orders.

{txn_summary}
{gateway_summary}
{orders_summary}

MATCHING CRITERIA FOR 3-WAY RECONCILIATION:
1. **Bank → Gateway Link**: Bank Reference should match Gateway's bank_settlement_ref
2. **Gateway → Order Link**: Gateway's order_id should match Order's order_id
3. **Amount Reconciliation**:
   - Bank Amount should equal Gateway Net Amount (gross - fees)
   - Gateway Gross Amount should equal Order Amount
   - Small differences (<2%) might be due to rounding

4. **Name Matching**: Indonesian store names often have prefixes like "Toko", "Warung", "TK", "CV", "PT".
   - "Toko Heri" and "Warung Heri" likely refer to the same store
   - Names may have typos or abbreviations

5. **Date Proximity**: Payment usually comes within 1-30 days of order

6. **Context Clues**:
   - Description field may contain order references (OD prefix)
   - Gateway transaction IDs (PG prefix)
   - City/region matching can help validate

Analyze each candidate and provide your assessment.

Respond in JSON format:
{{
    "analysis": "Your overall analysis including which reconciliation path is viable (Bank→Gateway→Order, Bank→Order, etc.)",
    "suggestions": [
        {{
            "order_id": "the order ID",
            "confidence": 0.0-1.0,
            "reasoning": "Why this order matches or doesn't match",
            "match_factors": ["list", "of", "matching", "factors"],
            "risk_factors": ["potential", "issues", "or", "concerns"],
            "reconciliation_path": "full_match|bank_pg_only|pg_order_only|bank_order_only"
        }}
    ],
    "recommendation": "Your final recommendation - which order to match or if manual review is needed"
}}

Only include orders with confidence > 0.3 in suggestions. Rank by confidence descending.
"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # Parse response
        response_text = message.content[0].text

        # Try to extract JSON from response
        try:
            # Find JSON in response
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                result = json.loads(json_str)
                result['success'] = True
                return result
        except json.JSONDecodeError:
            pass

        # If JSON parsing fails, return raw analysis
        return {
            'success': True,
            'analysis': response_text,
            'suggestions': [],
            'recommendation': 'See analysis above'
        }

    except anthropic.APIError as e:
        return {
            'success': False,
            'error': f'Claude API error: {str(e)}',
            'suggestions': []
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'Error: {str(e)}',
            'suggestions': []
        }


def explain_match(transaction: Dict, matched_order: Dict, match_type: str,
                  gateway: Dict = None, reconciliation_status: str = None) -> str:
    """
    Use Claude to provide a human-readable explanation of why a match was made.
    Supports 3-way reconciliation context.
    """
    global client

    if not client:
        if not init_client():
            return "AI explanation not available - API key not configured."

    # Build context based on available data
    gateway_info = ""
    if gateway:
        gateway_info = f"""
PAYMENT GATEWAY:
- Gateway TXN ID: {gateway.get('gateway_txn_id', 'N/A')}
- Gateway: {gateway.get('gateway_name', 'N/A')}
- Gross Amount: {gateway.get('gross_amount', 0):,} IDR
- Fee: {gateway.get('fee_amount', 0):,} IDR
- Net Amount: {gateway.get('net_amount', 0):,} IDR
- Status: {gateway.get('status', 'N/A')}
"""

    recon_info = ""
    if reconciliation_status:
        status_desc = {
            'full_match': 'Full 3-way match (Bank → Gateway → Order)',
            'bank_pg_only': 'Partial match (Bank → Gateway only, missing Order)',
            'pg_order_only': 'Partial match (Gateway → Order only, missing Bank)',
            'bank_order_only': 'Direct match (Bank → Order, no Gateway)'
        }
        recon_info = f"\nReconciliation Status: {status_desc.get(reconciliation_status, reconciliation_status)}"

    prompt = f"""Explain in 2-3 sentences why this bank transaction was matched to this order in a 3-way reconciliation system:

BANK TRANSACTION:
- Payer: {transaction.get('name', transaction.get('bank_name', 'N/A'))}
- Description: {transaction.get('description', transaction.get('bank_description', 'N/A'))}
- Amount: {transaction.get('amount', transaction.get('bank_amount', 0)):,} IDR
- Reference: {transaction.get('bank_reference', 'N/A')}
{gateway_info}
MATCHED ORDER:
- Order ID: {matched_order.get('order_id', 'N/A')}
- Store: {matched_order.get('store_name', 'N/A')}
- Amount: {matched_order.get('amount', matched_order.get('order_amount', 0)):,} IDR

Match Type: {match_type}{recon_info}

Provide a clear, concise explanation suitable for a finance user reviewing the 3-way reconciliation match.
"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        return message.content[0].text
    except Exception as e:
        return f"AI explanation unavailable: {str(e)}"


def batch_analyze_exceptions(
    exceptions: List[Dict],
    orders_lookup: Dict,
    limit: int = 10
) -> List[Dict]:
    """
    Analyze multiple exceptions and provide AI suggestions for each.

    Args:
        exceptions: List of unmatched transactions
        orders_lookup: Dictionary of all orders
        limit: Maximum exceptions to analyze (to manage API costs)

    Returns:
        List of exceptions with AI suggestions added
    """
    results = []

    for txn in exceptions[:limit]:
        # Get candidate orders (simplified - in production would use better filtering)
        candidates = list(orders_lookup.values())[:20]

        ai_result = get_ai_match_suggestions(txn, candidates)

        results.append({
            'transaction_id': txn.get('transaction_id'),
            'ai_analysis': ai_result
        })

    return results
