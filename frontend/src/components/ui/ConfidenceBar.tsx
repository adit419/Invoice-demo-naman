interface ConfidenceBarProps {
  value: number;
  showLabel?: boolean;
  className?: string;
}

function getConfidenceColor(value: number): string {
  if (value >= 0.95) return "bg-surface-success";
  if (value >= 0.8) return "bg-surface-warning";
  return "bg-surface-error";
}

function getConfidenceTextColor(value: number): string {
  if (value >= 0.95) return "text-text-success-on";
  if (value >= 0.8) return "text-text-warning-on";
  return "text-text-error-on";
}

export function ConfidenceBar({
  value,
  showLabel = false,
  className = "",
}: ConfidenceBarProps) {
  const pct = Math.round(value * 100);
  const barColor = getConfidenceColor(value);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 rounded-full bg-surface-card-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-xs font-medium tabular-nums w-9 text-right ${getConfidenceTextColor(value)}`}>
          {pct}%
        </span>
      )}
    </div>
  );
}
