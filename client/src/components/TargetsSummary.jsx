// Shows the user's targets (BMI, calories, macros, water) with short explanations.
import { Droplets, Flame, Info, Scale } from 'lucide-react';
import BmiScale, { BmiHelp } from './BmiScale.jsx';
import { Notice } from './ui.jsx';
import { BMI_COLORS, BMI_LABELS, fmt } from '../utils/format.js';

const GOAL_TEXT = {
  lose: 'For gentle weight loss we subtract 500 kcal from your daily needs.',
  maintain: 'To maintain your weight, your target equals your daily needs.',
  gain: 'For gradual weight gain we add 300 kcal to your daily needs.',
};

export default function TargetsSummary({ t }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Scale className="h-4 w-4 text-brand-600" /> BMI <BmiHelp /></div>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold">{t.bmi}</span>
            <span className={`badge px-2 py-1 text-sm ${BMI_COLORS[t.bmi_category]}`}>{BMI_LABELS[t.bmi_category]}</span>
          </div>
          <BmiScale bmi={t.bmi} standard={t.bmi_standard} />
          <p className="muted text-sm">
            BMI = weight / height². A healthy weight for your height is {t.ideal_weight.min} - {t.ideal_weight.max} kg
            ({t.bmi_standard === 'asian' ? 'Asian' : 'WHO'} standard).
          </p>
        </div>
        <div className="card">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-orange-500" /> Daily calories</div>
          <div className="text-3xl font-bold">{fmt(t.calories)} <span className="text-base font-medium muted">kcal</span></div>
          <ul className="muted mt-2 space-y-1 text-sm">
            <li>Resting energy (BMR): <b className="text-slate-700 dark:text-slate-200">{fmt(t.bmr)} kcal</b></li>
            <li>With your activity (TDEE): <b className="text-slate-700 dark:text-slate-200">{fmt(t.tdee)} kcal</b></li>
            <li>{GOAL_TEXT[t.goal]}</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="mb-3 text-sm font-semibold">Macro targets per day</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Protein', t.macros.protein_g, t.macro_split.protein, 'bg-brand-50 dark:bg-brand-950/50'],
              ['Carbs', t.macros.carbs_g, t.macro_split.carbs, 'bg-amber-50 dark:bg-amber-950/40'],
              ['Fat', t.macros.fat_g, t.macro_split.fat, 'bg-indigo-50 dark:bg-indigo-950/40'],
            ].map(([l, g, pct, bg]) => (
              <div key={l} className={`rounded-xl p-3 ${bg}`}>
                <div className="text-xl font-bold">{g} g</div>
                <div className="muted text-xs">{l} · {pct}%</div>
              </div>
            ))}
          </div>
          <p className="muted mt-2 text-xs">Protein and carbs have 4 kcal per gram, fat has 9 kcal per gram.</p>
        </div>
        <div className="card">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Droplets className="h-4 w-4 text-sky-500" /> Water</div>
          <div className="text-3xl font-bold">{(t.water_ml / 1000).toFixed(1)} <span className="text-base font-medium muted">litres</span></div>
          <p className="muted mt-2 text-sm">About 35 ml per kg of body weight, including water from food and drinks.</p>
        </div>
      </div>

      {t.notes?.map((n) => <Notice key={n} tone="warn" icon={Info}>{n}</Notice>)}
    </div>
  );
}
