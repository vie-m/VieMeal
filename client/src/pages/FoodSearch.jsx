// Food search: instant results, category chips, "estimated" badge,
// custom foods. Clicking a result opens the food detail.
import { useEffect, useState } from 'react';
import { Search, Plus, Heart, SearchX, ChevronDown } from 'lucide-react';
import { api } from '../api.js';
import { useApi, useDebounced } from '../hooks/useApi.js';
import FoodDetail from '../components/FoodDetail.jsx';
import { EmptyState, ErrorBox, Flash, Modal, Notice, SkeletonList, SourceBadge } from '../components/ui.jsx';
import { capitalize } from '../utils/format.js';

function FoodRow({ f, onOpen }) {
  return (
    <button onClick={() => onOpen(f.id)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{f.name}</span>
          {f.is_favorite && <Heart className="h-3.5 w-3.5 shrink-0 fill-rose-500 text-rose-500" />}
        </div>
        <div className="muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {f.category && <span>{capitalize(f.category)}</span>}
          <span>P {f.protein_g} · C {f.carbs_g} · F {f.fat_g} g</span>
          <SourceBadge source={f.source} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-semibold tabular-nums">{Math.round(f.calories_kcal)}</div>
        <div className="muted text-[11px]">kcal/100 g</div>
      </div>
    </button>
  );
}

function CustomFoodModal({ open, onClose, onCreated, categories, allergens }) {
  const empty = { name: '', category_id: '', calories_kcal: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '',
    sugar_g: '', sodium_mg: '', serving_name: '', serving_grams: '', is_vegetarian: false, is_vegan: false, allergen_ids: [] };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const numOr = (v) => (v === '' ? undefined : Number(v));
      const food = await api.post('/foods', {
        ...f,
        category_id: numOr(f.category_id),
        calories_kcal: Number(f.calories_kcal), protein_g: numOr(f.protein_g), carbs_g: numOr(f.carbs_g), fat_g: numOr(f.fat_g),
        fiber_g: numOr(f.fiber_g), sugar_g: numOr(f.sugar_g), sodium_mg: numOr(f.sodium_mg), serving_grams: numOr(f.serving_grams),
        serving_name: f.serving_name || undefined,
      });
      setF(empty);
      onCreated(food.id);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const numField = (key, label) => (
    <div>
      <label className="label text-xs" htmlFor={key}>{label}</label>
      <input id={key} className="input" type="number" inputMode="decimal" min="0" step="0.1" value={f[key]}
        onChange={(e) => set({ [key]: e.target.value })} required={key === 'calories_kcal'} />
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Add my own food" wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="muted text-sm">Values per 100 g (check the nutrition label). Only you can see your foods.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fn">Name</label>
            <input id="fn" className="input" required maxLength={255} value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="fc">Category</label>
            <select id="fc" className="input" value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}>
              <option value="">Other</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{capitalize(c.name)}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numField('calories_kcal', 'Calories (kcal)')}
          {numField('protein_g', 'Protein (g)')}
          {numField('carbs_g', 'Carbs (g)')}
          {numField('fat_g', 'Fat (g)')}
          {numField('fiber_g', 'Fiber (g)')}
          {numField('sugar_g', 'Sugar (g)')}
          {numField('sodium_mg', 'Sodium (mg)')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-xs" htmlFor="sn">Serving name (optional)</label>
            <input id="sn" className="input" placeholder="1 bungkus" value={f.serving_name} onChange={(e) => set({ serving_name: e.target.value })} />
          </div>
          {numField('serving_grams', 'Serving size (g)')}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={f.is_vegetarian ? 'chip-on' : 'chip-off'} onClick={() => set({ is_vegetarian: !f.is_vegetarian })}>Vegetarian</button>
          <button type="button" className={f.is_vegan ? 'chip-on' : 'chip-off'} onClick={() => set({ is_vegan: !f.is_vegan, is_vegetarian: !f.is_vegan || f.is_vegetarian })}>Vegan</button>
        </div>
        <div>
          <span className="label text-xs">Contains allergens</span>
          <div className="flex flex-wrap gap-2">
            {allergens.map((a) => (
              <button type="button" key={a.id} className={f.allergen_ids.includes(a.id) ? 'chip-on' : 'chip-off'}
                onClick={() => set({ allergen_ids: f.allergen_ids.includes(a.id) ? f.allergen_ids.filter((x) => x !== a.id) : [...f.allergen_ids, a.id] })}>
                {a.name}
              </button>
            ))}
          </div>
        </div>
        <ErrorBox message={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving...' : 'Save food'}</button>
      </form>
    </Modal>
  );
}

export default function FoodSearch() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [modal, setModal] = useState(null); // 'custom'
  const [flash, setFlash] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const { data: categories } = useApi('/foods/categories');
  const { data: allergenData } = useApi('/profile/allergens');

  // Build the query string from the filters.
  const params = new URLSearchParams();
  if (dq) params.set('q', dq);
  if (category) params.set('category', category);
  if (showAll) params.set('all', '1');
  if (favorites) params.set('favorites', '1');
  const key = params.toString();

  // New filters: start again at page 1.
  useEffect(() => { setPage(1); }, [key]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get(`/foods/search?${key}&page=${page}`)
      .then((d) => {
        if (cancelled) return;
        setItems((prev) => (page === 1 ? d.items : [...prev, ...d.items]));
        setMeta(d);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [key, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Food search</h1>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setModal('custom')}><Plus className="h-4 w-4" /> My own food</button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input className="input py-3 pl-11 text-base" placeholder="Search foods: nasi goreng, chicken breast, apple..."
          value={q} onChange={(e) => setQ(e.target.value)} type="search" autoFocus />
      </div>

      {/* Category chips (scroll sideways on mobile) */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <button className={favorites ? 'chip-on' : 'chip-off'} onClick={() => setFavorites(!favorites)}>
          <Heart className="h-3.5 w-3.5" /> Favorites
        </button>
        <button className={!category ? 'chip-on' : 'chip-off'} onClick={() => setCategory('')}>All</button>
        {categories?.map((c) => (
          <button key={c.id} className={String(category) === String(c.id) ? 'chip-on' : 'chip-off'}
            onClick={() => setCategory(String(category) === String(c.id) ? '' : c.id)}>
            {capitalize(c.name)}
          </button>
        ))}
      </div>

      <label className="muted flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show all foods (including ones outside my diet and allergy settings)
      </label>

      {meta?.fuzzy && items.length > 0 && <Notice>No exact match for "{dq}". Showing similar names.</Notice>}
      {meta?.hidden_by_filters > 0 && (
        <Notice tone="warn">
          "{dq}" exists but does not fit your diet or allergy settings.{' '}
          <button className="font-semibold underline" onClick={() => setShowAll(true)}>Show anyway</button>
        </Notice>
      )}
      <ErrorBox message={error} onRetry={() => setPage(1)} />

      <div className="card p-2 sm:p-2">
        {loading && page === 1 ? (
          <div className="p-2"><SkeletonList rows={6} className="h-12" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={SearchX} title="No foods found"
            text={dq ? 'Try another spelling, a shorter word, or add it as your own food.' : 'Nothing here yet.'}
            action={<button className="btn-secondary" onClick={() => setModal('custom')}><Plus className="h-4 w-4" /> Add my own food</button>} />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((f) => <FoodRow key={f.id} f={f} onOpen={setOpenId} />)}
          </div>
        )}
        {meta?.has_more && items.length > 0 && (
          <div className="p-2">
            <button className="btn-ghost w-full" disabled={loading} onClick={() => setPage(page + 1)}>
              <ChevronDown className="h-4 w-4" /> {loading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      <FoodDetail foodId={openId} onClose={() => setOpenId(null)} />
      <CustomFoodModal open={modal === 'custom'} onClose={() => setModal(null)} categories={categories || []}
        allergens={allergenData?.all || []}
        onCreated={(id) => { setModal(null); setFlash('Food saved'); setOpenId(id); }} />
      <Flash message={flash} onDone={() => setFlash('')} />
    </div>
  );
}
