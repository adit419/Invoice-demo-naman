type InvoiceStatus =
  | "pending"
  | "processing"
  | "extraction"
  | "vendor_validation"
  | "metadata_validation"
  | "matching"
  | "bill_posting"
  | "posted"
  | "rejected"
  | "failed";

interface StatusChipProps {
  status: InvoiceStatus | string;
  className?: string;
}

const statusConfig: Record<
  string,
  { label: string; classes: string; dot: string }
> = {
  pending: {
    label: "Pending",
    classes: "bg-surface-card-2 text-text-caption border-border-default",
    dot: "bg-text-caption",
  },
  processing: {
    label: "Processing",
    classes: "bg-surface-info-subtle text-text-info-on border-border-info",
    dot: "bg-icon-info",
  },
  extraction: {
    label: "Extraction",
    classes: "bg-surface-info-subtle text-text-info-on border-border-info",
    dot: "bg-icon-info",
  },
  vendor_validation: {
    label: "Vendor Validation",
    classes: "bg-surface-info-subtle text-text-info-on border-border-info",
    dot: "bg-icon-info",
  },
  metadata_validation: {
    label: "Metadata Validation",
    classes: "bg-surface-info-subtle text-text-info-on border-border-info",
    dot: "bg-icon-info",
  },
  matching: {
    label: "Matching",
    classes: "bg-surface-warning-subtle text-text-warning-on border-border-warning",
    dot: "bg-icon-warning",
  },
  line_item_matching: {
    label: "Matching",
    classes: "bg-surface-warning-subtle text-text-warning-on border-border-warning",
    dot: "bg-icon-warning",
  },
  bill_posting: {
    label: "Bill Posting",
    classes: "bg-surface-warning-subtle text-text-warning-on border-border-warning",
    dot: "bg-icon-warning",
  },
  posted: {
    label: "Posted",
    classes: "bg-surface-success-subtle text-text-success-on border-border-success",
    dot: "bg-icon-success",
  },
  rejected: {
    label: "Rejected",
    classes: "bg-surface-error-subtle text-text-error-on border-border-error",
    dot: "bg-icon-error",
  },
  failed: {
    label: "Failed",
    classes: "bg-surface-error-subtle text-text-error-on border-border-error",
    dot: "bg-icon-error",
  },
};

export function StatusChip({ status, className = "" }: StatusChipProps) {
  const config = statusConfig[status] ?? {
    label: status,
    classes: "bg-surface-card-2 text-text-caption border-border-default",
    dot: "bg-text-caption",
  };

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium",
        config.classes,
        className,
      ].join(" ")}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
