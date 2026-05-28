/**
 * Loader — visual + API equivalent of invoice-validator-fe's `<Loader>` (which
 * wraps AntD's `<Spin>`). The demo doesn't pull in AntD, so we use an inline
 * SVG spinner with Tailwind's `animate-spin` and AntD's primary blue (#1677FF).
 *
 *   <Loader />                    // 32px spinner, inline
 *   <Loader size="small" />       // 18px
 *   <Loader size="large" />       // 48px
 *   <Loader fullScreen />         // full-viewport centered overlay
 */
import React from "react";

interface LoaderProps {
  fullScreen?: boolean;
  size?: "small" | "default" | "large";
  /** Optional caption shown below the spinner (validator-fe parity). */
  tip?: string;
}

const SIZES: Record<NonNullable<LoaderProps["size"]>, number> = {
  small: 18,
  default: 32,
  large: 48,
};

function Spinner({ px }: { px: number }) {
  // Stroke ~25% of the circumference so the spinning arc is clearly visible.
  // Matches AntD's primary blue.
  const stroke = Math.max(2, Math.round(px / 10));
  const r = (px - stroke) / 2;
  const cx = px / 2;
  const cy = px / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * 0.25;
  return (
    <svg
      className="animate-spin"
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      fill="none"
      aria-label="Loading"
      role="status"
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke="#E5E7EB"
        strokeWidth={stroke}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke="#1677FF"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
      />
    </svg>
  );
}

export const Loader: React.FC<LoaderProps> = ({ fullScreen = false, size = "large", tip }) => {
  const px = SIZES[size];
  const body = (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      <Spinner px={px} />
      {tip && (
        <span style={{ fontSize: 13, color: "#6B7280" }}>{tip}</span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="h-screen w-screen flex items-center justify-center"
        style={{ background: "#ffffff" }}
      >
        {body}
      </div>
    );
  }
  return body;
};

export default Loader;
