import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = "", id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-medium text-text-body">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={[
            "h-9 w-full rounded-[var(--radius-sm)] border px-3 text-sm text-text-body bg-surface-card-1",
            "transition-colors duration-150 cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-[var(--border-primary-focus)] focus:border-border-primary",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error
              ? "border-border-error"
              : "border-border-default hover:border-border-default-hover",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-text-error">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
