// Small shared UI pieces: skeletons, empty/error states, progress bars, modal.
import { useEffect } from 'react';
import { AlertCircle, Inbox, X } from 'lucide-react';

export function Skeleton({ className = 'h-24' }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonList({ rows = 4, className = 'h-16' }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={className} />)}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && <button className="font-semibold underline" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Notice({ children, tone = 'info', icon: Icon }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
    success: 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-200',
    warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  };
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${tones[tone]}`}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="mb-3 rounded-full bg-brand-50 p-4 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      {text && <p className="muted mt-1 max-w-sm text-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Horizontal progress bar: value vs target.
export function ProgressBar({ label, value, target, unit = 'g', color = 'bg-brand-500' }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target * 1.1;
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="muted tabular-nums">
          {Math.round(value)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-amber-500' : color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EstimatedBadge() {
  return (
    <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" title="Nutrition values for this dish are estimates">
      estimated values
    </span>
  );
}

export function SourceBadge({ source }) {
  if (source === 'estimate') return <EstimatedBadge />;
  if (source === 'custom') return <span className="badge bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">my food</span>;
  if (source === 'openfoodfacts') return <span className="badge bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">barcode</span>;
  return null;
}

export const DISCLAIMER =
  'For general information only, not medical advice. Consult a doctor or nutritionist for medical conditions, pregnancy, or eating concerns.';

export function Disclaimer({ className = '' }) {
  return <p className={`muted text-xs ${className}`}>{DISCLAIMER}</p>;
}

// Small message at the bottom of the screen that disappears after a few seconds.
export function Flash({ message, onDone, ms = 3000 }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [message, onDone, ms]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-8">
      <div className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-slate-900">{message}</div>
    </div>
  );
}
