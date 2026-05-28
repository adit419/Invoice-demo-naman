import { useEffect, useState } from "react";

function useCountUp(target: number, duration = 800, delay = 0) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }
    const timer = setTimeout(() => {
      const startTime = performance.now();
      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        setCurrent(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timer);
  }, [target, duration, delay]);

  return current;
}

interface KpiCardProps {
  label: string;
  value: number;
  sublabel?: string;
  accentColor?: string;
  delay?: number;
  icon?: React.ReactNode;
}

export function KpiCard({ label, value, sublabel, accentColor = "var(--text-primary-default)", delay = 0, icon }: KpiCardProps) {
  const displayed = useCountUp(value, 900, delay);

  return (
    <div
      className="bg-surface-card-1 border border-border-card-1 rounded-xl p-5 flex flex-col gap-1 animate-slide-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-text-caption uppercase tracking-wide">{label}</p>
        {icon && <span className="text-text-caption opacity-60">{icon}</span>}
      </div>
      <p
        className="text-4xl font-semibold tracking-tight mt-1 animate-count-up"
        style={{
          color: accentColor,
          animationDelay: `${delay + 100}ms`,
          animationFillMode: "both",
        }}
      >
        {displayed}
      </p>
      {sublabel && <p className="text-xs text-text-caption">{sublabel}</p>}
    </div>
  );
}
