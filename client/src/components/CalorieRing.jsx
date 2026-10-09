// Donut showing calories eaten vs target. Pure SVG, no chart library needed.
export default function CalorieRing({ eaten, target, size = 168 }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, eaten / target) : 0;
  const remaining = Math.round(target - eaten);
  const over = remaining < 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-100 dark:stroke-slate-800" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className={`transition-all duration-700 ${over ? 'stroke-amber-500' : 'stroke-brand-500'}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-bold tabular-nums">{Math.abs(remaining).toLocaleString('en-US')}</span>
        <span className="muted text-xs">{over ? 'kcal above target' : 'kcal remaining'}</span>
      </div>
    </div>
  );
}
