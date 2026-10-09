// Recipe detail: ingredients and nutrition calculated from the database
// (the recipe_nutrition view), plus "add to log".
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Users, Plus, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import MacroPie from '../components/MacroPie.jsx';
import { ErrorBox, Flash, Notice, SkeletonList, SourceBadge } from '../components/ui.jsx';
import { MEAL_LABELS, MEAL_TYPES, capitalize, fmt, isoDate, mealTypeForNow } from '../utils/format.js';

export default function RecipeDetail() {
  const { id } = useParams();
  const { data: r, loading, error, reload } = useApi(`/recipes/${id}`);
  const [portions, setPortions] = useState(1);
  const [mealType, setMealType] = useState(mealTypeForNow());
  const [flash, setFlash] = useState('');
  const [err, setErr] = useState('');

  if (loading) return <SkeletonList rows={3} className="h-32" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const grams = Math.round(r.serving_grams * portions);
  const log = async () => {
    setErr('');
    try {
      await api.post('/logs', { recipe_id: r.id, grams, meal_type: mealType, logged_on: isoDate() });
      setFlash(`Added to ${MEAL_LABELS[mealType].toLowerCase()}`);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="space-y-4">
      <Link to="/app/recipes" className="muted inline-flex items-center gap-1 text-sm"><ArrowLeft className="h-4 w-4" /> Recipes</Link>
      <div>
        <h1 className="page-title">{r.name}</h1>
        <p className="muted mt-1">{r.description}</p>
        <div className="muted mt-2 flex flex-wrap gap-4 text-sm">
          {r.prep_minutes != null && <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {r.prep_minutes} min</span>}
          <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {r.servings} serving{r.servings > 1 ? 's' : ''} · {fmt(r.serving_grams)} g each</span>
          {r.meal_types.length > 0 && <span>{r.meal_types.map(capitalize).join(', ')}</span>}
        </div>
      </div>
      {!r.fits_my_diet && <Notice tone="warn" icon={AlertTriangle}>This recipe does not fit your diet or allergy settings.</Notice>}
      {r.allergens.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.allergens.map((a) => <span key={a.id} className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">contains {a.name}</span>)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card">
            <h2 className="mb-2 font-semibold">Ingredients</h2>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {r.ingredients.map((i) => (
                <li key={i.food_id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-medium">{i.name}</span> <SourceBadge source={i.source} /></span>
                  <span className="muted tabular-nums">{i.grams} g</span>
                  <span className="w-16 text-right tabular-nums">{fmt(i.calories_kcal)} kcal</span>
                </li>
              ))}
            </ul>
            <div className="muted mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
              <span>Whole recipe ({fmt(r.total_grams)} g)</span><span className="font-semibold">{fmt(r.calories_kcal)} kcal</span>
            </div>
          </div>
          {r.instructions && (
            <div className="card">
              <h2 className="mb-2 font-semibold">How to make it</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed">{r.instructions}</p>
            </div>
          )}
        </div>

        <div className="card h-fit space-y-4">
          <div>
            <h2 className="font-semibold">Per serving</h2>
            <div className="text-3xl font-bold">{fmt(r.serving_calories_kcal)} <span className="muted text-base font-medium">kcal</span></div>
          </div>
          <MacroPie protein={r.serving_protein_g} carbs={r.serving_carbs_g} fat={r.serving_fat_g} size={120} />
          <p className="muted text-xs">Calculated from the ingredients: sum of (nutrient per 100 g x grams / 100), divided by servings.</p>
          <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label text-xs" htmlFor="po">Servings</label>
                <input id="po" className="input" type="number" min="0.25" step="0.25" max="10" value={portions} onChange={(e) => setPortions(Number(e.target.value))} />
              </div>
              <div>
                <label className="label text-xs" htmlFor="rm">Meal</label>
                <select id="rm" className="input" value={mealType} onChange={(e) => setMealType(e.target.value)}>
                  {MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
                </select>
              </div>
            </div>
            <button className="btn-primary w-full" disabled={!(grams > 0)} onClick={log}>
              <Plus className="h-4 w-4" /> Log {grams} g (~{fmt(r.serving_calories_kcal * portions)} kcal)
            </button>
            <ErrorBox message={err} />
          </div>
        </div>
      </div>
      <Flash message={flash} onDone={() => setFlash('')} />
    </div>
  );
}
