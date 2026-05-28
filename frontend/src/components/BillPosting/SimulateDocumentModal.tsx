/**
 * SimulateDocumentModal — mirrors invoice-validator-fe's SimulateDocumentModal.
 *
 * Shows the simulated SAP/ERP posting document (the debit/credit journal
 * preview) returned by POST /invoices/{id}/stages/bill_posting/simulate, with a
 * success/error banner and a Debit/Credit/Balance totals footer.
 */
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { Modal, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";

export type SimulateStatus = "success" | "error";

export interface SimulateDocumentHeader {
  id: string;
  label: string;
  type: "number" | "text";
  width: number;
  align?: "left" | "right" | "center";
}

export interface SimulateDocumentRow {
  is_visible?: boolean;
  position?: number;
  index?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface SimulateDocumentData {
  headers: SimulateDocumentHeader[];
  rows: SimulateDocumentRow[];
  totals: { debit: number; credit: number; balance: number };
  meta: {
    run_id: string;
    bill_number: string;
    currency: string;
    country_code: string;
    line_item_count: number;
    calculated_at: string;
  };
}

interface SimulateDocumentModalProps {
  open: boolean;
  onClose: () => void;
  status: SimulateStatus;
  message: string;
  data: SimulateDocumentData | null;
}

const formatNumber = (value: number, fractionDigits = 2): string =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

const renderCell = (header: SimulateDocumentHeader, raw: unknown) => {
  if (raw === undefined || raw === null || raw === "") return "";
  if (header.type === "number") {
    const num = Number(raw);
    if (Number.isNaN(num)) return String(raw);
    return formatNumber(num, Number.isInteger(num) ? 0 : 2);
  }
  return String(raw);
};

const buildColumns = (
  headers: SimulateDocumentHeader[],
): ColumnsType<SimulateDocumentRow> =>
  headers.map((h) => ({
    title: h.label,
    dataIndex: h.id,
    key: h.id,
    width: h.width,
    align: h.align ?? (h.type === "number" ? "right" : "left"),
    render: (value: unknown) => renderCell(h, value),
  }));

export function SimulateDocumentModal({
  open,
  onClose,
  status,
  message,
  data,
}: SimulateDocumentModalProps) {
  const visibleRows = useMemo(
    () => (data?.rows ?? []).filter((r) => r.is_visible !== false),
    [data],
  );

  const columns = useMemo(
    () => (data ? buildColumns(data.headers) : []),
    [data],
  );

  const isSuccess = status === "success";
  const Icon = isSuccess ? CheckCircleOutlined : CloseCircleOutlined;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Simulate Document"
      width={960}
      footer={null}
      destroyOnClose
    >
      <div className="flex flex-col gap-4">
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
          style={
            isSuccess
              ? { background: "#F0FDF4", borderColor: "#BBF7D0", color: "#15803D" }
              : { background: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }
          }
        >
          <Icon className="flex-shrink-0 mt-0.5" />
          <span className="font-medium break-words">{message}</span>
        </div>

        {data && (
          <>
            <Table<SimulateDocumentRow>
              columns={columns}
              dataSource={visibleRows}
              rowKey={(row, idx) => `${row.position ?? row.index ?? idx}`}
              pagination={false}
              size="small"
              scroll={{ x: "max-content", y: 400 }}
              bordered
            />

            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Total {visibleRows.length} items</span>
              <div className="flex items-center gap-6">
                <span>
                  Debit:&nbsp;
                  <strong className="text-gray-800">
                    {formatNumber(data.totals.debit)} {data.meta.currency}
                  </strong>
                </span>
                <span>
                  Credit:&nbsp;
                  <strong className="text-gray-800">
                    {formatNumber(data.totals.credit)} {data.meta.currency}
                  </strong>
                </span>
                <span>
                  Balance:&nbsp;
                  <strong style={{ color: data.totals.balance === 0 ? "#15803D" : "#B91C1C" }}>
                    {formatNumber(data.totals.balance)} {data.meta.currency}
                  </strong>
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
