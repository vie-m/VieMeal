// Create my own recipe from foods in the database. Nutrition is previewed
// live and calculated again on the server by the recipe_nutrition view.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApi, useDebounced } from '../hooks/useApi.js';
import { ErrorBox, SourceBadge } from '../components/ui.jsx';
import { MEAL_LABELS, MEAL_TYPES, fmt } from '../utils/format.js';

export default function RecipeNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', description: '', instructions: '', servings: 1, prep_minutes: '', meal_types: [] });
  const [ingredients, setIngredients] = useState([]); // [{ food, grams }]
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const { data: results } = useApi(dq.length >= 2 ? `/foods/search?q=${encodeURIComponent(dq)}&all=1` : null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  const add = (food) => {
    if (!ingredients.some((i) => i.food.id === food.id)) setIngredients([...ingredients, { food, grams: 100 }]);
    setQ('');
  };

  // Live preview: same formula as the SQL view (nutrient per 100 g x grams / 100).
  const total = ingredients.reduce((t, i) => {
    const f = (Number(i.grams) || 0) / 100;
    t.kcal += i.food.calories_kcal * f; t.p += i.food.protein_g * f; t.c += i.food.carbs_g * f; t.fat += i.food.fat_g * f;
    return t;
  }, { kcal: 0, p: 0, c: 0, fat: 0 });
  const per = (v) => v / (Number(form.servings) || 1);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!ingredients.length) return setErr('Add at least one ingredient');
    setBusy(true);
    try {
      const r = await api.post('/recipes', {
        ...form,
        servings: Number(form.servings),
        prep_minutes: form.prep_minutes === '' ? undefined : Number(form.prep_minutes),
        ingredients: ingredients.map((i) => ({ food_id: i.food.id, grams: Number(i.grams) })),
      });
      navigate(`/app/recipes/${r.id}`, { replace: true });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Link to="/app/recipes" className="muted inline-flex items-center gap-1 text-sm"><ArrowLeft className="h-4 w-4" /> Recipes</Link>
      <h1 className="page-title">New recipe</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card space-y-3">
            <div>
              <label className="label" htmlFor="rn">Name</label>
              <input id="rn" className="input" required maxLength={150} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="rd">Short description</label>
              <input id="rd" className="input" maxLength={500} value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="rs">Servings</label>
                <input id="rs" className="input" type="number" min="1" max="50" required value={form.servings} onChange={(e) => set({ servings: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="rp">Prep time (min)</label>
                <input id="rp" className="input" type="number" min="0" max="1440" value={form.prep_minutes} onChange={(e) => set({ prep_minutes: e.target.value })} />
              </div>
            </div>
            <div>
              <span className="label">Good for</span>
              <div className="flex flex-wrap gap-2">
                {MEAL_TYPES.map((m) => (
                  <button type="button" key={m} className={form.meal_types.includes(m) ? 'chip-on' : 'chip-off'}
                    onClick={() => set({ meal_types: form.meal_types.includes(m) ? form.meal_types.filter((x) => x !== m) : [...form.meal_types, m] })}>
                    {MEAL_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold">Ingredients</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search a food to add" value={q} onChange={(e) => setQ(e.target.value)} />
              {dq.length >= 2 && results?.items?.length > 0 && q && (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {results.items.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => add(f)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span className="min-w-0 flex-1 truncate">{f.name}</span> <SourceBadge source={f.source} />
                        <span className="muted text-xs">{Math.round(f.calories_kcal)} kcal/100 g</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {ingredients.length === 0 ? <p className="muted text-sm">No ingredients yet.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {ingredients.map((i, idx) => (
                  <li key={i.food.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{i.food.name}</span>
                    <input className="input w-20 py-1.5 text-right" type="number" min="1" max="5000" value={i.grams}
                      onChange={(e) => setIngredients(ingredients.map((x, j) => (j === idx ? { ...x, grams: e.target.value } : x)))} />
                    <span className="muted text-xs">g</span>
                    <button type="button" className="btn-ghost p-2" onClick={() => setIngredients(ingredients.filter((_, j) => j !== idx))} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <label className="label" htmlFor="ri">Instructions</label>
            <textarea id="ri" className="input min-h-[120px]" maxLength={5000} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} />
          </div>
        </div>

        <div className="card h-fit space-y-3 lg:sticky lg:top-8">
          <h2 className="font-semibold">Per serving (preview)</h2>
          <div className="text-3xl font-bold">{fmt(per(total.kcal))} <span className="muted text-base font-medium">kcal</span></div>
          <p className="muted text-sm">Protein {fmt(per(total.p), 1)} g · Carbs {fmt(per(total.c), 1)} g · Fat {fmt(per(total.fat), 1)} g</p>
          <ErrorBox message={err} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving...' : 'Save recipe'}</button>
        </div>
      </div>
    </form>
  );
}
