# Invoice Demo — System Overview

A end-to-end walkthrough of how the demo invoice processing pipeline works: frontend, backend, fixtures, and email ingestion.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Frontend](#frontend)
3. [Backend](#backend)
4. [Fixtures](#fixtures)
5. [Stage Processing Model](#stage-processing-model)
6. [Manual Upload Flow](#manual-upload-flow)
7. [Email Ingestion Flow](#email-ingestion-flow)
8. [Straight-Through Processing (STP)](#straight-through-processing-stp)
9. [Deployment](#deployment)
10. [Key Design Patterns](#key-design-patterns)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  Next.js (React/TypeScript)  ←→  FastAPI (Python)      │
│  Port 3002                        Port 8001             │
└─────────────────────────────────────────────────────────┘
          ↕                              ↕
    Nginx reverse proxy          In-memory database
    (invoicedemo.neoflo.ai)      (Motor-compatible API)
                                        ↕
                                  Fixture files
                                  (/fixtures/*.json)
                                        ↕
                                  Gmail poller
                                  (background task)
```

**Core principle:** The system is a fully self-contained demo. There is no real OCR or AI extraction — all invoice data is served from fixture JSON files. The in-memory database resets on container restart, but fixtures re-seed on the next upload. MongoDB is not required.

---

## Frontend

### Pages and Routes

| Route | Purpose |
|-------|---------|
| `/dashboard` | Invoice list table with KPI cards |
| `/invoice/[id]/extraction-confirm` | Review and edit extracted metadata; approve/reject |
| `/invoice/[id]/matching` | Metadata validation + line-item GRN matching (tabbed) |
| `/invoice/[id]/fp-extraction` | Faktur Pajak review (IDR invoices only) |
| `/invoice/[id]/bill-posting` | ERP posting screen with GL accounts and tax codes |
| `/invoice/[id]/rejected` | Read-only view for rejected invoices |

### Stage → Route Mapping

When a user clicks **Review** on the dashboard, the frontend routes them to the correct stage page based on the invoice's current stage:

```typescript
const STATUS_ROUTE: Record<string, string> = {
  extraction:           "extraction-confirm",
  metadata_validation:  "matching?tab=metadata",
  line_item_matching:   "matching?tab=line_items",
  fp_extraction:        "fp-extraction",
  bill_posting:         "bill-posting",
  posted:               "bill-posting",   // read-only
  rejected:             "rejected",
};
```

### Key Components

| Component | Role |
|-----------|------|
| `UploadModal` | File picker + multipart upload to backend |
| `PdfViewer` | Renders the invoice PDF with confidence bbox overlays |
| `StageNavStrip` | Progress bar showing the user's position in the pipeline |
| `ExtractionEditHistory` | Feed of all field edits made during the session |
| `MetadataTab` | Side-by-side field comparison (Invoice vs PO vs GRN) |
| `LineItemsTab` | Per-line-item GRN candidate selection |

### Frontend ↔ Backend Communication

In production the frontend makes direct CORS requests to the backend URL configured at build time (`NEXT_PUBLIC_BE_BASE_URL`). In local dev, Next.js rewrites `/api/v1/*` to `http://localhost:8099/api/v1/*`.

All API responses are wrapped in an envelope:

```json
{ "data": { ... }, "error": null }
```

The service layer (`frontend/src/services/`) unwraps this automatically before returning data to components.

---

## Backend

### Startup Sequence (`src/main.py`)

On startup the FastAPI lifespan handler does the following in order:

1. Initialises the in-memory database
2. Creates collection indexes
3. Seeds default tenants, admin user, demo users, and workflow settings
4. Starts the Gmail poller background task (if `GMAIL_ENABLED=true` and credentials are present)
5. Initialises the Cash Application module

### API Routers

All routes are prefixed with `/api/v1`.

| Router | Key Endpoints |
|--------|--------------|
| `ingestion` | `POST /ingestion/upload`, `GET /ingestion/scenarios` |
| `extraction` | `GET`, `PATCH /edit`, `POST /approve`, `POST /reject` |
| `fp_extraction` | `GET`, `POST /acknowledge`, `POST /approve` |
| `metadata_validation` | `GET`, `POST /approve/acknowledge` |
| `line_item_matching` | `GET`, `POST /mappings`, `POST /approve` |
| `bill_posting` | `GET`, `POST /edit`, `POST /submit` |
| `stp` | `GET/PATCH /settings/stp`, `GET/PATCH /settings/ack-threshold` |
| `auth` | `POST /auth/login`, `GET /auth/me` |
| `admin` | User and tenant management |

### Database Collections

| Collection | Stores |
|-----------|--------|
| `pipeline_runs` | Master invoice record — stage position, fixture key, source (manual/email) |
| `invoices` | Extracted invoice data — vendor, invoice number, amounts |
| `executed_stages` | Per-stage execution records — status, timestamps, edit history |
| `jobs` | Ingestion job tracking |
| `documents` | Uploaded file metadata |
| `attachments` | File attachment records (local path or S3 key) |
| `bboxes` | Bounding box confidence data for the PDF viewer |
| `bills` | Bill posting results — GL overrides, Zoho bill ID, URL |
| `matching` | GRN matching results per run |
| `field_acknowledgement_memory` | Per-field acknowledgement counts for auto-ACK |
| `tenants`, `users`, `app_settings`, `workflow_settings` | Configuration |

---

## Fixtures

### Directory Structure

```
fixtures/
├── nike/
│   ├── extraction.json         # Simulated OCR output
│   ├── vendor_validation.json  # (deprecated stage data)
│   ├── metadata_validation.json # PO / GRN field comparisons
│   ├── fp_extraction.json      # Faktur Pajak data (IDR only)
│   ├── line_item.json          # GRN candidate matches per line item
│   ├── bill_posting.json       # GL account + tax code mappings
│   ├── erp_result.json         # Mock Zoho API response
│   ├── nike_PO.json            # Sidecar: PO details
│   └── nike_grn.json           # Sidecar: GRN receipts
├── nike_usd/
├── CATERSPOT/
├── PT_NAU_CORP/
└── ... (8 scenarios total)
```

### Fixture Resolution

When a PDF is uploaded or emailed in, the backend resolves which fixture bundle to use based on the filename:

1. Normalise the filename: lowercase, strip extension, spaces/hyphens → underscores
2. Find the scenario key that is the **longest prefix match** of the normalised filename
3. Fall back to the first available bundle if nothing matches

Examples:
- `NIKE_USD.pdf` → normalises to `nike_usd` → matches `nike_usd` fixture
- `CATERSPOT_invoice.pdf` → normalises to `caterspot_invoice` → matches `CATERSPOT` fixture
- `random.pdf` → no match → falls back to first bundle

### Key Fixture Files

**`extraction.json`** — the simulated OCR output. Contains:
- `invoice_schema.metadata`: list of fields (po_number, invoice_number, vendor_name, currency, total_amount, etc.) each with `is_required` flag
- `invoice_schema.line_items`: list of line items with quantities and prices
- `bbox_schema`: per-field page coordinates and confidence scores (used for PDF viewer overlays)

**`metadata_validation.json`** — PO/GRN comparison data. Contains per-field comparisons:
- `match_status`: `"match"` or `"mismatch"`
- `values.invoice`, `values.po`, `values.grn`: the value from each source
- `is_acknowledged`, `acknowledged_by`, `acknowledged_at`

**`line_item.json`** — GRN matching candidates. Per invoice line item:
- List of GRN candidates with `match_status` (perfect / probable / no_match)
- Quantity and price from each candidate
- `is_ai_suggested` flag

**`bill_posting.json`** — GL account and tax code mappings per line item.

**`erp_result.json`** — mock Zoho Books API response returned when there are no live Zoho credentials.

---

## Stage Processing Model

### Stage Sequence

```
ingestion → extraction → fp_extraction* → metadata_validation → line_item_matching → bill_posting
```

\* `fp_extraction` only runs for IDR-currency invoices. It is auto-skipped for all other currencies.

### Stage Status Machine

```
start → in_progress → in_review → approved → completed
                                           ↘ rejected
```

- Every stage starts at `start` and transitions to `in_review` (where the human reviews)
- Approving a stage transitions it to `approved`, then immediately to `completed`, and triggers the next stage to advance from `start` to `in_review`
- Rejecting a stage marks the entire invoice as `rejected`

### Mandatory Field Validation

Before any stage can be approved, the backend validates mandatory fields. If any are missing the API returns `422` with:

```json
{ "missing": ["po_number", "invoice_date"] }
```

The frontend shows these inline so the user can fill them in before re-approving.

### Stage-Specific Validation Rules

| Stage | What is validated |
|-------|------------------|
| `extraction` | All metadata fields with `is_required: true` must have a non-empty value |
| `metadata_validation` | All `required: true` fields must be either matched or acknowledged |
| `fp_extraction` | All required FP fields with mismatches must be acknowledged |
| `line_item_matching` | Every invoice line item must have at least one confirmed GRN match |

---

## Manual Upload Flow

```
1. User clicks "Upload Invoice" → UploadModal
   → POST /api/v1/ingestion/upload (multipart PDF)

2. Backend resolves fixture bundle from filename
   → Creates: job → document → attachment → pipeline_run → invoice → bboxes
   → Seeds executed_stages for all stages
     (ingestion=completed, extraction=in_review, rest=start)
   → If STP enabled, spawns background STP task

3. Frontend redirects to /invoice/{id}/extraction-confirm
   → GET /api/v1/invoices/{id}/stages/extraction
   → Returns fixture extraction data + replayed edit history

4. User reviews metadata, edits PO number if needed, clicks Approve
   → PATCH /api/v1/invoices/{id}/stages/extraction/edit  (saves edits)
   → POST  /api/v1/invoices/{id}/stages/extraction/approve
   → Backend validates mandatory fields
   → Next stage (fp_extraction or metadata_validation) advances to in_review

5. User repeats review + approve for each subsequent stage

6. Final stage: user clicks "Post to ERP" on bill_posting
   → POST /api/v1/invoices/{id}/stages/bill_posting/submit
   → Backend posts to Zoho Books (real API call if credentials present, mock otherwise)
   → Stage auto-approved; pipeline_run.status = "completed"
   → Dashboard shows "ERP Posting" with link to Zoho bill
```

---

## Email Ingestion Flow

### How it works

A background Gmail poller runs every 60 seconds (configurable via `GMAIL_POLL_INTERVAL`). It looks for unread emails sent to `sales@neoflo.ai` with subject **"Invoice Processing"** and a PDF attachment.

```
Gmail inbox (sales@neoflo.ai)
       ↓
gmail_poller.py  — polls every 60s
       ↓
gmail_client.py  — fetches message + attachment bytes via Gmail REST API
       ↓
email_ingestion.py  — mirrors the manual upload pipeline exactly
       ↓
pipeline_runs collection  (source="email", source_meta.sender="user@example.com")
       ↓
(optional) STP auto-processes and posts the bill
       ↓
Confirmation email sent back to sender
```

### Sending an invoice by email

1. Attach the PDF to an email
2. Set the subject to exactly **"Invoice Processing"**
3. Send to **sales@neoflo.ai**
4. The poller picks it up within 60 seconds
5. The invoice appears in the dashboard (email icon indicates email source)

### User scoping

Email-ingested invoices are scoped by sender email. A logged-in user only sees email invoices where `source_meta.sender` matches their account email. Tenant admins see all invoices.

---

## Straight-Through Processing (STP)

STP is a global toggle (in the dashboard top-right) that enables automatic processing of every invoice — both manual uploads and email ingestions.

### STP Cascade

When STP is enabled and an invoice is created:

```
1. Poll until extraction reaches in_review
   → Auto-approve extraction
   → Mandatory field check — if fails, ABORT here (invoice stays for human review)

2. (3s pause)

3. Poll until metadata_validation reaches in_review
   → Auto-approve metadata_validation
   → If required fields unacknowledged, ABORT

4. (3s pause)

5. Poll until line_item_matching reaches in_review
   → Auto-approve line_item_matching
   → If any line items unmatched, ABORT

6. Poll until bill_posting reaches in_review
   → Auto-post bill to Zoho (real or mock)
   → Auto-approve bill_posting

7. If email-ingested: send confirmation email to original sender
```

If STP aborts at any stage the invoice stays at that stage for human review — it behaves exactly like a manually uploaded invoice from that point on.

### Field Acknowledgement Memory

To reduce repetitive clicks, the system tracks how many times a user has manually acknowledged each field mismatch:

- On invoice A, user acknowledges "vendor_address mismatch" → count = 1
- On invoice B with the same mismatch, if count ≥ threshold → system auto-acknowledges
- The threshold is configurable via `PATCH /api/v1/settings/ack-threshold`

---

## Deployment

### Docker Compose

```
docker compose up -d
```

Two containers:

| Container | Port mapping | What it serves |
|-----------|-------------|----------------|
| `backend` | 8001 → 8099 | FastAPI; mounts `/fixtures` volume |
| `frontend` | 3002 → 3002 | Next.js; configured with backend URL at build time |

### Nginx

On the demo server, Nginx routes:

| Domain | Port | Process |
|--------|------|---------|
| `invoicedemo.neoflo.ai` | 3002 | Docker frontend |
| `invoicedemo-api.neoflo.ai` | 8001 | Docker backend |

### Key Environment Variables

**Backend (`backend/.env`)**

| Variable | Purpose |
|----------|---------|
| `GMAIL_ENABLED` | `true`/`false` — enable Gmail polling |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | Gmail OAuth2 credentials |
| `GMAIL_TARGET_EMAIL` | Mailbox to poll (default: `sales@neoflo.ai`) |
| `GMAIL_POLL_INTERVAL` | Seconds between polls (default: 60) |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | Zoho Books OAuth2 (optional; mock used if absent) |
| `ANTHROPIC_API_KEY` | Claude API key (for Neo chat feature) |
| `FIXTURES_DIR` | Path to fixtures directory (default: `/fixtures` in Docker) |

**Frontend**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_BE_BASE_URL` | Browser-facing backend URL (e.g. `https://invoicedemo-api.neoflo.ai`) |
| `BE_BASE_URL` | Server-side backend URL for SSR requests |

---

## Key Design Patterns

### Edit History Replay

Invoice data is never stored redundantly. Instead:
- The fixture JSON is the **source of truth** for stage data
- User edits are stored as a delta (`edit_history`) in `executed_stages`
- On every `GET` request, the backend **re-loads the fixture** and replays the edit history on top

This means fixture JSON files can be edited on disk and changes appear immediately in the UI without restarting the backend.

### No Real PDF Processing

The PDF file is stored and served as-is. All extracted fields come from `extraction.json`. The bounding boxes in `bbox_schema` are also from the fixture — overlaid on the PDF viewer for a realistic visual effect.

### In-Memory Database

The in-memory database (`src/in_memory_db.py`) implements the full Motor (async MongoDB) API: `insert_one`, `find`, `update_one`, `aggregate`, cursors with `sort`/`skip`/`limit`, and all update operators (`$set`, `$push`, `$pull`, etc.). This makes a future migration to a real MongoDB a drop-in replacement with no code changes.

### Vendor Validation Stage (Deprecated)

The `vendor_validation` stage exists in the database schema for backward compatibility but is no longer displayed in the UI. Its logic was folded into the `metadata_validation` stage (shown as the "Matching" page). Any old pipeline runs with this stage are still queryable but new runs skip it.

### FP Extraction (IDR Only)

Faktur Pajak is an Indonesian tax document. The `fp_extraction` stage only activates when `currency = "IDR"`. For all other currencies the stage is seeded as `start` and auto-advanced without requiring human review.

### Zoho Integration

Bill posting makes real Zoho Books API calls when credentials are configured. Without credentials, the backend returns the mock response from `erp_result.json`. The frontend cannot tell the difference — it just follows the returned `zoho_url`.
