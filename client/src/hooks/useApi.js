// Load data from the API with loading / error state.
//   const { data, loading, error, reload, setData } = useApi('/logs?date=2025-01-01');
// Pass null as the path to skip loading.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export function useApi(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);
  const latest = useRef(path);

  const reload = useCallback(async () => {
    if (!path) return;
    latest.current = path;
    setLoading(true);
    setError(null);
    try {
      const d = await api.get(path);
      if (latest.current === path) setData(d); // ignore answers for an old path
    } catch (e) {
      if (latest.current === path) setError(e.message);
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

// Value that only updates after the user stops typing for `ms`.
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
