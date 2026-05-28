/**
 * BillPostingScreen — unified rounded card with Metadata grid stacked above
 * Line items table, mirroring invoice-validator-fe's BillPostingScreen.
 */
import { BillPostingMetadataGrid } from "./BillPostingMetadataGrid";
import { BillPostingTable } from "./BillPostingTable";
import type { BillPostingData, LineItemEdit } from "./types";

interface BillPostingScreenProps {
  data: BillPostingData;
  isEditMode: boolean;
  metaEdits: Record<string, string>;
  onMetaEdit: (key: string, value: string) => void;
  lineEdits: Map<string, LineItemEdit>;
  onVatChange: (itemId: string, vatCode: string) => void;
  onWhtChange: (itemId: string, whtCode: string) => void;
  /** True when the vendor is subject to WHT deduction — shows WHT Tax Code column. */
  isVendorSubjectToWht: boolean;
  /**
   * Set of erp_fields keys where mask=true (from workflow settings).
   * null = no filtering (show all columns). Used to show/hide VAT/WHT columns.
   */
  allowedErpFields?: Set<string> | null;
  onRequestEditMode?: () => void;
  /** Invoice/run id — used by the Simulate ERP-posting preview. */
  invoiceId: string;
  /** Simulate is unavailable once the bill is already posted. */
  canSimulate?: boolean;
  /**
   * Persist current meta + line-item edits to the backend before running
   * simulate, so the server computes against the user's latest inputs.
   * No-op when there are no pending edits.
   */
  persistEdits?: () => Promise<void>;
}

export function BillPostingScreen({
  data,
  isEditMode,
  metaEdits,
  onMetaEdit,
  lineEdits,
  onVatChange,
  onWhtChange,
  isVendorSubjectToWht,
  allowedErpFields,
  onRequestEditMode,
  invoiceId,
  canSimulate = true,
  persistEdits,
}: BillPostingScreenProps) {
  return (
    <div className="px-6 py-5">
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <BillPostingMetadataGrid
          data={data}
          isEditMode={isEditMode}
          edits={metaEdits}
          onEdit={onMetaEdit}
          onRequestEditMode={onRequestEditMode}
          invoiceId={invoiceId}
          canSimulate={canSimulate}
          persistEdits={persistEdits}
        />

        <div className="mx-5 border-t border-gray-200" />

        <div className="px-5 pb-5 pt-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Line item</h3>
          <BillPostingTable
            lineItems={data.line_items ?? []}
            lineEdits={lineEdits}
            isEditMode={isEditMode}
            isVendorSubjectToWht={isVendorSubjectToWht}
            allowedErpFields={allowedErpFields}
            currency={data.bill_header?.currency ?? ""}
            onVatChange={onVatChange}
            onWhtChange={onWhtChange}
            onRequestEditMode={onRequestEditMode}
          />
        </div>
      </div>
    </div>
  );
}
