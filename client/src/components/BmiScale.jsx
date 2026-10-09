// Colored BMI bar with a marker. The bands depend on the chosen standard.
import { Info } from 'lucide-react';

const BANDS = {
  asian: [18.5, 23, 25],
  who: [18.5, 25, 30],
};
const MIN = 15;
const MAX = 35;

export const BMI_STANDARD_HELP =
  'WHO standard: healthy 18.5-24.9, overweight from 25, obese from 30. ' +
  'Asian (WHO Asia-Pacific) standard: healthy 18.5-22.9, overweight from 23, obese from 25. ' +
  'Many Asian adults have more body fat at the same BMI, so health risks start at lower values.';

export function BmiHelp() {
  return (
    <span className="group relative inline-flex cursor-help align-middle" tabIndex={0}>
      <Info className="h-4 w-4 text-slate-400" />
      <span className="pointer-events-none absolute bottom-6 left-1/2 z-20 hidden w-64 -translate-x-1/2 rounded-xl bg-slate-900 p-3 text-xs font-normal leading-relaxed text-white shadow-lg group-hover:block group-focus:block">
        {BMI_STANDARD_HELP}
      </span>
    </span>
  );
}

export default function BmiScale({ bmi, standard = 'asian' }) {
  const [a, b, c] = BANDS[standard] || BANDS.asian;
  const pos = (v) => ((Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * 100;
  return (
    <div className="px-1">
      <div className="relative">
        <div className="flex h-3 overflow-hidden rounded-full">
          <div className="bg-sky-400" style={{ width: `${pos(a)}%` }} />
          <div className="bg-brand-500" style={{ width: `${pos(b) - pos(a)}%` }} />
          <div className="bg-amber-400" style={{ width: `${pos(c) - pos(b)}%` }} />
          <div className="flex-1 bg-orange-500" />
        </div>
        {bmi > 0 && (
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500" style={{ left: `${pos(bmi)}%` }}>
            <div className="h-5 w-5 rounded-full border-[3px] border-white bg-slate-900 shadow dark:border-slate-900 dark:bg-white" />
          </div>
        )}
      </div>
      <div className="muted relative mt-1 h-4 text-[10px]">
        {[a, b, c].map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: `${pos(v)}%` }}>{v}</span>
        ))}
      </div>
    </div>
  );
}
