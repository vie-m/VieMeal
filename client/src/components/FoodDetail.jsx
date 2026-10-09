// Food detail: nutrition per 100 g and per chosen amount, macro pie, allergens,
// favorite / dislike and "add to log". Shown as a modal from search and diary.
import { useEffect, useState } from 'react';
import { Heart, ThumbsDown, Plus, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import MacroPie from './MacroPie.jsx';
import { ErrorBox, Modal, Notice, SkeletonList, SourceBadge } from './ui.jsx';
import { MEAL_LABELS, MEAL_TYPES, capitalize, isoDate, mealTypeForNow, scale } from '../utils/format.js';

const ROWS = [
  ['Calories', 'calories_kcal', 'kcal'],
  ['Protein', 'protein_g', 'g'],
  ['Carbohydrates', 'carbs_g', 'g'],
  ['  of which sugars', 'sugar_g', 'g'],
  ['Fat', 'fat_g', 'g'],
  ['Fiber', 'fiber_g', 'g'],
  ['Sodium', 'sodium_mg', 'mg'],
];

export default function FoodDetail({ foodId, onClose, onLogged, date }) {
  const { data: food, loading, error, setData } = useApi(foodId ? `/foods/${foodId}` : null);
  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState(mealTypeForNow());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Default amount = first household serving ("1 piring") if there is one.
  useEffect(() => {
    if (food) setGrams(food.servings?.[0]?.grams ?? 100);
    setMsg('');
    setErr('');
  }, [food?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (kind) => {
    const on = kind === 'favorite' ? food.is_favorite : food.is_disliked;
    try {
      await (on ? api.del(`/foods/${food.id}/${kind}`) : api.post(`/foods/${food.id}/${kind}`));
      setData({ ...food, [kind === 'favorite' ? 'is_favorite' : 'is_disliked']: !on,
        ...(kind === 'favorite' && !on ? { is_disliked: false } : {}),
        ...(kind === 'dislike' && !on ? { is_favorite: false } : {}) });
    } catch (e) {
      setErr(e.message);
    }
  };

  const addToLog = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/logs', { food_id: food.id, grams: Number(grams), meal_type: mealType, logged_on: date || isoDate() });
      setMsg(`Added ${grams} g to ${MEAL_LABELS[mealType].toLowerCase()}`);
      onLogged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const portion = food ? scale(food, grams) : null;
  const myAllergens = food?.allergens?.filter((a) => a.mine) || [];

  return (
    <Modal open={Boolean(foodId)} onClose={onClose} title={food?.name || 'Food'} wide>
      {loading && <SkeletonList rows={3} />}
      <ErrorBox message={error} />
      {food && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {food.category && <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{capitalize(food.category)}</span>}
            <SourceBadge source={food.source} />
            {food.is_vegan && <span className="badge bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">vegan</span>}
            {!food.is_vegan && food.is_vegetarian && <span className="badge bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">vegetarian</span>}
            {food.is_halal && <span className="badge bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">halal</span>}
            {food.allergens.map((a) => (
              <span key={a.id} className={`badge ${a.mine ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                contains {a.name}
              </span>
            ))}
          </div>

          {myAllergens.length > 0 && (
            <Notice tone="warn" icon={AlertTriangle}>Contains {myAllergens.map((a) => a.name).join(', ')}, which is on your avoid list.</Notice>
          )}
          {food.source === 'estimate' && (
            <p className="muted text-xs">Values for this dish are estimates; recipes vary between cooks and regions.</p>
          )}

          {/* Amount calculator */}
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-28">
                <label className="label" htmlFor="g">Amount (g)</label>
                <input id="g" className="input" type="number" inputMode="decimal" min="1" max="5000" value={grams}
                  onChange={(e) => setGrams(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                {[...food.servings, { id: 'x', description: '100 g', grams: 100 }].map((s) => (
                  <button key={s.id} type="button" className={Number(grams) === Number(s.grams) ? 'chip-on' : 'chip-off'}
                    onClick={() => setGrams(s.grams)}>{s.description}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="muted text-left text-xs">
                  <th className="pb-2 font-medium">Nutrient</th>
                  <th className="pb-2 text-right font-medium">per 100 g</th>
                  <th className="pb-2 text-right font-medium">per {grams || 0} g</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ROWS.map(([label, key, unit]) => (
                  <tr key={key}>
                    <td className={`py-1.5 ${label.startsWith(' ') ? 'pl-3 muted' : ''}`}>{label.trim()}</td>
                    <td className="py-1.5 text-right tabular-nums">{food[key] ?? 0} {unit}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{portion[key]} {unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <p className="label">Where the calories come from</p>
              <MacroPie protein={portion.protein_g} carbs={portion.carbs_g} fat={portion.fat_g} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="w-36">
              <label className="label" htmlFor="mt">Meal</label>
              <select id="mt" className="input" value={mealType} onChange={(e) => setMealType(e.target.value)}>
                {MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
              </select>
            </div>
            <button className="btn-primary" disabled={busy || !(grams > 0)} onClick={addToLog}>
              <Plus className="h-4 w-4" /> {busy ? 'Adding...' : 'Add to log'}
            </button>
            <div className="ml-auto flex gap-2">
              <button className={`btn-secondary ${food.is_favorite ? 'text-rose-600' : ''}`} onClick={() => toggle('favorite')} title="Favorite">
                <Heart className={`h-4 w-4 ${food.is_favorite ? 'fill-current' : ''}`} /> <span className="hidden sm:inline">Favorite</span>
              </button>
              <button className={`btn-secondary ${food.is_disliked ? 'text-amber-600' : ''}`} onClick={() => toggle('dislike')} title="Never plan this food">
                <ThumbsDown className={`h-4 w-4 ${food.is_disliked ? 'fill-current' : ''}`} /> <span className="hidden sm:inline">Dislike</span>
              </button>
            </div>
          </div>
          {msg && <Notice tone="success">{msg}</Notice>}
          <ErrorBox message={err} />
        </div>
      )}
    </Modal>
  );
}
