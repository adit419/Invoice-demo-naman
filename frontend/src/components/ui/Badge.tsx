type BadgeVariant = "success" | "error" | "warning" | "information" | "default";
type BadgeSize = "sm" | "md";

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-surface-success-subtle text-text-success-on border-border-success",
  error: "bg-surface-error-subtle text-text-error-on border-border-error",
  warning: "bg-surface-warning-subtle text-text-warning-on border-border-warning",
  information: "bg-surface-info-subtle text-text-info-on border-border-info",
  default: "bg-surface-card-2 text-text-caption border-border-default",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

export function Badge({ variant = "default", size = "sm", children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 font-medium rounded-full border",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
