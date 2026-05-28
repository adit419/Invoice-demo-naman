import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
  side?: "left" | "right";
}

export function SideDrawer({
  open,
  onClose,
  title,
  children,
  width = "w-96",
  side = "right",
}: SideDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[998] flex">
      <div className="absolute inset-0 bg-grey-900/40" onClick={onClose} />
      <div
        className={[
          "absolute top-0 bottom-0 flex flex-col bg-surface-card-1 border-border-card-1 shadow-large",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          width,
        ].join(" ")}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
            <h2 className="text-sm font-semibold text-text-heading">{title}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-text-caption hover:bg-surface-card-2 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
