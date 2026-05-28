interface SkeletonBlockProps {
  className?: string;
  height?: string;
  rounded?: "sm" | "md" | "full";
}

const roundedMap = {
  sm: "rounded-[var(--radius-sm)]",
  md: "rounded-[var(--radius-md)]",
  full: "rounded-full",
};

export function SkeletonBlock({
  className = "",
  height = "h-4",
  rounded = "sm",
}: SkeletonBlockProps) {
  return (
    <div
      className={[
        "animate-pulse bg-surface-card-3",
        height,
        roundedMap[rounded],
        className,
      ].join(" ")}
    />
  );
}
