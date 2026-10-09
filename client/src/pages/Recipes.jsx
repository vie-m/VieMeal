// Recipes list: search, filter "fits my diet" / "my recipes".
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, Clock, Plus, Search } from 'lucide-react';
import { useApi, useDebounced } from '../hooks/useApi.js';
import { EmptyState, ErrorBox, SkeletonList } from '../components/ui.jsx';
import { fmt } from '../utils/format.js';

export default function Recipes() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('fits'); // all | fits | mine
  const dq = useDebounced(q.trim(), 250);
  const params = new URLSearchParams();
  if (dq) params.set('q', dq);
  if (filter === 'fits') params.set('fits', '1');
  if (filter === 'mine') params.set('mine', '1');
  const { data, loading, error, reload } = useApi(`/recipes?${params}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Recipes</h1>
        <Link to="/app/recipes/new" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> New recipe</Link>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input className="input pl-11" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
      </div>
      <div className="flex gap-2">
        {[['fits', 'Fits my diet'], ['all', 'All'], ['mine', 'My recipes']].map(([v, l]) => (
          <button key={v} className={filter === v ? 'chip-on' : 'chip-off'} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading ? <SkeletonList rows={4} className="h-24" /> : data?.length === 0 ? (
        <div className="card">
          <EmptyState icon={ChefHat} title="No recipes found"
            text={filter === 'mine' ? 'Create your first recipe from foods in the database.' : 'Try another search.'}
            action={<Link to="/app/recipes/new" className="btn-primary">Create a recipe</Link>} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data?.map((r) => (
            <Link key={r.id} to={`/app/recipes/${r.id}`} className="card flex flex-col gap-2 transition hover:border-brand-400">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-snug">{r.name}</h3>
                {r.created_by_user_id && <span className="badge shrink-0 bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">mine</span>}
              </div>
              <p className="muted line-clamp-2 text-sm">{r.description}</p>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-semibold">{fmt(r.serving_calories_kcal)} kcal</span>
                <span className="muted">P {Math.round(r.serving_protein_g)} · C {Math.round(r.serving_carbs_g)} · F {Math.round(r.serving_fat_g)} g</span>
                {r.prep_minutes != null && <span className="muted flex items-center gap-1"><Clock className="h-3 w-3" /> {r.prep_minutes} min</span>}
                {!r.fits_my_diet && <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">not for my diet</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
