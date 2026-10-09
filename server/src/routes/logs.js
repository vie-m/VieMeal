// Food diary (food_logs), daily summaries and water logs.
import { Router } from 'express';
import { query } from '../db.js';
import {
  asyncRoute, badRequest, notFound, requireAuth, int, num, oneOf, date, today, addDays, MEAL_TYPES,
} from '../utils/http.js';

const router = Router();
// Only these paths need login (this router is mounted at /api).
router.use(['/logs', '/water'], requireAuth);

// GET /api/logs?date=2025-01-31  -> entries of that day + totals
router.get('/logs', asyncRoute(async (req, res) => {
  const day = date(req.query.date, 'date', { optional: true }) || today();
  const { rows } = await query(
    `SELECT n.*, f.source
     FROM food_log_nutrition n
     LEFT JOIN foods f ON f.id = n.food_id
     WHERE n.user_id = $1 AND n.logged_on = $2
     ORDER BY array_position(ARRAY['breakfast','lunch','dinner','snack']::varchar[], n.meal_type), n.created_at`,
    [req.userId, day]
  );
  const totals = rows.reduce(
    (t, r) => {
      for (const k of ['calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg']) t[k] += r[k] || 0;
      return t;
    },
    { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0 }
  );
  for (const k in totals) totals[k] = Math.round(totals[k] * 10) / 10;
  res.json({ date: day, entries: rows, totals });
}));

// Body: { meal_type, food_id | recipe_id, grams, logged_on? }
router.post('/logs', asyncRoute(async (req, res) => {
  const mealType = oneOf(req.body.meal_type, 'Meal', MEAL_TYPES);
  const foodId = int(req.body.food_id, 'food_id', { min: 1, optional: true });
  const recipeId = int(req.body.recipe_id, 'recipe_id', { min: 1, optional: true });
  if ((foodId === null) === (recipeId === null)) throw badRequest('Choose a food or a recipe');
  const grams = num(req.body.grams, 'Amount (g)', { min: 1, max: 5000 });
  const day = date(req.body.logged_on, 'Date', { optional: true }) || today();
  if (day > addDays(today(), 1)) throw badRequest('Date cannot be in the future');

  // Make sure the user is allowed to see the food / recipe.
  const visible = foodId
    ? await query('SELECT 1 FROM foods WHERE id = $1 AND (created_by_user_id IS NULL OR created_by_user_id = $2)', [foodId, req.userId])
    : await query('SELECT 1 FROM recipes WHERE id = $1 AND (created_by_user_id IS NULL OR created_by_user_id = $2)', [recipeId, req.userId]);
  if (!visible.rowCount) throw notFound('Food not found');

  const { rows } = await query(
    `INSERT INTO food_logs (user_id, logged_on, meal_type, food_id, recipe_id, grams)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.userId, day, mealType, foodId, recipeId, grams]
  );
  res.status(201).json(rows[0]);
}));

// Edit amount or meal of an entry.
router.put('/logs/:id', asyncRoute(async (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const grams = num(req.body.grams, 'Amount (g)', { min: 1, max: 5000 });
  const mealType = oneOf(req.body.meal_type, 'Meal', MEAL_TYPES, { optional: true });
  const { rowCount } = await query(
    `UPDATE food_logs SET grams = $1, meal_type = COALESCE($2, meal_type)
     WHERE id = $3 AND user_id = $4`, // user_id check: users can only edit their own entries
    [grams, mealType, id, req.userId]
  );
  if (!rowCount) throw notFound('Entry not found');
  res.json({ ok: true });
}));

router.delete('/logs/:id', asyncRoute(async (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const { rowCount } = await query('DELETE FROM food_logs WHERE id = $1 AND user_id = $2', [id, req.userId]);
  if (!rowCount) throw notFound('Entry not found');
  res.json({ ok: true });
}));

// GET /api/logs/summary?from=&to=  -> one row per day (days with no logs are included as 0)
router.get('/logs/summary', asyncRoute(async (req, res) => {
  const to = date(req.query.to, 'to', { optional: true }) || today();
  const from = date(req.query.from, 'from', { optional: true }) || addDays(to, -6);
  if (from > to) throw badRequest('"from" must be before "to"');
  if ((new Date(to) - new Date(from)) / 86400000 > 366) throw badRequest('Range can be at most one year');

  // generate_series makes a row for every day so the chart has no gaps.
  const { rows } = await query(
    `SELECT d::date AS day,
            COALESCE(s.calories_kcal, 0) AS calories_kcal, COALESCE(s.protein_g, 0) AS protein_g,
            COALESCE(s.carbs_g, 0) AS carbs_g, COALESCE(s.fat_g, 0) AS fat_g,
            COALESCE(s.fiber_g, 0) AS fiber_g, COALESCE(s.sodium_mg, 0) AS sodium_mg,
            COALESCE(s.entries, 0) AS entries
     FROM generate_series($2::date, $3::date, interval '1 day') d
     LEFT JOIN daily_nutrition_summary s ON s.user_id = $1 AND s.logged_on = d::date
     ORDER BY day`,
    [req.userId, from, to]
  );
  // Averages only over days that have logs (an empty day is "not logged", not "ate 0").
  const logged = rows.filter((r) => r.entries > 0);
  const avg = (k) => (logged.length ? Math.round(logged.reduce((s, r) => s + r[k], 0) / logged.length) : 0);
  res.json({
    from, to, days: rows,
    averages: {
      logged_days: logged.length,
      calories_kcal: avg('calories_kcal'), protein_g: avg('protein_g'),
      carbs_g: avg('carbs_g'), fat_g: avg('fat_g'),
    },
  });
}));

// ---- Water ----
router.get('/water', asyncRoute(async (req, res) => {
  const day = date(req.query.date, 'date', { optional: true }) || today();
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount_ml), 0)::int AS total_ml, COUNT(*)::int AS entries
     FROM water_logs WHERE user_id = $1 AND logged_on = $2`,
    [req.userId, day]
  );
  res.json({ date: day, ...rows[0] });
}));

// Body: { amount_ml, logged_on? }. A negative amount ("undo") removes the latest entry instead.
router.post('/water', asyncRoute(async (req, res) => {
  const day = date(req.body.logged_on, 'Date', { optional: true }) || today();
  if (req.body.undo) {
    await query(
      `DELETE FROM water_logs WHERE id = (SELECT id FROM water_logs WHERE user_id = $1 AND logged_on = $2
                                          ORDER BY created_at DESC LIMIT 1)`, [req.userId, day]);
  } else {
    const ml = int(req.body.amount_ml, 'Amount (ml)', { min: 1, max: 5000 });
    await query('INSERT INTO water_logs (user_id, logged_on, amount_ml) VALUES ($1, $2, $3)', [req.userId, day, ml]);
  }
  const { rows } = await query(
    'SELECT COALESCE(SUM(amount_ml), 0)::int AS total_ml FROM water_logs WHERE user_id = $1 AND logged_on = $2',
    [req.userId, day]
  );
  res.status(201).json({ date: day, ...rows[0] });
}));

export default router;
