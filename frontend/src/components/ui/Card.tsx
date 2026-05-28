import { HTMLAttributes } from "react";

type CardSurface = "1" | "2" | "3";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  surface?: CardSurface;
  padding?: "sm" | "md" | "lg" | "none";
  shadow?: boolean;
}

const surfaceClasses: Record<CardSurface, string> = {
  "1": "bg-surface-card-1 border-border-card-1",
  "2": "bg-surface-card-2 border-border-card-2",
  "3": "bg-surface-card-3 border-border-card-3",
};

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  surface = "1",
  padding = "md",
  shadow = true,
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-[var(--radius-md)] border",
        surfaceClasses[surface],
        paddingClasses[padding],
        shadow ? "shadow-small" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
