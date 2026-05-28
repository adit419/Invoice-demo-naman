import { TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-medium text-text-body">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={4}
          className={[
            "w-full rounded-[var(--radius-sm)] border px-3 py-2 text-sm text-text-body bg-surface-card-1 resize-none",
            "placeholder:text-text-placeholder",
            "transition-colors duration-150",
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
        />
        {error && <p className="text-xs text-text-error">{error}</p>}
        {hint && !error && <p className="text-xs text-text-caption">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
