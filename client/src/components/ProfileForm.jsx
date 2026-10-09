// Profile form fields shared by onboarding (split into steps) and the settings page.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ACTIVITY, DIETS, GOALS } from '../utils/format.js';
import { BmiHelp } from './BmiScale.jsx';
import { Notice } from './ui.jsx';
import { HeartHandshake } from 'lucide-react';

export const EMPTY_PROFILE = {
  sex: 'female', birth_date: '', height_cm: '', weight_kg: '', activity_level: 'light', goal: 'maintain',
  diet_type: 'any', meals_per_day: 3, bmi_standard: 'asian', protein_pct: 25, carbs_pct: 50, fat_pct: 25,
};

// Guest mode does not assume sex, age, activity, diet or targets.
export const BLANK_PROFILE = {
  sex: '', birth_date: '', height_cm: '', weight_kg: '', activity_level: '', goal: '',
  diet_type: '', meals_per_day: '', bmi_standard: '', protein_pct: '', carbs_pct: '', fat_pct: '',
};

// Quick BMI in the browser, only to decide whether "lose" is allowed.
// The server checks the same rule again (never trust the client).
export function isUnderweight(form) {
  const h = Number(form.height_cm) / 100;
  const w = Number(form.weight_kg);
  return h > 0 && w > 0 && w / (h * h) < 18.5;
}

function Choice({ options, value, onChange, cols = 'sm:grid-cols-3' }) {
  return (
    <div className={`grid gap-2 ${cols}`}>
      {options.map(([v, label, help, disabled]) => (
        <button
          type="button" key={v} disabled={disabled}
          onClick={() => onChange(v)}
          className={`rounded-xl border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
            value === v
              ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600 dark:bg-brand-950/60'
              : 'border-slate-200 hover:border-brand-400 dark:border-slate-700'}`}
        >
          <div className="font-semibold">{label}</div>
          {help && <div className="muted text-xs">{help}</div>}
        </button>
      ))}
    </div>
  );
}

export function BodyFields({ form, set }) {
  return (
    <div className="space-y-4">
      <div>
        <span className="label">Sex</span>
        <Choice cols="grid-cols-2" value={form.sex} onChange={(v) => set({ sex: v })}
          options={[['female', 'Female'], ['male', 'Male']]} />
        <p className="muted mt-1 text-xs">Used only for the calorie formula (Mifflin-St Jeor).</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="bd">Birth date</label>
          <input id="bd" type="date" className="input" required value={form.birth_date}
            max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ birth_date: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="hc">Height (cm)</label>
          <input id="hc" type="number" inputMode="decimal" min="100" max="250" step="0.1" required className="input"
            value={form.height_cm} onChange={(e) => set({ height_cm: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="wk">Weight (kg)</label>
          <input id="wk" type="number" inputMode="decimal" min="25" max="400" step="0.1" required className="input"
            value={form.weight_kg} onChange={(e) => set({ weight_kg: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

export function GoalFields({ form, set }) {
  const under = isUnderweight(form);
  // If the user became underweight, quietly move them off "lose".
  useEffect(() => {
    if (under && form.goal === 'lose') set({ goal: 'maintain' });
  }, [under]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div>
        <span className="label">Activity level</span>
        <Choice value={form.activity_level} onChange={(v) => set({ activity_level: v })} options={ACTIVITY} />
      </div>
      <div>
        <span className="label">Goal</span>
        <Choice value={form.goal} onChange={(v) => set({ goal: v })}
          options={GOALS.map(([v, l, h]) => [v, l, h, v === 'lose' && under])} />
        {under && (
          <div className="mt-2">
            <Notice tone="info" icon={HeartHandshake}>
              Your BMI is in the underweight range, so weight loss is not offered. Maintaining or gently gaining is
              a healthier choice. A doctor or nutritionist can give you personal advice.
            </Notice>
          </div>
        )}
      </div>
      <div>
        <span className="label">Meals per day</span>
        <div className="flex gap-2">
          {[3, 4, 5].map((n) => (
            <button type="button" key={n} className={form.meals_per_day === n ? 'chip-on' : 'chip-off'}
              onClick={() => set({ meals_per_day: n })}>
              {n} {n > 3 ? `(${n - 3} snack${n > 4 ? 's' : ''})` : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Diet type + allergen checkboxes. `allergens` = { all: [...], selected: [ids] }.
export function DietFields({ form, set, allergens, setAllergens }) {
  const toggle = (id) => setAllergens(allergens.selected.includes(id)
    ? allergens.selected.filter((x) => x !== id)
    : [...allergens.selected, id]);
  return (
    <div className="space-y-4">
      <div>
        <span className="label">Diet</span>
        <div className="flex flex-wrap gap-2">
          {DIETS.map(([v, l]) => (
            <button type="button" key={v} className={form.diet_type === v ? 'chip-on' : 'chip-off'}
              onClick={() => set({ diet_type: v })}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">Allergies / foods to avoid</span>
        <div className="flex flex-wrap gap-2">
          {allergens.all.map((a) => (
            <button type="button" key={a.id} className={allergens.selected.includes(a.id) ? 'chip-on' : 'chip-off'}
              onClick={() => toggle(a.id)}>{a.name}</button>
          ))}
        </div>
        <p className="muted mt-1 text-xs">Foods containing these are hidden from search and never planned.</p>
      </div>
      <div>
        <span className="label flex items-center gap-1">BMI standard <BmiHelp /></span>
        <div className="flex gap-2">
          {[['asian', 'Asian (Asia-Pacific)'], ['who', 'WHO']].map(([v, l]) => (
            <button type="button" key={v} className={form.bmi_standard === v ? 'chip-on' : 'chip-off'}
              onClick={() => set({ bmi_standard: v })}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Load profile + allergen list from the server into form state.
export function useProfileForm(blank = false) {
  const initial = blank ? BLANK_PROFILE : EMPTY_PROFILE;
  const [form, setForm] = useState(initial);
  const [allergens, setAllergenState] = useState({ all: [], selected: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [p, a] = await Promise.all([api.get('/profile'), api.get('/profile/allergens')]);
        if (p.profile) {
          const pr = p.profile;
          setForm({
            ...initial,
            ...Object.fromEntries(Object.keys(initial).map((k) => [k, pr[k] ?? initial[k]])),
            birth_date: String(pr.birth_date).slice(0, 10),
            weight_kg: pr.weight_kg ?? '',
          });
        }
        setAllergenState(a);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [initial]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setAllergens = (selected) => setAllergenState((a) => ({ ...a, selected }));

  // Save both the profile and the allergen list.
  const save = async () => {
    const body = {
      ...form,
      height_cm: Number(form.height_cm),
      weight_kg: form.weight_kg === '' ? undefined : Number(form.weight_kg),
      meals_per_day: Number(form.meals_per_day),
      protein_pct: Number(form.protein_pct), carbs_pct: Number(form.carbs_pct), fat_pct: Number(form.fat_pct),
    };
    await api.put('/profile', body);
    await api.put('/profile/allergens', { allergen_ids: allergens.selected });
  };

  return { form, set, allergens, setAllergens, loading, error, save };
}
