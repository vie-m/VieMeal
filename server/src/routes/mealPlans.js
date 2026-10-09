// Meal plan endpoints.
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { asyncRoute, badRequest, notFound, requireAuth, int, date, today } from '../utils/http.js';
import { generatePlan, latestPlanId, loadPlan, swapItem } from '../services/mealPlanner.js';

const router = Router();
router.use(requireAuth);

// Body: { days: 1 | 7, start_date? }
router.post('/generate', asyncRoute(async (req, res) => {
  const days = int(req.body.days ?? 1, 'days', { min: 1, max: 7 });
  if (days !== 1 && days !== 7) throw badRequest('days must be 1 or 7');
  const start = date(req.body.start_date, 'start_date', { optional: true }) || today();
  const id = await generatePlan(req.userId, { days, startDate: start });
  res.status(201).json(await loadPlan(req.userId, id));
}));

router.get('/current', asyncRoute(async (req, res) => {
  const id = await latestPlanId(req.userId);
  if (!id) return res.json(null);
  res.json(await loadPlan(req.userId, id));
}));

router.put('/items/:id/swap', asyncRoute(async (req, res) => {
  const planId = await swapItem(req.userId, int(req.params.id, 'id', { min: 1 }));
  res.json(await loadPlan(req.userId, planId));
}));

// Body: { locked: true | false }  (toggles when omitted)
router.put('/items/:id/lock', asyncRoute(async (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const { rows } = await query(
    `UPDATE meal_plan_items i
     SET is_locked = COALESCE($3, NOT i.is_locked)
     FROM meal_plans p
     WHERE i.id = $1 AND p.id = i.meal_plan_id AND p.user_id = $2
     RETURNING i.id, i.is_locked`,
    [id, req.userId, typeof req.body.locked === 'boolean' ? req.body.locked : null]
  );
  if (!rows[0]) throw notFound('Meal not found');
  res.json(rows[0]);
}));

// Copy a planned day into the food diary. Body: { date }
router.post('/:id/log-day', asyncRoute(async (req, res) => {
  const planId = int(req.params.id, 'id', { min: 1 });
  const day = date(req.body.date, 'date');
  const itemIds = Array.isArray(req.body.item_ids) ? req.body.item_ids.map((x) => int(x, 'item id', { min: 1 })) : null;
  const logDate = date(req.body.log_date, 'log_date', { optional: true }) || day;

  const count = await withTransaction(async (c) => {
    // INSERT ... SELECT copies rows in one statement; the join on meal_plans
    // makes sure the plan belongs to this user.
    const r = await c.query(
      `INSERT INTO food_logs (user_id, logged_on, meal_type, food_id, recipe_id, grams)
       SELECT p.user_id, $4::date, i.meal_type, i.food_id, i.recipe_id, i.grams
       FROM meal_plan_items i JOIN meal_plans p ON p.id = i.meal_plan_id
       WHERE p.id = $1 AND p.user_id = $2 AND i.plan_date = $3
         AND ($5::int[] IS NULL OR i.id = ANY($5::int[]))`,
      [planId, req.userId, day, logDate, itemIds]
    );
    return r.rowCount;
  });
  if (!count) throw notFound('Nothing to log for that day');
  res.status(201).json({ logged: count });
}));

// Shopping list: total grams per food for the whole plan, grouped by category.
// Recipes are expanded into their ingredients (scaled to the planned grams).
router.get('/:id/shopping-list', asyncRoute(async (req, res) => {
  const planId = int(req.params.id, 'id', { min: 1 });
  const { rows } = await query(
    `WITH plan AS (
       SELECT i.* FROM meal_plan_items i JOIN meal_plans p ON p.id = i.meal_plan_id
       WHERE p.id = $1 AND p.user_id = $2
     ),
     needed AS (
       -- plain foods
       SELECT food_id, grams FROM plan WHERE food_id IS NOT NULL
       UNION ALL
       -- recipe ingredients: ingredient grams x (planned grams / whole recipe grams)
       SELECT ri.food_id, ri.grams * plan.grams / rn.total_grams
       FROM plan
       JOIN recipe_ingredients ri ON ri.recipe_id = plan.recipe_id
       JOIN recipe_nutrition rn   ON rn.recipe_id = plan.recipe_id
     )
     SELECT COALESCE(c.name, 'other') AS category, f.id AS food_id, f.name,
            ROUND(SUM(n.grams)) AS grams
     FROM needed n JOIN foods f ON f.id = n.food_id
     LEFT JOIN food_categories c ON c.id = f.category_id
     GROUP BY c.name, f.id, f.name
     ORDER BY category, f.name`,
    [planId, req.userId]
  );
  const groups = {};
  for (const r of rows) (groups[r.category] ||= []).push({ food_id: r.food_id, name: r.name, grams: r.grams });
  res.json(Object.entries(groups).map(([category, items]) => ({ category, items })));
}));

export default router;
