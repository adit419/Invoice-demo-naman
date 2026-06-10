# Connector Studio - Build Specification

**Version**: 1.0
**Date**: 2026-06-09
**Target Users**: Finance Operations, Treasury, IT Admins
**Complexity Level**: Enterprise-grade integration hub

---

## Table of Contents

1. [Overview & Vision](#overview--vision)
2. [Architecture](#architecture)
3. [Integration Types & Protocols](#integration-types--protocols)
4. [Screen Designs](#screen-designs)
5. [Data Models](#data-models)
6. [Workflows](#workflows)
7. [Enterprise Look & Feel](#enterprise-look--feel)
8. [Implementation Plan](#implementation-plan)

---

## Overview & Vision

### Purpose
Connector Studio is the **centralized integration hub** for the Cash Application system. It manages bidirectional data flows between:
- **External Systems**: Banks, PSPs (Adyen, Stripe, PayPal, GrabPay, etc.)
- **Internal Systems**: OMS, Data Lake, Ledger Service, Sales Service
- **ERP Systems**: Oracle Fusion, SAP, NetSuite, Dynamics 365

### Key Capabilities
1. **Visual Configuration**: No-code connector setup with drag-and-drop field mapping
2. **Multi-Protocol Support**: SFTP, API (REST/SOAP), Email, Webhook, Database
3. **Canonical Mapping**: Transform diverse formats into unified data schema
4. **Scheduled Execution**: Configure daily/hourly recon runs with retry logic
5. **Historic Monitoring**: 90-day run history with detailed logs and error analysis
6. **Enterprise Security**: Encrypted credential storage, RBAC, audit trail

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CONNECTOR STUDIO                             │
│                      (Configuration & Orchestration)                 │
└───────────────┬─────────────────────────────────────────────────────┘
                │
        ┌───────┴────────┐
        │                │
┌───────▼──────┐  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────┐
│  CONNECTOR   │  │   SCHEDULER  │  │   MAPPER     │  │   MONITOR    │
│   MANAGER    │  │   ENGINE     │  │   ENGINE     │  │   & LOGGER   │
│              │  │              │  │              │  │              │
│ • Create     │  │ • Cron Jobs  │  │ • Field Map  │  │ • Run Status │
│ • Update     │  │ • Manual Run │  │ • Transform  │  │ • Error Logs │
│ • Test       │  │ • Retry      │  │ • Validate   │  │ • Alerting   │
│ • Delete     │  │ • Parallel   │  │ • Enrich     │  │ • Metrics    │
└───────┬──────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
        │                │                  │                  │
        └────────────────┴──────────────────┴──────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │                                                │
┌───────▼──────────┐  ┌──────────────┐  ┌──────────────▼──────────┐
│   DATA SOURCES    │  │ CANONICAL DB │  │   DATA DESTINATIONS     │
│                   │  │              │  │                         │
│ • Banks (SFTP)    │  │ • Normalized │  │ • OMS (REST API)        │
│ • PSPs (API)      │◄─┤   Schema     ├─►│ • Data Lake (S3)        │
│ • Email (IMAP)    │  │ • Staging    │  │ • Ledger (GraphQL)      │
│ • Webhooks        │  │ • Archive    │  │ • ERP (SOAP/REST)       │
└───────────────────┘  └──────────────┘  └─────────────────────────┘
```

### Data Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  FETCH   │────►│ VALIDATE │────►│   MAP    │────►│ ENRICH   │────►│  LOAD    │
│          │     │          │     │          │     │          │     │          │
│ • SFTP   │     │ • Format │     │ • Field  │     │ • Lookup │     │ • Target │
│ • API    │     │ • Schema │     │   Map    │     │ • Join   │     │   System │
│ • Email  │     │ • Dedupe │     │ • Rules  │     │ • Calc   │     │ • Commit │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

---

## Integration Types & Protocols

### 1. Bank Integrations

#### Protocol: **SFTP** (primary), **API** (modern banks)

**Configuration Required:**
- Host, Port, Username, Password/Key
- Directory path (inbound/outbound)
- File naming pattern (e.g., `SETTLEMENT_YYYYMMDD_*.csv`)
- Polling schedule (e.g., every 6 hours)

**Common Banks:**
- DBS (Singapore) - SFTP
- OCBC (Singapore) - SFTP
- BCA (Indonesia) - SFTP + API
- Mandiri (Indonesia) - SFTP

**File Formats:**
- CSV, Fixed-width, MT940 (SWIFT), BAI2, CAMT.053 (ISO 20022)

**Canonical Fields:**
```
Bank Statement Line:
  - statementDate: date
  - valueDate: date
  - accountNumber: string
  - amount: decimal
  - currency: string (ISO 4217)
  - narration: string
  - transactionRef: string
  - balanceAfter: decimal
```

---

### 2. PSP Integrations

#### Protocol: **REST API** (primary), **SFTP** (batch files)

#### 2A. Adyen

**API Endpoints:**
```
Base URL: https://cal-live.adyen.com/cal/services/Reports/v1

Endpoints:
  - POST /getReportsList
  - POST /downloadReport
  - POST /getPayoutDetail

Authentication: API Key (X-API-Key header)
Rate Limit: 1000 requests/hour
```

**Settlement File Structure:**
```json
{
  "merchantAccount": "GrabSG",
  "pspReference": "8816178952360455",
  "payoutDate": "2026-06-06",
  "grossAmount": 500000.00,
  "commission": 12500.00,
  "netAmount": 487500.00,
  "currency": "SGD",
  "transactions": [
    {
      "txnId": "PSP-2026-88421",
      "grossAmount": 248.00,
      "mdrRate": 2.50,
      "mdrAmount": 6.20,
      "netAmount": 241.80
    }
  ]
}
```

**Canonical Fields:**
```
PSP Settlement:
  - pspId: string
  - settlementRef: string
  - settlementDate: date
  - currency: string
  - grossAmount: decimal
  - mdrFee: decimal
  - taxOnMDR: decimal
  - fxMargin: decimal
  - rollingReserve: decimal
  - netAmount: decimal
  - transactionCount: integer

PSP Transaction:
  - pspTxnId: string
  - orderId: string
  - txnDate: datetime
  - grossAmount: decimal
  - mdrRate: decimal
  - mdrAmount: decimal
  - netAmount: decimal
  - paymentMethod: string
```

#### 2B. Stripe

**API Endpoints:**
```
Base URL: https://api.stripe.com/v1

Endpoints:
  - GET /balance_transactions
  - GET /payouts
  - GET /charges
  - GET /reporting/report_runs

Authentication: Bearer Token (Authorization header)
Rate Limit: 100 requests/second
```

**Canonical Mapping:**
```
Stripe Field               → Canonical Field
-----------------------------------------------
balance_transaction.id     → pspTxnId
balance_transaction.amount → grossAmount (cents → dollars)
balance_transaction.fee    → mdrAmount
balance_transaction.net    → netAmount
balance_transaction.currency → currency (lowercase → uppercase)
payout.id                  → settlementRef
payout.arrival_date        → settlementDate
```

#### 2C. GrabPay, OVO, GoPay, DOKU (Southeast Asia PSPs)

**Protocol**: SFTP (daily settlement files) + Webhook (real-time notifications)

**File Format**: CSV with custom headers

**Example GrabPay Settlement File:**
```csv
SettlementID,MerchantID,SettlementDate,TransactionID,OrderID,GrossAmount,MDR,ServiceFee,NetAmount,Currency
GP-20260606-001,GRAB-SG-001,2026-06-06,TXN-88421,ORD-2026-88421,248.00,6.20,0.00,241.80,SGD
```

**Webhook Events:**
```json
{
  "event": "payout.created",
  "pspId": "grabpay",
  "payoutRef": "GP-20260606-001",
  "amount": 487500.00,
  "currency": "SGD",
  "status": "pending",
  "timestamp": "2026-06-06T08:00:00Z"
}
```

---

### 3. Internal System Integrations

#### 3A. OMS (Order Management System)

**Protocol**: REST API (GraphQL alternative available)

**API Endpoints:**
```
Base URL: https://oms.internal.company.com/api/v2

Endpoints:
  - GET /orders/{orderId}
  - GET /orders/search?paymentRef={ref}
  - POST /orders/bulk-search
  - GET /orders/status-history/{orderId}

Authentication: JWT Token (Bearer)
```

**Canonical Fields:**
```
Order:
  - orderId: string
  - orderDate: datetime
  - customerId: string
  - totalAmount: decimal
  - currency: string
  - paymentStatus: enum (pending, captured, refunded)
  - paymentRef: string
  - pspTxnId: string
```

#### 3B. Data Lake

**Protocol**: S3 API (AWS SDK)

**Configuration:**
```yaml
s3:
  bucket: company-datalake-prod
  region: ap-southeast-1
  prefix: cash-app/settlements/
  format: parquet
  partitionBy: [year, month, day]
  retention: 2555 days (7 years)
```

**Write Pattern:**
```
s3://company-datalake-prod/cash-app/settlements/
  year=2026/
    month=06/
      day=06/
        settlements_psp_20260606_001.parquet
        settlements_bank_20260606_001.parquet
```

#### 3C. Ledger Service

**Protocol**: GraphQL API

**API Endpoint:**
```
URL: https://ledger.internal.company.com/graphql

Mutations:
  - createJournalEntry
  - postJournalBatch
  - reverseEntry

Queries:
  - getSubLedgerBalance
  - getGLAccount
  - getJournalEntries
```

**Example Mutation:**
```graphql
mutation CreateJournalEntry($input: JournalEntryInput!) {
  createJournalEntry(input: $input) {
    id
    entryNumber
    status
    lines {
      account
      debit
      credit
    }
  }
}
```

#### 3D. Sales Service

**Protocol**: REST API

**API Endpoints:**
```
Base URL: https://sales.internal.company.com/api/v1

Endpoints:
  - GET /merchants/{merchantId}
  - GET /contracts/active
  - GET /fee-schedules/{pspId}
  - GET /pricing/mdr-rates

Authentication: API Key
```

---

### 4. ERP Integrations (Oracle Fusion, SAP, NetSuite)

#### 4A. Oracle Fusion Cloud

**Protocol**: REST API + SOAP (legacy modules)

**REST API Configuration:**
```
Base URL: https://company.fa.us2.oraclecloud.com/fscmRestApi/resources/11.13.18.05

Common Endpoints:
  - /purchaseOrders
  - /invoices
  - /payments
  - /supplierSites
  - /glJournals
  - /subLedgerBalances

Authentication: OAuth 2.0 (Client Credentials)
Content-Type: application/json
```

**SOAP API Configuration (for GL posting):**
```xml
Endpoint: https://company.fa.us2.oraclecloud.com/fscmService/ErpIntegrationService
WSDL: https://company.fa.us2.oraclecloud.com/fscmService/ErpIntegrationService?WSDL

Operations:
  - importBulkData (for bulk GL imports)
  - submitESSJobRequest (for scheduled processes)
```

**Common Integration Scenarios:**

**1. Pull Open Purchase Orders:**
```http
GET /purchaseOrders?q=Status='APPROVED';OrderDate>='2026-06-01'
&fields=OrderNumber,SupplierName,TotalAmount,Currency

Response:
{
  "items": [
    {
      "OrderNumber": "PO-2026-12345",
      "SupplierName": "Adyen Singapore",
      "TotalAmount": 125000.00,
      "Currency": "SGD",
      "lines": [...]
    }
  ]
}
```

**2. Pull Open Invoices (AP):**
```http
GET /invoices?q=InvoiceStatus='APPROVED';InvoiceDate>='2026-05-01'
&fields=InvoiceNumber,SupplierName,InvoiceAmount,DueDate,Balance

Response:
{
  "items": [
    {
      "InvoiceNumber": "INV-2026-5678",
      "SupplierName": "Stripe Payments",
      "InvoiceAmount": 58000.00,
      "Balance": 58000.00,
      "DueDate": "2026-06-15"
    }
  ]
}
```

**3. Pull Sub-Ledger Balances:**
```http
GET /subLedgerBalances?q=LedgerName='PRIMARY_LEDGER';AccountingDate='2026-06-06'
&fields=AccountCombination,Currency,DebitBalance,CreditBalance

Response:
{
  "items": [
    {
      "AccountCombination": "01-1110-00000-0000",
      "AccountDescription": "Bank - DBS SGD",
      "Currency": "SGD",
      "DebitBalance": 4250000.00,
      "CreditBalance": 0.00
    }
  ]
}
```

**4. Post GL Journal Entries:**
```http
POST /glJournals

Request Body:
{
  "LedgerName": "PRIMARY_LEDGER",
  "JournalSource": "Cash Application",
  "JournalCategory": "Settlement",
  "JournalDate": "2026-06-06",
  "CurrencyCode": "SGD",
  "Description": "PSP Settlement - June 6 2026",
  "lines": [
    {
      "LineNumber": 1,
      "AccountCombination": "01-1110-00000-0000",
      "Debit": 4250000.00,
      "Description": "Bank Credit - DBS"
    },
    {
      "LineNumber": 2,
      "AccountCombination": "01-1210-00000-0000",
      "Credit": 4250000.00,
      "Description": "PSP Settlement Clearing"
    }
  ]
}
```

**Field Mapping Templates:**

```yaml
Oracle_PO_to_Canonical:
  OrderNumber: poNumber
  SupplierName: vendorName
  TotalAmount: totalAmount
  Currency: currency
  Status: status

Oracle_Invoice_to_Canonical:
  InvoiceNumber: invoiceNumber
  SupplierName: vendorName
  InvoiceAmount: invoiceAmount
  Balance: outstandingAmount
  DueDate: dueDate

Oracle_SubLedger_to_Canonical:
  AccountCombination: glAccount
  DebitBalance: debitAmount
  CreditBalance: creditAmount
  Currency: currency
```

#### 4B. SAP S/4HANA

**Protocol**: OData API (REST-based)

**Configuration:**
```
Base URL: https://company.s4hana.cloud.sap/sap/opu/odata/sap

Common Services:
  - /API_PURCHASEORDER_PROCESS_SRV
  - /API_SUPPLIERINVOICE_PROCESS_SRV
  - /API_JOURNALENTRY_CREATE_SRV
  - /YY1_SUBLEDGER_CDS

Authentication: Basic Auth or OAuth 2.0
```

**Example: Fetch Purchase Orders**
```http
GET /API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder
?$filter=PurchaseOrderDate ge '2026-06-01' and DocumentApprovalStatus eq 'APPROVED'
&$expand=to_PurchaseOrderItem

Headers:
  Authorization: Basic {base64(username:password)}
  Accept: application/json
```

#### 4C. NetSuite

**Protocol**: RESTlet (custom REST endpoints) + SuiteTalk (SOAP)

**Configuration:**
```
Account ID: 1234567
RESTlet URL: https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl
Script ID: customscript_cash_app_integration
Deploy ID: customdeploy1

Authentication: Token-Based Authentication (TBA)
  - Consumer Key
  - Consumer Secret
  - Token ID
  - Token Secret
```

---

## Screen Designs

### Screen 1: Connector List (Home)

**Layout: Master-Detail**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  🔌 Connector Studio                                    [+ New Connector]  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Filters: [All Types ▼] [All Status ▼] [Search...]                        │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                        BANK INTEGRATIONS (4)                          │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │  🟢 DBS Bank - SGD Account                      SFTP    ✓ Connected │ │
│  │     ****4521 • Daily 06:00, 18:00                Last: 2h ago       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🟢 OCBC Bank - SGD Account                     SFTP    ✓ Connected │ │
│  │     ****7821 • Daily 05:30, 17:30                Last: 3h ago       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🟡 BCA Bank - IDR Account                      SFTP    ⚠ Warning   │ │
│  │     ****1234 • Daily 08:00                       Last: Failed       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🔴 Mandiri Bank - IDR Account                  SFTP    ✗ Error     │ │
│  │     ****5678 • Daily 08:00                       Last: 2d ago       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                        PSP INTEGRATIONS (7)                           │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │  🟢 Adyen Singapore                             REST    ✓ Connected │ │
│  │     Settlement Reports • Daily 06:00             Last: 1h ago       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🟢 Stripe                                      REST    ✓ Connected │ │
│  │     Balance Transactions • Hourly                Last: 15m ago      │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🟢 GrabPay Singapore                           SFTP    ✓ Connected │ │
│  │     Daily Settlement Files • 06:00               Last: 2h ago       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🟢 OVO Indonesia                               SFTP    ✓ Connected │ │
│  │     Daily Settlement Files • 08:00               Last: 4h ago       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  [Show 3 more...]                                                   │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                     INTERNAL SYSTEMS (4)                              │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │  🟢 OMS (Order Management)                     REST    ✓ Connected  │ │
│  │     Order lookup • Real-time                     Last: Active       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🟢 Data Lake (S3)                             S3      ✓ Connected  │ │
│  │     Archive settlements • Daily 23:00            Last: 12h ago      │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🟢 Ledger Service                             GraphQL ✓ Connected  │ │
│  │     Journal entries • Real-time                  Last: Active       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  │  🟢 Sales Service                              REST    ✓ Connected  │ │
│  │     Fee schedules • Daily 00:00                  Last: 8h ago       │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                         ERP SYSTEMS (1)                               │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │  🟢 Oracle Fusion Cloud                        REST    ✓ Connected  │ │
│  │     GL, PO, Invoices • Daily 07:00, 19:00        Last: 30m ago      │ │
│  │     [Test] [Edit] [History] [⋮]                                     │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

**Status Indicators:**
- 🟢 Green = Healthy (last run successful)
- 🟡 Yellow = Warning (partial success, retry in progress)
- 🔴 Red = Error (last run failed, needs attention)
- ⚪ Gray = Disabled/Inactive

---

### Screen 2: Create/Edit Connector - Step 1 (Basic Info)

**Layout: Wizard (4 steps)**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Connectors              New PSP Connector                       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ●━━━○━━━○━━━○  Step 1 of 4: Basic Information                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  Connector Type *                                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────┐   │ │
│  │  │  [ ] Bank           [ ] PSP (Selected)                       │   │ │
│  │  │  [ ] Internal       [ ] ERP                                  │   │ │
│  │  └─────────────────────────────────────────────────────────────┘   │ │
│  │                                                                       │ │
│  │  PSP Provider *                                                      │ │
│  │  [Select PSP ▼────────────────────────────]                         │ │
│  │  • Adyen                                                             │ │
│  │  • Stripe                                                            │ │
│  │  • GrabPay                                                           │ │
│  │  • OVO                                                               │ │
│  │  • GoPay                                                             │ │
│  │  • DOKU                                                              │ │
│  │  • PayPal                                                            │ │
│  │  • Custom (Other)                                                    │ │
│  │                                                                       │ │
│  │  Connector Name *                                                    │ │
│  │  [Stripe Singapore Production_______________________]               │ │
│  │                                                                       │ │
│  │  Description                                                         │ │
│  │  [Stripe settlement reports for SG entity__________]               │ │
│  │  [________________________________________________]               │ │
│  │                                                                       │ │
│  │  Currency Support *                                                  │ │
│  │  ☑ SGD    ☐ IDR    ☐ MYR    ☐ USD    ☐ EUR                        │ │
│  │                                                                       │ │
│  │  Legal Entity *                                                      │ │
│  │  [Grab Singapore Pte Ltd ▼─────────────────────]                   │ │
│  │                                                                       │ │
│  │  Status                                                              │ │
│  │  ◉ Active    ○ Inactive                                            │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                                         [Cancel]  [Next: Connection →]    │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### Screen 3: Create/Edit Connector - Step 2 (Connection Details)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back                            New PSP Connector                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ○━━━●━━━○━━━○  Step 2 of 4: Connection Details                           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  Protocol Type *                                                     │ │
│  │  ◉ REST API    ○ SFTP    ○ SOAP    ○ Email    ○ Webhook            │ │
│  │                                                                       │ │
│  │  ┌─ REST API Configuration ───────────────────────────────────────┐ │ │
│  │  │                                                                  │ │ │
│  │  │  Base URL *                                                     │ │ │
│  │  │  [https://api.stripe.com/v1_________________________]          │ │ │
│  │  │                                                                  │ │ │
│  │  │  Authentication Method *                                        │ │ │
│  │  │  [Bearer Token ▼─────────────────────]                         │ │ │
│  │  │    • API Key                                                    │ │ │
│  │  │    • Bearer Token                                               │ │ │
│  │  │    • OAuth 2.0                                                  │ │ │
│  │  │    • Basic Auth                                                 │ │ │
│  │  │                                                                  │ │ │
│  │  │  API Key / Token *                                              │ │ │
│  │  │  [sk_live_•••••••••••••••••••••••••_____]  [🔒 Encrypted]     │ │ │
│  │  │                                                                  │ │ │
│  │  │  Request Timeout (seconds)                                      │ │ │
│  │  │  [30____]                                                       │ │ │
│  │  │                                                                  │ │ │
│  │  │  Rate Limit                                                     │ │ │
│  │  │  [100___] requests per [second ▼]                              │ │ │
│  │  │                                                                  │ │ │
│  │  │  ▼ Advanced Settings                                            │ │ │
│  │  │    Custom Headers:                                              │ │ │
│  │  │    [Stripe-Version___] : [2023-10-16_____________]             │ │ │
│  │  │    [+ Add Header]                                               │ │ │
│  │  │                                                                  │ │ │
│  │  │    Retry Configuration:                                         │ │ │
│  │  │    Max Retries: [3__]  Backoff: [Exponential ▼]               │ │ │
│  │  │                                                                  │ │ │
│  │  │    Proxy (optional):                                            │ │ │
│  │  │    [http://proxy.company.com:8080_______________]              │ │ │
│  │  │                                                                  │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  [🧪 Test Connection]                                               │ │
│  │                                                                       │ │
│  │  ✓ Connection successful! (Response time: 243ms)                    │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                                         [← Back]  [Next: Mapping →]       │
└────────────────────────────────────────────────────────────────────────────┘
```

**Alternative: SFTP Configuration**

```
│  ┌─ SFTP Configuration ────────────────────────────────────────────────┐ │
│  │                                                                      │ │
│  │  Host *                                                             │ │
│  │  [sftp.stripe.com_______________________________]                  │ │
│  │                                                                      │ │
│  │  Port                                                               │ │
│  │  [22___]                                                            │ │
│  │                                                                      │ │
│  │  Authentication *                                                   │ │
│  │  ◉ SSH Key    ○ Password                                           │ │
│  │                                                                      │ │
│  │  Username *                                                         │ │
│  │  [grabsg_sftp_________________________]                            │ │
│  │                                                                      │ │
│  │  Private Key *                                                      │ │
│  │  [📎 Upload Private Key]  stripe_prod_key.pem  [🔒 Encrypted]     │ │
│  │                                                                      │ │
│  │  Remote Directory Path *                                            │ │
│  │  [/outbound/settlements_________________]                          │ │
│  │                                                                      │ │
│  │  File Pattern *                                                     │ │
│  │  [settlement_YYYYMMDD_*.csv_____________]                          │ │
│  │                                                                      │ │
│  │  Archive Processed Files                                            │ │
│  │  ☑ Yes  → Move to: [/archive/processed____]                       │ │
│  │                                                                      │ │
│  └──────────────────────────────────────────────────────────────────┘ │
```

---

### Screen 4: Create/Edit Connector - Step 3 (Field Mapping)

**Layout: Split View (Source ↔ Target)**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back                            New PSP Connector                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ○━━━○━━━●━━━○  Step 3 of 4: Field Mapping & Transformation               │
│                                                                             │
│  Data Type: [Settlement Report ▼]                                          │
│                                                                             │
│  ┌───────────────────────────────┬────────────────────────────────────┐   │
│  │      SOURCE FIELDS            │      TARGET (CANONICAL)            │   │
│  │      (Stripe API)             │                                    │   │
│  ├───────────────────────────────┼────────────────────────────────────┤   │
│  │                               │                                    │   │
│  │  payout.id                ───→│  settlementRef                    │   │
│  │  (string)                     │  (string)                          │   │
│  │                               │  [Auto-mapped by AI ✓]            │   │
│  │                               │                                    │   │
│  │  payout.arrival_date      ───→│  settlementDate                   │   │
│  │  (unix timestamp)             │  (date)                            │   │
│  │                               │  Transform: [Unix → Date ▼]       │   │
│  │                               │                                    │   │
│  │  payout.amount            ───→│  grossAmount                      │   │
│  │  (integer, cents)             │  (decimal)                         │   │
│  │                               │  Transform: [÷ 100 ▼]             │   │
│  │                               │                                    │   │
│  │  payout.currency          ───→│  currency                         │   │
│  │  (string, lowercase)          │  (string, uppercase)               │   │
│  │                               │  Transform: [toUpperCase() ▼]     │   │
│  │                               │                                    │   │
│  │  balance_transaction.fee  ───→│  mdrFee                           │   │
│  │  (integer, cents)             │  (decimal)                         │   │
│  │                               │  Transform: [÷ 100 ▼]             │   │
│  │                               │                                    │   │
│  │  balance_transaction.net  ───→│  netAmount                        │   │
│  │  (integer, cents)             │  (decimal)                         │   │
│  │                               │  Transform: [÷ 100 ▼]             │   │
│  │                               │                                    │   │
│  │  (unmapped)               ───→│  taxOnMDR                         │   │
│  │                               │  (decimal)                         │   │
│  │                               │  Formula: [mdrFee × 0.07___]      │   │
│  │                               │                                    │   │
│  │  [+ Add Source Field]         │  [+ Add Target Field]              │   │
│  │                               │                                    │   │
│  └───────────────────────────────┴────────────────────────────────────┘   │
│                                                                             │
│  Validation Rules:                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  ☑ Require settlementRef (unique)                                   │ │
│  │  ☑ Validate currency against supported list [SGD, IDR, MYR]         │ │
│  │  ☑ Amount must be > 0                                                │ │
│  │  ☑ Settlement date cannot be future date                             │ │
│  │  ☐ Custom validation rule: [________________]                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [💡 AI Suggest Mappings]  [📋 Load Template]  [💾 Save as Template]     │
│                                                                             │
│  Sample Data Preview:                                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  settlementRef: po_1PQR123456                                        │ │
│  │  settlementDate: 2026-06-06                                          │ │
│  │  grossAmount: 500000.00                                              │ │
│  │  currency: SGD                                                       │ │
│  │  mdrFee: 12500.00                                                    │ │
│  │  taxOnMDR: 875.00                                                    │ │
│  │  netAmount: 486625.00                                                │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                                         [← Back]  [Next: Schedule →]      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Transform Functions Available:**
- **Numeric**: Divide, Multiply, Add, Subtract, Round, Absolute
- **String**: toUpperCase, toLowerCase, trim, substring, concat, replace
- **Date**: Unix→Date, Date→Unix, Format, Add Days, Timezone Convert
- **Lookup**: Map from external table (e.g., PSP Code → PSP Name)
- **Custom**: JavaScript expression

---

### Screen 5: Create/Edit Connector - Step 4 (Schedule & Rules)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back                            New PSP Connector                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ○━━━○━━━○━━━●  Step 4 of 4: Schedule & Execution Rules                   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    EXECUTION SCHEDULE                                 │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │  Execution Mode                                                      │ │
│  │  ◉ Scheduled    ○ Manual Only    ○ Real-time (Webhook)              │ │
│  │                                                                       │ │
│  │  Schedule Type                                                       │ │
│  │  ◉ Simple Schedule    ○ Cron Expression    ○ Custom                 │ │
│  │                                                                       │ │
│  │  ┌─ Simple Schedule ──────────────────────────────────────────────┐ │ │
│  │  │                                                                  │ │ │
│  │  │  Frequency: [Daily ▼]  (Hourly, Daily, Weekly, Monthly)        │ │ │
│  │  │                                                                  │ │ │
│  │  │  Run Times:                                                     │ │ │
│  │  │  • [06:00_] [Asia/Singapore ▼]  [×]                           │ │ │
│  │  │  • [18:00_] [Asia/Singapore ▼]  [×]                           │ │ │
│  │  │  [+ Add Run Time]                                               │ │ │
│  │  │                                                                  │ │ │
│  │  │  Run on Weekends: ☑ Yes  ☐ No                                  │ │ │
│  │  │  Run on Holidays: ☐ Yes  ☑ No                                  │ │ │
│  │  │                                                                  │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  Lookback Period (for incremental loads)                             │ │
│  │  Pull data from: [Last successful run ▼]                            │ │
│  │    • Last successful run                                             │ │
│  │    • Last 24 hours                                                   │ │
│  │    • Last 7 days                                                     │ │
│  │    • Custom date range                                               │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    EXECUTION RULES                                    │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │  Retry Configuration                                                 │ │
│  │  ☑ Auto-retry on failure                                            │ │
│  │  Max retries: [3___]  Retry interval: [15__] minutes               │ │
│  │  Backoff strategy: [Exponential ▼]                                  │ │
│  │                                                                       │ │
│  │  Error Handling                                                      │ │
│  │  On partial success: [Continue and log errors ▼]                    │ │
│  │    • Continue and log errors                                         │ │
│  │    • Stop and rollback                                               │ │
│  │    • Continue and create exceptions                                  │ │
│  │                                                                       │ │
│  │  Duplicate Detection                                                 │ │
│  │  ☑ Skip duplicate records based on: [settlementRef___]             │ │
│  │                                                                       │ │
│  │  Notification Rules                                                  │ │
│  │  ☑ Notify on failure                                                │ │
│  │  ☐ Notify on success                                                │ │
│  │  ☑ Notify on partial success (> 10% errors)                         │ │
│  │                                                                       │ │
│  │  Recipients: [finance-ops@company.com_________]  [+ Add]            │ │
│  │              [treasury@company.com_____________]  [×]                │ │
│  │                                                                       │ │
│  │  Execution Timeout                                                   │ │
│  │  [30___] minutes                                                     │ │
│  │                                                                       │ │
│  │  Parallel Processing                                                 │ │
│  │  ☑ Enable parallel processing                                       │ │
│  │  Batch size: [1000___] records per batch                            │ │
│  │  Max parallel workers: [5___]                                        │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    POST-PROCESSING                                    │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │  After successful execution:                                         │ │
│  │  ☑ Trigger reconciliation matching                                  │ │
│  │  ☑ Update dashboard KPIs                                            │ │
│  │  ☑ Archive to Data Lake                                             │ │
│  │  ☐ Post to Ledger Service                                           │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                            [← Back]  [Save & Activate]  [Save as Draft]  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### Screen 6: Run History & Monitoring

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Connectors         Run History: Stripe Singapore                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Connector: Stripe Singapore Production                                    │
│  Status: 🟢 Active  •  Last Run: 15 minutes ago  •  Success Rate: 98.2%   │
│                                                                             │
│  Filters: [Last 7 days ▼] [All Status ▼] [Search...]      [Run Now]      │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ Run ID       Start Time         Duration  Status    Records  Actions │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                       │ │
│  │ RUN-12345   2026-06-09 06:00    2m 15s    ✓ Success  1,247   [View] │ │
│  │             Fetched 1,247 settlements • 0 errors                     │ │
│  │                                                                       │ │
│  │ RUN-12344   2026-06-08 18:00    1m 58s    ✓ Success  1,189   [View] │ │
│  │             Fetched 1,189 settlements • 0 errors                     │ │
│  │                                                                       │ │
│  │ RUN-12343   2026-06-08 06:00    3m 42s    ⚠ Partial   1,523   [View] │ │
│  │             Fetched 1,523 settlements • 38 validation errors         │ │
│  │             [View Errors]                                            │ │
│  │                                                                       │ │
│  │ RUN-12342   2026-06-07 18:00    --        ✗ Failed      0    [View] │ │
│  │             Connection timeout after 30s • Auto-retry in 15m         │ │
│  │             [View Logs] [Retry Now]                                  │ │
│  │                                                                       │ │
│  │ RUN-12341   2026-06-07 06:00    2m 05s    ✓ Success  1,156   [View] │ │
│  │             Fetched 1,156 settlements • 0 errors                     │ │
│  │                                                                       │ │
│  │ [Load More...]                                                       │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ PERFORMANCE METRICS (Last 30 Days) ─────────────────────────────────┐ │
│  │                                                                       │ │
│  │  Total Runs: 180          Avg Duration: 2m 18s                       │ │
│  │  Success: 177 (98.3%)     Avg Records/Run: 1,234                     │ │
│  │  Partial: 2 (1.1%)        Total Records: 222,120                     │ │
│  │  Failed: 1 (0.6%)         Data Volume: 485 MB                        │ │
│  │                                                                       │ │
│  │  [────────────────── Success Rate Chart ──────────────────]          │ │
│  │   100% ┤                                                              │ │
│  │    98% ┤  ▁▁▁▁▁▁▁▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▁▁                           │ │
│  │    96% ┤                                                              │ │
│  │    94% ┼──────────────────────────────────                           │ │
│  │        Jun 1      Jun 8      Jun 15     Jun 22     Jun 30            │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### Screen 7: Run Detail View (Drill-down)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back to History            Run Detail: RUN-12343                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Run ID: RUN-12343                                                         │
│  Connector: Stripe Singapore Production                                    │
│  Status: ⚠ Partial Success (97.5% success rate)                           │
│  Executed: 2026-06-08 06:00:15 SGT                                         │
│  Duration: 3m 42s                                                          │
│  Triggered By: Scheduled (daily-morning)                                   │
│                                                                             │
│  ┌─ EXECUTION SUMMARY ───────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  Total Records:      1,523                                            │ │
│  │  ✓ Successful:       1,485 (97.5%)                                    │ │
│  │  ⚠ Failed:              38 (2.5%)                                     │ │
│  │  ⊘ Skipped:              0 (0.0%)                                     │ │
│  │                                                                       │ │
│  │  Data Volume: 3.2 MB                                                  │ │
│  │  API Calls: 15 (batch API)                                            │ │
│  │  Avg Response Time: 1,247 ms                                          │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ EXECUTION TIMELINE ──────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  06:00:15  [●] Run started                                           │ │
│  │  06:00:16  [●] Authentication successful                             │ │
│  │  06:00:17  [●] Fetching balance transactions (page 1/15)             │ │
│  │  06:00:45  [●] Fetched 1,523 transactions                            │ │
│  │  06:00:46  [●] Validating schema and data types                      │ │
│  │  06:01:02  [⚠] 38 validation errors found                            │ │
│  │  06:01:03  [●] Applying field mappings                               │ │
│  │  06:02:15  [●] Loading 1,485 records to canonical database           │ │
│  │  06:03:50  [●] Creating 38 exceptions for failed records             │ │
│  │  06:03:57  [✓] Run completed with warnings                           │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ ERROR DETAILS (38 records) ──────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  Error Type                         Count   Actions                   │ │
│  │  ─────────────────────────────────  ─────   ──────────                │ │
│  │  Invalid currency code "XXX"          24    [View Records] [Fix]     │ │
│  │  Missing required field: amount       10    [View Records] [Fix]     │ │
│  │  Duplicate settlementRef               4    [View Records] [Ignore]  │ │
│  │                                                                       │ │
│  │  [📥 Download Error Report (CSV)]                                    │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ SAMPLE RECORDS ──────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  Showing 5 of 1,485 successful records:                              │ │
│  │                                                                       │ │
│  │  settlementRef      date        amount      currency   status        │ │
│  │  ──────────────────────────────────────────────────────────────────  │ │
│  │  po_1PQR123456     2026-06-08   487,350.00   SGD       ✓ Loaded     │ │
│  │  po_1PQR123457     2026-06-08   506,844.00   SGD       ✓ Loaded     │ │
│  │  po_1PQR123458     2026-06-08   467,880.00   SGD       ✓ Loaded     │ │
│  │  po_1PQR123459     2026-06-08   497,109.00   SGD       ✓ Loaded     │ │
│  │  po_1PQR123460     2026-06-08   477,615.00   SGD       ✓ Loaded     │ │
│  │                                                                       │ │
│  │  [View All Records]                                                   │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ RAW LOGS ────────────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  [Expand Full Logs ▼]                                                │ │
│  │                                                                       │ │
│  │  2026-06-08 06:00:15.123 [INFO] Starting connector execution         │ │
│  │  2026-06-08 06:00:16.456 [INFO] API auth successful (Bearer Token)   │ │
│  │  2026-06-08 06:00:17.789 [INFO] GET /v1/balance_transactions         │ │
│  │  2026-06-08 06:01:02.234 [WARN] Validation failed for 38 records     │ │
│  │  2026-06-08 06:03:57.890 [INFO] Execution completed (partial)        │ │
│  │                                                                       │ │
│  │  [📥 Download Full Logs]                                             │ │
│  │                                                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                              [🔄 Retry Failed Records]  [Close]           │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### 1. Connector Configuration

```typescript
interface ConnectorConfig {
  id: string
  name: string
  type: 'bank' | 'psp' | 'internal' | 'erp'
  subType: string // 'adyen', 'stripe', 'oracle_fusion', etc.
  legalEntityId: string
  status: 'active' | 'inactive' | 'draft'

  // Connection
  protocol: 'sftp' | 'rest' | 'soap' | 'graphql' | 'email' | 'webhook' | 's3'
  connection: {
    // REST/SOAP
    baseUrl?: string
    authMethod?: 'api_key' | 'bearer_token' | 'oauth2' | 'basic_auth'
    credentials?: EncryptedCredentials
    headers?: Record<string, string>
    timeout?: number
    rateLimit?: { requests: number; per: string }

    // SFTP
    host?: string
    port?: number
    username?: string
    sshKey?: EncryptedString
    password?: EncryptedString
    remoteDir?: string
    filePattern?: string

    // Email
    imapHost?: string
    imapPort?: number
    emailAddress?: string
    emailPassword?: EncryptedString

    // S3
    bucket?: string
    region?: string
    accessKeyId?: EncryptedString
    secretAccessKey?: EncryptedString
    prefix?: string
  }

  // Field Mapping
  fieldMappings: FieldMapping[]

  // Schedule
  schedule: {
    mode: 'scheduled' | 'manual' | 'realtime'
    type: 'simple' | 'cron' | 'custom'
    frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly'
    runTimes?: string[] // ['06:00', '18:00']
    timezone?: string
    cronExpression?: string
    runOnWeekends?: boolean
    runOnHolidays?: boolean
    lookbackPeriod?: string
  }

  // Execution Rules
  rules: {
    autoRetry: boolean
    maxRetries: number
    retryInterval: number
    backoffStrategy: 'linear' | 'exponential'
    errorHandling: 'continue' | 'rollback' | 'create_exceptions'
    duplicateDetection: boolean
    duplicateKey?: string
    timeout: number
    parallelProcessing: boolean
    batchSize?: number
    maxWorkers?: number
  }

  // Notifications
  notifications: {
    onFailure: boolean
    onSuccess: boolean
    onPartialSuccess: boolean
    recipients: string[]
    webhookUrl?: string
  }

  // Post-Processing
  postProcessing: {
    triggerReconciliation: boolean
    updateDashboard: boolean
    archiveToDataLake: boolean
    postToLedger: boolean
  }

  // Metadata
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  lastRunAt?: string
  lastRunStatus?: 'success' | 'partial' | 'failed'
}
```

### 2. Field Mapping

```typescript
interface FieldMapping {
  id: string
  sourceField: string
  sourceType: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array'
  targetField: string
  targetType: 'string' | 'decimal' | 'integer' | 'boolean' | 'date' | 'datetime'
  required: boolean
  transform?: Transform
  validation?: ValidationRule[]
  defaultValue?: any
  lookupTable?: string
  autoMapped?: boolean // AI-suggested mapping
}

interface Transform {
  type: 'divide' | 'multiply' | 'toUpperCase' | 'toLowerCase' | 'unixToDate' | 'dateFormat' | 'custom'
  params?: any
  expression?: string // JavaScript expression for custom transforms
}

interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'regex' | 'enum' | 'custom'
  value?: any
  message: string
}
```

### 3. Execution Run

```typescript
interface ExecutionRun {
  id: string
  connectorId: string
  status: 'running' | 'success' | 'partial' | 'failed' | 'cancelled'
  startTime: string
  endTime?: string
  duration?: number // seconds

  trigger: {
    type: 'scheduled' | 'manual' | 'webhook' | 'retry'
    userId?: string
    userName?: string
  }

  stats: {
    totalRecords: number
    successfulRecords: number
    failedRecords: number
    skippedRecords: number
    dataVolumeMB: number
    apiCalls?: number
    avgResponseTime?: number
  }

  errors: ExecutionError[]
  logs: LogEntry[]

  // Sample data for preview
  sampleRecords: any[]

  // Post-processing results
  reconTriggered: boolean
  dataLakeArchived: boolean
  ledgerPosted: boolean
}

interface ExecutionError {
  recordId?: string
  errorType: string
  errorMessage: string
  count: number
  sampleRecords: any[]
}

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  metadata?: Record<string, any>
}
```

---

## Workflows

### Workflow 1: Creating a New PSP Connector (Stripe)

**User Journey:**

1. User clicks **[+ New Connector]** on home screen
2. **Step 1 - Basic Info**:
   - Select "PSP" type
   - Choose "Stripe" from dropdown
   - Name: "Stripe Singapore Production"
   - Currency: SGD
   - Entity: Grab Singapore Pte Ltd
   - Click **[Next]**

3. **Step 2 - Connection**:
   - Protocol: REST API (pre-selected for Stripe)
   - Base URL: Auto-filled `https://api.stripe.com/v1`
   - Auth: Bearer Token
   - Paste API Key: `sk_live_...`
   - Click **[Test Connection]** → ✓ Success
   - Click **[Next]**

4. **Step 3 - Field Mapping**:
   - System shows Stripe fields on left, canonical on right
   - Click **[AI Suggest Mappings]** → 80% auto-mapped
   - Review and adjust remaining 20%
   - Add transform: `payout.amount ÷ 100` (cents → dollars)
   - Add validation: Currency must be SGD
   - Click **[Next]**

5. **Step 4 - Schedule**:
   - Mode: Scheduled
   - Frequency: Daily
   - Run Times: 06:00, 18:00 (SGT)
   - Auto-retry: Yes (3 times, 15min interval)
   - Notify on failure: finance-ops@company.com
   - Post-processing: Trigger reconciliation ✓
   - Click **[Save & Activate]**

6. Confirmation modal: "Connector created successfully. First run scheduled for tomorrow 06:00 SGT. [Run Now] [View Connector]"

---

### Workflow 2: Investigating a Failed Run

**User Journey:**

1. User receives email: "Connector 'Stripe Singapore' failed at 06:00 SGT"
2. User navigates to Connector Studio → Clicks on "Stripe Singapore"
3. Clicks **[History]** tab
4. Sees latest run: RUN-12342 • ✗ Failed • 0 records
5. Clicks **[View]** on failed run
6. **Detail View** shows:
   - Error: "Connection timeout after 30s"
   - Timeline: Authentication attempt failed
   - Retry status: "Auto-retry scheduled in 15 minutes"
7. User clicks **[Retry Now]** to force immediate retry
8. System executes → Success ✓
9. User receives email: "Connector 'Stripe Singapore' recovered successfully"

---

### Workflow 3: ERP Integration - Oracle Fusion GL Posting

**Setup Journey:**

1. Create connector: Type = ERP, Sub-type = Oracle Fusion
2. Connection:
   - Protocol: REST API
   - Base URL: `https://company.fa.us2.oraclecloud.com/fscmRestApi/resources/11.13.18.05`
   - Auth: OAuth 2.0
   - Provide Client ID, Client Secret
3. Field Mapping:
   - Data Type: "GL Journal Entry"
   - Map canonical fields → Oracle GL fields
   - Transform: Convert decimal amounts to Oracle format
4. Schedule:
   - Mode: Manual only (finance user triggers after month-end close)
   - Post-processing: Update sub-ledger balances ✓

**Execution Journey:**

1. Finance user clicks **[Run Now]** on Oracle connector
2. System fetches 150 journal entries from canonical DB
3. Transforms to Oracle format
4. POSTs to `/glJournals` API
5. Oracle returns 150 success confirmations
6. System updates local DB with Oracle document IDs
7. User sees: "✓ 150 journal entries posted to Oracle Fusion"

---

## Enterprise Look & Feel

### Design Principles

1. **Clean & Professional**: White backgrounds, subtle shadows, minimal colors
2. **Information Density**: Show critical info without overwhelming (progressive disclosure)
3. **Action-Oriented**: Clear CTAs, primary actions stand out
4. **Trustworthy**: Status indicators, health checks, audit trail visible
5. **Efficient**: Keyboard shortcuts, bulk actions, quick filters

### Color Palette

```
Primary Colors:
  - Primary Blue: #0066CC (buttons, links, active states)
  - Success Green: #059669 (healthy status, success messages)
  - Warning Amber: #D97706 (warnings, partial success)
  - Error Red: #DC2626 (errors, critical alerts)

Neutral Colors:
  - Gray 900: #0F172A (headings)
  - Gray 700: #334155 (body text)
  - Gray 500: #64748B (secondary text)
  - Gray 300: #CBD5E1 (borders)
  - Gray 100: #F1F5F9 (backgrounds)
  - White: #FFFFFF (cards, modals)

Status Colors:
  - 🟢 Healthy: #10B981
  - 🟡 Warning: #F59E0B
  - 🔴 Error: #EF4444
  - ⚪ Inactive: #94A3B8
```

### Typography

```
Font Family:
  - Primary: "Inter", system-ui, sans-serif
  - Monospace: "JetBrains Mono", "Courier New", monospace

Font Sizes:
  - Page Title: 24px (600 weight)
  - Section Title: 18px (600 weight)
  - Body: 14px (400 weight)
  - Small: 12px (400 weight)
  - Tiny: 11px (500 weight)

Line Height: 1.5 (body), 1.2 (headings)
```

### Component Styles

**Buttons:**
```css
Primary Button:
  - Background: #0066CC
  - Text: White
  - Padding: 10px 20px
  - Border-radius: 6px
  - Hover: #0052A3

Secondary Button:
  - Background: White
  - Text: #334155
  - Border: 1px solid #CBD5E1
  - Hover: #F1F5F9

Danger Button:
  - Background: #DC2626
  - Text: White
```

**Cards:**
```css
Card:
  - Background: White
  - Border: 1px solid #E2E8F0
  - Border-radius: 8px
  - Shadow: 0 1px 3px rgba(0,0,0,0.1)
  - Padding: 20px

Card Hover (clickable):
  - Shadow: 0 4px 12px rgba(0,0,0,0.15)
  - Border: 1px solid #CBD5E1
```

**Status Badges:**
```css
Badge:
  - Padding: 4px 10px
  - Border-radius: 12px
  - Font-size: 11px
  - Font-weight: 600
  - Text-transform: uppercase
  - Letter-spacing: 0.5px

Success Badge:
  - Background: #D1FAE5
  - Text: #065F46
  - Border: 1px solid #6EE7B7
```

### Spacing System

```
Base Unit: 4px

Scale:
  - xs: 4px
  - sm: 8px
  - md: 16px
  - lg: 24px
  - xl: 32px
  - 2xl: 48px
  - 3xl: 64px
```

### Reference: Enterprise Tools
Look and feel inspired by:
- **Workday**: Clean, professional, information-dense
- **Oracle Cloud**: Structured, organized, enterprise-grade
- **ServiceNow**: Modern, efficient, action-oriented
- **Salesforce**: Clear hierarchy, strong CTAs
- **Stripe Dashboard**: Developer-friendly, excellent UX

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)
- [ ] Set up data models (Connector, FieldMapping, ExecutionRun)
- [ ] Build mock data for 5 connector types (Bank, PSP, OMS, Oracle, Data Lake)
- [ ] Create service layer (connectorService)
- [ ] Implement credential encryption utility

### Phase 2: UI - Connector List & Basic CRUD (Week 3-4)
- [ ] Screen 1: Connector List with filters
- [ ] Screen 2-5: Create/Edit Connector wizard (4 steps)
- [ ] Connection testing functionality
- [ ] Form validation

### Phase 3: Field Mapping Engine (Week 5-6)
- [ ] Visual field mapper component
- [ ] Transform functions (divide, multiply, date conversions)
- [ ] Validation rule engine
- [ ] AI-suggested mappings (simple heuristic-based)
- [ ] Mapping templates (save/load)

### Phase 4: Scheduler & Execution (Week 7-8)
- [ ] Cron job configuration
- [ ] Manual execution trigger
- [ ] Execution engine (mock)
- [ ] Retry logic
- [ ] Error handling & logging

### Phase 5: Run History & Monitoring (Week 9-10)
- [ ] Screen 6: Run History list
- [ ] Screen 7: Run Detail view
- [ ] Performance metrics dashboard
- [ ] Error reporting
- [ ] Log viewer

### Phase 6: Protocol Implementations (Week 11-12)
- [ ] REST API connector (fetch, parse, load)
- [ ] SFTP connector (connect, list, download)
- [ ] GraphQL connector
- [ ] S3 connector
- [ ] Webhook receiver

### Phase 7: ERP-Specific Features (Week 13-14)
- [ ] Oracle Fusion templates (PO, Invoice, GL)
- [ ] SAP OData integration
- [ ] NetSuite RESTlet integration
- [ ] Bulk data loading
- [ ] Sub-ledger reconciliation

### Phase 8: Enterprise Features (Week 15-16)
- [ ] RBAC (role-based access control)
- [ ] Audit trail (who changed what, when)
- [ ] Notifications (email, Slack, webhook)
- [ ] Sandbox mode for testing
- [ ] Export/import connector configs

### Phase 9: Polish & Documentation (Week 17-18)
- [ ] UI polish (animations, loading states, empty states)
- [ ] Error messages and help text
- [ ] User documentation
- [ ] Admin guide
- [ ] API documentation

---

## Success Metrics

1. **Connectivity**: 95%+ uptime for all active connectors
2. **Reliability**: 98%+ success rate on scheduled runs
3. **Performance**: < 5 min execution time for 10K records
4. **Usability**: < 30 min to configure a new connector (non-technical user)
5. **Coverage**: Support 20+ integration types by end of Phase 9

---

## Open Questions & Future Enhancements

### Open Questions:
1. Should we support bidirectional sync (read + write)?
2. Do we need version control for connector configs?
3. Should historic runs be archived after 90 days?
4. Real-time monitoring dashboard (live status)?

### Future Enhancements:
1. **AI-Powered Mapping**: ML model to auto-map 95% of fields
2. **Data Quality Checks**: Built-in validation for common issues
3. **Connector Marketplace**: Pre-built connectors from community
4. **Mobile App**: View run status and trigger manual runs
5. **Anomaly Detection**: Alert on unusual data patterns
6. **Cost Optimization**: Track API usage and optimize batch sizes

---

**End of Build Spec**

*Ready for implementation!* 🚀
