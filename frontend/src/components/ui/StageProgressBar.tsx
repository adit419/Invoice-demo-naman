type StageStatus = "completed" | "active" | "pending";

interface Stage {
  slug: string;
  label: string;
}

interface StageProgressBarProps {
  currentStage: string;
  completedStages?: string[];
}

const STAGES: Stage[] = [
  { slug: "ingestion", label: "Ingestion" },
  { slug: "extraction", label: "Extraction" },
  { slug: "vendor_validation", label: "Vendor Validation" },
  { slug: "metadata_validation", label: "Metadata Validation" },
  { slug: "line_item_matching", label: "Line Item Matching" },
  { slug: "bill_posting", label: "Bill Posting" },
  { slug: "erp_post", label: "ERP Post" },
];

function getStatus(slug: string, currentStage: string, completedStages: string[]): StageStatus {
  if (completedStages.includes(slug)) return "completed";
  if (slug === currentStage) return "active";
  return "pending";
}

export function StageProgressBar({
  currentStage,
  completedStages = [],
}: StageProgressBarProps) {
  return (
    <div className="w-full flex items-center">
      {STAGES.map((stage, i) => {
        const status = getStatus(stage.slug, currentStage, completedStages);
        const isLast = i === STAGES.length - 1;

        return (
          <div key={stage.slug} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={[
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-200",
                  status === "completed"
                    ? "bg-surface-primary border-border-primary text-text-on-color-heading"
                    : status === "active"
                    ? "bg-surface-card-1 border-border-primary text-text-primary"
                    : "bg-surface-card-2 border-border-default text-text-caption",
                ].join(" ")}
              >
                {status === "completed" ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={[
                  "text-[10px] font-medium mt-1 whitespace-nowrap",
                  status === "active"
                    ? "text-text-primary"
                    : status === "completed"
                    ? "text-text-body"
                    : "text-text-caption",
                ].join(" ")}
              >
                {stage.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={[
                  "h-0.5 flex-1 mx-1 mt-[-14px] transition-all duration-200",
                  status === "completed" ? "bg-surface-primary" : "bg-border-default",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
