"""
O2C Cash Application - SQLite Database Module
"""
import sqlite3
import json
import os
from typing import List, Dict, Optional
from contextlib import contextmanager

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'o2c_data.db')


@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS matching_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL,
                transaction_id TEXT NOT NULL,
                description TEXT, name TEXT, amount INTEGER,
                transaction_date TEXT, payment_channel TEXT, match_type TEXT,
                matched_order_id TEXT, matched_store_name TEXT, matched_amount INTEGER,
                confidence REAL, status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_id, transaction_id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS exception_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
                action_type TEXT NOT NULL, order_id TEXT, note TEXT, new_status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_id, transaction_id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS matching_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL, total_transactions INTEGER,
                tier1_matches INTEGER, tier2_matches INTEGER,
                unmatched INTEGER, match_rate REAL,
                run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS three_way_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
                bank_amount INTEGER, bank_name TEXT, bank_description TEXT,
                bank_date TEXT, bank_reference TEXT,
                gateway_txn_id TEXT, gateway_amount INTEGER, gateway_fee INTEGER,
                gateway_net INTEGER, gateway_name TEXT, gateway_status TEXT,
                order_id TEXT, order_amount INTEGER, order_store_name TEXT, order_date TEXT,
                reconciliation_status TEXT, confidence REAL, amount_variance INTEGER DEFAULT 0,
                match_details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_id, transaction_id)
            )
        ''')
        conn.commit()
        print(f"Cash DB initialized at {DATABASE_PATH}")


def save_matching_results(client_id: str, results: List[Dict]):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM matching_results WHERE client_id = ?', (client_id,))
        batch_data = [
            (client_id, r.get('transaction_id'), r.get('description'), r.get('name'),
             r.get('amount'), r.get('transaction_date'), r.get('payment_channel'),
             r.get('match_type'), r.get('matched_order_id'), r.get('matched_store_name'),
             r.get('matched_amount'), r.get('confidence'), r.get('status'))
            for r in results
        ]
        cursor.executemany('''
            INSERT INTO matching_results
            (client_id, transaction_id, description, name, amount, transaction_date,
             payment_channel, match_type, matched_order_id, matched_store_name,
             matched_amount, confidence, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', batch_data)
        conn.commit()


def get_matching_results(client_id: str) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM matching_results WHERE client_id = ?', (client_id,))
        return [dict(row) for row in cursor.fetchall()]


def save_exception_action(client_id, transaction_id, action_type, order_id, note, new_status):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO exception_actions
            (client_id, transaction_id, action_type, order_id, note, new_status)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (client_id, transaction_id, action_type, order_id, note, new_status))
        cursor.execute('''
            UPDATE matching_results
            SET status = ?, match_type = CASE WHEN ? = 'manual_match' THEN 'manual' ELSE match_type END,
                matched_order_id = COALESCE(?, matched_order_id)
            WHERE client_id = ? AND transaction_id = ?
        ''', (new_status, action_type, order_id, client_id, transaction_id))
        conn.commit()


def get_exception_actions(client_id: str) -> Dict[str, Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM exception_actions WHERE client_id = ?', (client_id,))
        return {row['transaction_id']: dict(row) for row in cursor.fetchall()}


def clear_exception_actions(client_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM exception_actions WHERE client_id = ?', (client_id,))
        conn.commit()


def save_matching_run(client_id: str, stats: Dict):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO matching_runs
            (client_id, total_transactions, tier1_matches, tier2_matches, unmatched, match_rate)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (client_id, stats.get('total_transactions'), stats.get('tier1_matches'),
              stats.get('tier2_matches'), stats.get('unmatched'), stats.get('match_rate')))
        conn.commit()


def has_matching_results(client_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) as count FROM matching_results WHERE client_id = ?', (client_id,))
        return cursor.fetchone()['count'] > 0


def get_results_with_actions(client_id: str) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT mr.*, ea.action_type, ea.note as action_note
            FROM matching_results mr
            LEFT JOIN exception_actions ea
                ON mr.client_id = ea.client_id AND mr.transaction_id = ea.transaction_id
            WHERE mr.client_id = ?
        ''', (client_id,))
        return [dict(row) for row in cursor.fetchall()]


def save_three_way_results(client_id: str, results: List[Dict]):
    print(f"  Saving {len(results)} results to DB...")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM three_way_results WHERE client_id = ?', (client_id,))
        batch_data = []
        for r in results:
            md = r.get('match_details')
            if md and isinstance(md, dict):
                md = json.dumps(md)
            batch_data.append((
                client_id, r.get('transaction_id'), r.get('bank_amount'), r.get('bank_name'),
                r.get('bank_description'), r.get('bank_date'), r.get('bank_reference'),
                r.get('gateway_txn_id'), r.get('gateway_amount'), r.get('gateway_fee'),
                r.get('gateway_net'), r.get('gateway_name'), r.get('gateway_status'),
                r.get('order_id'), r.get('order_amount'), r.get('order_store_name'),
                r.get('order_date'), r.get('reconciliation_status'), r.get('confidence'),
                r.get('amount_variance', 0), md
            ))
        cursor.executemany('''
            INSERT INTO three_way_results
            (client_id, transaction_id, bank_amount, bank_name, bank_description,
             bank_date, bank_reference, gateway_txn_id, gateway_amount, gateway_fee,
             gateway_net, gateway_name, gateway_status, order_id, order_amount,
             order_store_name, order_date, reconciliation_status, confidence,
             amount_variance, match_details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', batch_data)
        conn.commit()
        print("  DB save complete")


def get_three_way_results(client_id: str) -> List[Dict]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM three_way_results WHERE client_id = ?', (client_id,))
        results = []
        for row in cursor.fetchall():
            r = dict(row)
            if r.get('match_details'):
                try:
                    r['match_details'] = json.loads(r['match_details'])
                except Exception:
                    r['match_details'] = {}
            results.append(r)
        return results


def has_three_way_results(client_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) as count FROM three_way_results WHERE client_id = ?', (client_id,))
        return cursor.fetchone()['count'] > 0


def clear_three_way_results(client_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM three_way_results WHERE client_id = ?', (client_id,))
        conn.commit()
