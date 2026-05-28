import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  LoadingOutlined,
} from "@ant-design/icons";

interface Step {
  label: string;
  status: "done" | "active" | "pending";
}

interface Props {
  title: string;
  subtitle: string;
  steps: Step[];
  onBack?: () => void;
}

function StepIcon({ status }: { status: Step["status"] }) {
  if (status === "done") {
    return (
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "#101828" }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6l2.5 2.5L9.5 3"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (status === "active") {
    return <LoadingOutlined style={{ color: "#1876FF", fontSize: 18, flexShrink: 0 }} />;
  }
  return (
    <div
      className="w-4 h-4 rounded-full border-2 shrink-0"
      style={{ borderColor: "#D1D5DB" }}
    />
  );
}

export function StageTransitionOverlay({ title, subtitle, steps, onBack }: Props) {
  // The header title reflects the stage currently in progress — same pattern as
  // invoice-validator-fe's ProcessingScreen.
  const activeStep = steps.find((s) => s.status === "active");
  const headerTitle = activeStep?.label ?? title;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{
        background: "#ffffff",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex items-center justify-center w-8 h-8 rounded text-gray-700 hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeftOutlined />
          </button>
        )}
        <h4 className="m-0 text-lg font-medium" style={{ color: "#101828" }}>
          {headerTitle}
        </h4>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="flex flex-col items-center max-w-md w-full">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
            style={{ background: "#F3F4F6" }}
          >
            <FileTextOutlined style={{ fontSize: 36, color: "#9CA3AF" }} />
          </div>

          <p className="text-center text-[15px] mb-2" style={{ color: "#6B7280" }}>
            {title}
          </p>
          <p className="text-sm text-center mb-8" style={{ color: "#9CA3AF" }}>
            {subtitle}
          </p>

          <div className="w-full space-y-1 mb-6">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-2 px-4 rounded-lg"
                style={{
                  background: step.status === "active" ? "#EFF6FF" : "transparent",
                }}
              >
                <div className="mt-0.5">
                  <StepIcon status={step.status} />
                </div>
                <div className="flex flex-col">
                  <span
                    className="font-medium"
                    style={{
                      color:
                        step.status === "done"
                          ? "#374151"
                          : step.status === "active"
                            ? "#1D4ED8"
                            : "#9CA3AF",
                    }}
                  >
                    {step.label}
                  </span>
                  {step.status === "active" && (
                    <span className="text-sm" style={{ color: "#3B82F6" }}>
                      In progress...
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ color: "#2563EB", background: "#EFF6FF" }}
          >
            <ClockCircleOutlined />
            <span className="text-sm font-medium">
              Processing in progress - this may take a few minutes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
