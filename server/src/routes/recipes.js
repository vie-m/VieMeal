// Recipes: list, detail with ingredients + calculated nutrition, create.
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { asyncRoute, badRequest, notFound, requireAuth, int, num, str, MEAL_TYPES } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

// GET /api/recipes?q=&mine=1&fits=1
router.get('/', asyncRoute(async (req, res) => {
  const params = [req.userId];
  const where = ['(r.created_by_user_id IS NULL OR r.created_by_user_id = $1)'];
  if (req.query.q) {
    params.push(String(req.query.q).slice(0, 100));
    where.push(`r.name ILIKE '%' || $${params.length} || '%'`);
  }
  if (req.query.mine === '1') where.push('r.created_by_user_id = $1');
  if (req.query.fits === '1') where.push('r.id IN (SELECT id FROM user_allowed_recipes($1))');

  const { rows } = await query(
    `SELECT r.id, r.name, r.description, r.servings, r.prep_minutes, r.created_by_user_id,
            n.serving_calories_kcal, n.serving_protein_g, n.serving_carbs_g, n.serving_fat_g,
            r.id IN (SELECT id FROM user_allowed_recipes($1)) AS fits_my_diet
     FROM recipes r
     LEFT JOIN recipe_nutrition n ON n.recipe_id = r.id
     WHERE ${where.join(' AND ')}
     ORDER BY r.created_by_user_id IS NULL, r.name`,
    params
  );
  res.json(rows);
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const { rows } = await query(
    `SELECT r.*, n.total_grams, n.calories_kcal, n.protein_g, n.carbs_g, n.fat_g, n.fiber_g, n.sugar_g, n.sodium_mg,
            n.serving_calories_kcal, n.serving_protein_g, n.serving_carbs_g, n.serving_fat_g, n.serving_grams,
            r.id IN (SELECT id FROM user_allowed_recipes($2)) AS fits_my_diet
     FROM recipes r LEFT JOIN recipe_nutrition n ON n.recipe_id = r.id
     WHERE r.id = $1 AND (r.created_by_user_id IS NULL OR r.created_by_user_id = $2)`,
    [id, req.userId]
  );
  if (!rows[0]) throw notFound('Recipe not found');

  const [ingredients, allergens, meals] = await Promise.all([
    query(
      `SELECT f.id AS food_id, f.name, f.source, ri.grams,
              ROUND(f.calories_kcal * ri.grams / 100, 1) AS calories_kcal,
              ROUND(f.protein_g * ri.grams / 100, 1) AS protein_g
       FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id
       WHERE ri.recipe_id = $1 ORDER BY ri.grams DESC`, [id]),
    // All allergens contained in any ingredient
    query(
      `SELECT DISTINCT a.id, a.name FROM recipe_ingredients ri
       JOIN food_allergens fa ON fa.food_id = ri.food_id JOIN allergens a ON a.id = fa.allergen_id
       WHERE ri.recipe_id = $1 ORDER BY a.name`, [id]),
    query('SELECT meal_type FROM recipe_meal_types WHERE recipe_id = $1', [id]),
  ]);
  res.json({
    ...rows[0],
    ingredients: ingredients.rows,
    allergens: allergens.rows,
    meal_types: meals.rows.map((m) => m.meal_type),
  });
}));

// Body: { name, description, instructions, servings, prep_minutes, meal_types: [], ingredients: [{ food_id, grams }] }
router.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  const name = str(b.name, 'Name', { max: 150 });
  const description = str(b.description, 'Description', { max: 500, optional: true });
  const instructions = str(b.instructions, 'Instructions', { max: 5000, optional: true });
  const servings = int(b.servings ?? 1, 'Servings', { min: 1, max: 50 });
  const prep = int(b.prep_minutes, 'Prep minutes', { min: 0, max: 1440, optional: true });
  const mealTypes = Array.isArray(b.meal_types) ? b.meal_types.filter((m) => MEAL_TYPES.includes(m)) : [];
  if (!Array.isArray(b.ingredients) || b.ingredients.length === 0) throw badRequest('Add at least one ingredient');
  if (b.ingredients.length > 40) throw badRequest('A recipe can have at most 40 ingredients');

  // Merge duplicates (same food twice) because (recipe_id, food_id) is the primary key.
  const merged = new Map();
  for (const ing of b.ingredients) {
    const fid = int(ing.food_id, 'Ingredient food', { min: 1 });
    const g = num(ing.grams, 'Ingredient grams', { min: 1, max: 5000 });
    merged.set(fid, (merged.get(fid) || 0) + g);
  }

  const id = await withTransaction(async (c) => {
    // Only foods the user can see may be used.
    const ok = await c.query(
      `SELECT COUNT(*)::int AS n FROM foods WHERE id = ANY($1::int[])
         AND (created_by_user_id IS NULL OR created_by_user_id = $2)`, [[...merged.keys()], req.userId]);
    if (ok.rows[0].n !== merged.size) throw badRequest('One of the ingredients was not found');

    const { rows } = await c.query(
      `INSERT INTO recipes (name, description, instructions, servings, prep_minutes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name, description, instructions, servings, prep, req.userId]
    );
    const rid = rows[0].id;
    await c.query(
      `INSERT INTO recipe_ingredients (recipe_id, food_id, grams)
       SELECT $1, * FROM unnest($2::int[], $3::numeric[])`,
      [rid, [...merged.keys()], [...merged.values()]]
    );
    if (mealTypes.length) {
      await c.query(`INSERT INTO recipe_meal_types SELECT $1, unnest($2::text[])`, [rid, [...new Set(mealTypes)]]);
    }
    return rid;
  });
  res.status(201).json({ id });
}));

export default router;
