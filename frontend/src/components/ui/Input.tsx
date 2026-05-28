import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-text-body"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            "h-9 w-full rounded-[var(--radius-sm)] border px-3 text-sm text-text-body bg-surface-card-1",
            "placeholder:text-text-placeholder",
            "transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:ring-[var(--border-primary-focus)] focus:border-border-primary",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-card-2",
            error
              ? "border-border-error focus:ring-[var(--border-error-focus)]"
              : "border-border-default hover:border-border-default-hover",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        {error && <p className="text-xs text-text-error">{error}</p>}
        {hint && !error && <p className="text-xs text-text-caption">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
