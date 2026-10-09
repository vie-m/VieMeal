// Food search, detail, custom foods, favorites/dislikes, barcode lookup.
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import {
  asyncRoute, badRequest, notFound, requireAuth, requireFullAccount, int, num, str, HttpError,
} from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const PAGE_SIZE = 20;

// Columns returned for a food in lists.
const FOOD_COLUMNS = `f.id, f.name, f.source, f.calories_kcal, f.protein_g, f.carbs_g, f.fat_g,
  f.is_vegetarian, f.is_vegan, f.is_halal, c.name AS category`;

router.get('/categories', asyncRoute(async (req, res) => {
  const { rows } = await query('SELECT id, name FROM food_categories ORDER BY id');
  res.json(rows);
}));

/**
 * GET /api/foods/search?q=nasi&category=3&page=1&all=1&favorites=1
 * - Filtered by the user's diet / allergens / dislikes unless all=1.
 * - Step 1 "exact": every typed word must appear in the name
 *   ("chicken breast" finds "Chicken, broilers or fryers, breast, ...").
 * - Step 2 "fuzzy" (only if step 1 finds nothing): trigram word similarity,
 *   so typos still work ("rendnag" -> "Rendang daging").
 * - Ranking: names starting with the query first, then closest match,
 *   then Indonesian and custom foods before USDA, then shorter names.
 * Both steps use the GIN trigram index on foods.name.
 */
async function searchFoods({ userId, q, category, page, showAll, favoritesOnly, fuzzy }) {
  // The base set: either the shared filter function, or every food the user can see.
  const base = showAll
    ? `(SELECT * FROM foods WHERE created_by_user_id IS NULL OR created_by_user_id = $1)`
    : `user_allowed_foods($1)`;

  const params = [userId];
  const where = [];
  let qIdx = null;
  if (q) {
    params.push(q);
    qIdx = params.length;
    if (fuzzy) {
      // word_similarity: how well the query matches the best part of the name
      // (0..1). 0.45 accepts typos like "rendnag" -> "Rendang daging" (0.5).
      // The "%" pre-filter can use the GIN trigram index.
      where.push(`(f.name % $${qIdx} OR word_similarity($${qIdx}, f.name) >= 0.45)`);
    } else {
      // one ILIKE condition per word (max 5 words)
      for (const word of q.split(/\s+/).slice(0, 5)) {
        params.push(word);
        where.push(`f.name ILIKE '%' || $${params.length} || '%'`);
      }
    }
  }
  if (category) {
    params.push(category);
    where.push(`f.category_id = $${params.length}`);
  }
  if (favoritesOnly) where.push(`EXISTS (SELECT 1 FROM user_favorite_foods uf WHERE uf.user_id = $1 AND uf.food_id = f.id)`);

  const order = q
    ? `(f.name ILIKE $${qIdx} || '%') DESC, round(word_similarity($${qIdx}, f.name)::numeric, 1) DESC,
       (f.source <> 'usda') DESC, length(f.name), f.id`
    : `(f.source <> 'usda') DESC, f.name`;

  params.push(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE); // one extra row tells us if there is a next page
  const { rows } = await query(
    `SELECT ${FOOD_COLUMNS},
            EXISTS (SELECT 1 FROM user_favorite_foods uf WHERE uf.user_id = $1 AND uf.food_id = f.id) AS is_favorite
     FROM ${base} f
     LEFT JOIN food_categories c ON c.id = f.category_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

router.get('/search', asyncRoute(async (req, res) => {
  const opts = {
    userId: req.userId,
    q: (req.query.q || '').toString().trim().slice(0, 100),
    category: int(req.query.category, 'category', { min: 1, optional: true }),
    page: int(req.query.page || 1, 'page', { min: 1, max: 500 }),
    showAll: req.query.all === '1',
    favoritesOnly: req.query.favorites === '1',
    fuzzy: req.query.fuzzy === '1',
  };
  let rows = await searchFoods(opts);
  let hiddenByFilters = 0;
  if (!rows.length && opts.q && !opts.fuzzy && opts.page === 1) {
    // Maybe the food exists but is hidden by the user's diet/allergy filters
    // ("udang" for a shellfish allergy). Tell the UI instead of guessing.
    if (!opts.showAll) hiddenByFilters = (await searchFoods({ ...opts, showAll: true })).length;
    // Still nothing anywhere? Probably a typo: try the typo-tolerant search.
    if (!hiddenByFilters) {
      opts.fuzzy = true;
      rows = await searchFoods(opts);
    }
  }
  res.json({
    items: rows.slice(0, PAGE_SIZE), page: opts.page, has_more: rows.length > PAGE_SIZE,
    fuzzy: opts.fuzzy, hidden_by_filters: hiddenByFilters,
  });
}));

// Barcode lookup with Open Food Facts (free, no key). Saves the product as a food.
// Guests cannot use it: it calls an outside API and adds foods to the shared table.
router.get('/barcode/:code', requireFullAccount, asyncRoute(async (req, res) => {
  const code = req.params.code;
  if (!/^\d{6,14}$/.test(code)) throw badRequest('A barcode has 6 to 14 digits');

  const existing = await query(`SELECT id FROM foods WHERE source = 'openfoodfacts' AND source_ref = $1`, [code]);
  if (existing.rows[0]) return res.json({ id: existing.rows[0].id });

  let data;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,nutriments,allergens_tags,labels_tags,serving_quantity`, {
      headers: { 'User-Agent': 'VieMeal/1.0 (portfolio project)' },
      signal: AbortSignal.timeout(8000),
    });
    data = await r.json();
  } catch {
    throw new HttpError(502, 'Could not reach Open Food Facts. Please try again later.');
  }
  const p = data?.product;
  const n = p?.nutriments || {};
  if (!p || !p.product_name || n['energy-kcal_100g'] === undefined) {
    throw notFound('Product not found, or it has no nutrition data. You can add it as a custom food.');
  }

  const labels = p.labels_tags || [];
  const id = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO foods (name, category_id, source, source_ref, calories_kcal, protein_g, carbs_g, fat_g,
                          fiber_g, sugar_g, sodium_mg, is_vegetarian, is_vegan, is_halal)
       VALUES ($1, (SELECT id FROM food_categories WHERE name = 'other'), 'openfoodfacts', $2,
               $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [p.product_name.slice(0, 255), code, n['energy-kcal_100g'] || 0, n.proteins_100g || 0, n.carbohydrates_100g || 0,
        n.fat_100g || 0, n.fiber_100g || 0, n.sugars_100g || 0, (n.sodium_100g || 0) * 1000,
        labels.includes('en:vegetarian') || labels.includes('en:vegan') ? true : null,
        labels.includes('en:vegan') ? true : null,
        labels.includes('en:halal') ? true : null]
    );
    // Map OFF allergen tags ("en:milk") to our allergen names.
    const map = { 'en:gluten': 'gluten', 'en:milk': 'dairy', 'en:eggs': 'egg', 'en:peanuts': 'peanut', 'en:nuts': 'tree nut',
      'en:soybeans': 'soy', 'en:fish': 'fish', 'en:crustaceans': 'shellfish', 'en:molluscs': 'shellfish', 'en:sesame-seeds': 'sesame' };
    const names = [...new Set((p.allergens_tags || []).map((t) => map[t]).filter(Boolean))];
    await c.query(
      `INSERT INTO food_allergens (food_id, allergen_id) SELECT $1, id FROM allergens WHERE name = ANY($2::text[])`,
      [rows[0].id, names]
    );
    if (Number(p.serving_quantity) > 0) {
      await c.query(`INSERT INTO food_servings (food_id, description, grams) VALUES ($1, $2, $3)`,
        [rows[0].id, `1 serving (${Math.round(p.serving_quantity)} g)`, p.serving_quantity]);
    }
    return rows[0].id;
  });
  res.status(201).json({ id });
}));

// Food detail: per 100 g values, servings, allergens and the user's flags.
router.get('/:id', asyncRoute(async (req, res) => {
  const id = int(req.params.id, 'id', { min: 1 });
  const { rows } = await query(
    `SELECT f.*, c.name AS category,
            EXISTS (SELECT 1 FROM user_favorite_foods x WHERE x.user_id = $2 AND x.food_id = f.id) AS is_favorite,
            EXISTS (SELECT 1 FROM user_disliked_foods x WHERE x.user_id = $2 AND x.food_id = f.id) AS is_disliked,
            -- Is it allowed by the shared diet/allergen filter?
            EXISTS (SELECT 1 FROM user_allowed_foods($2) a WHERE a.id = f.id) AS fits_my_diet
     FROM foods f LEFT JOIN food_categories c ON c.id = f.category_id
     WHERE f.id = $1 AND (f.created_by_user_id IS NULL OR f.created_by_user_id = $2)`,
    [id, req.userId]
  );
  if (!rows[0]) throw notFound('Food not found');

  const [servings, allergens] = await Promise.all([
    query('SELECT id, description, grams FROM food_servings WHERE food_id = $1 ORDER BY grams', [id]),
    query(
      `SELECT a.id, a.name,
              EXISTS (SELECT 1 FROM user_allergens ua WHERE ua.user_id = $2 AND ua.allergen_id = a.id) AS mine
       FROM food_allergens fa JOIN allergens a ON a.id = fa.allergen_id WHERE fa.food_id = $1 ORDER BY a.name`,
      [id, req.userId]
    ),
  ]);
  res.json({ ...rows[0], servings: servings.rows, allergens: allergens.rows });
}));

// Custom food (visible only to its creator).
router.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  const f = {
    name: str(b.name, 'Name', { max: 255 }),
    category_id: int(b.category_id, 'Category', { min: 1, optional: true }),
    calories_kcal: num(b.calories_kcal, 'Calories', { min: 0, max: 900 }), // pure fat is ~900 kcal/100 g
    protein_g: num(b.protein_g ?? 0, 'Protein', { min: 0, max: 100 }),
    carbs_g: num(b.carbs_g ?? 0, 'Carbs', { min: 0, max: 100 }),
    fat_g: num(b.fat_g ?? 0, 'Fat', { min: 0, max: 100 }),
    fiber_g: num(b.fiber_g ?? 0, 'Fiber', { min: 0, max: 100 }),
    sugar_g: num(b.sugar_g ?? 0, 'Sugar', { min: 0, max: 100 }),
    sodium_mg: num(b.sodium_mg ?? 0, 'Sodium', { min: 0, max: 40000 }),
  };
  if (f.protein_g + f.carbs_g + f.fat_g > 100) throw badRequest('Protein + carbs + fat cannot exceed 100 g per 100 g');
  const veg = b.is_vegan ? true : b.is_vegetarian ?? null;
  const servingG = num(b.serving_grams, 'Serving grams', { min: 1, max: 2000, optional: true });
  const allergenIds = Array.isArray(b.allergen_ids) ? b.allergen_ids.map((x) => int(x, 'Allergen', { min: 1 })) : [];

  const food = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO foods (name, category_id, source, created_by_user_id, calories_kcal, protein_g, carbs_g, fat_g,
                          fiber_g, sugar_g, sodium_mg, is_vegetarian, is_vegan, is_halal)
       VALUES ($1, $2, 'custom', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [f.name, f.category_id, req.userId, f.calories_kcal, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g, f.sugar_g,
        f.sodium_mg, veg, b.is_vegan ?? null, b.is_halal ?? null]
    );
    if (servingG) {
      await c.query(`INSERT INTO food_servings (food_id, description, grams) VALUES ($1, $2, $3)`,
        [rows[0].id, str(b.serving_name || '1 serving', 'Serving name', { max: 80 }) + ` (${servingG} g)`, servingG]);
    }
    if (allergenIds.length) {
      await c.query(`INSERT INTO food_allergens SELECT $1, id FROM allergens WHERE id = ANY($2::int[])`, [rows[0].id, allergenIds]);
    }
    return rows[0];
  });
  res.status(201).json(food);
}));

// Favorite / dislike toggles. A food cannot be both, so adding one removes the other.
function toggleRoute(table, otherTable) {
  return [
    asyncRoute(async (req, res) => {
      const id = int(req.params.id, 'id', { min: 1 });
      const exists = await query(
        'SELECT 1 FROM foods WHERE id = $1 AND (created_by_user_id IS NULL OR created_by_user_id = $2)', [id, req.userId]);
      if (!exists.rowCount) throw notFound('Food not found');
      await query(`DELETE FROM ${otherTable} WHERE user_id = $1 AND food_id = $2`, [req.userId, id]);
      await query(`INSERT INTO ${table} (user_id, food_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.userId, id]);
      res.status(201).json({ ok: true });
    }),
    asyncRoute(async (req, res) => {
      const id = int(req.params.id, 'id', { min: 1 });
      await query(`DELETE FROM ${table} WHERE user_id = $1 AND food_id = $2`, [req.userId, id]);
      res.json({ ok: true });
    }),
  ];
}
const [favAdd, favDel] = toggleRoute('user_favorite_foods', 'user_disliked_foods');
const [disAdd, disDel] = toggleRoute('user_disliked_foods', 'user_favorite_foods');
router.post('/:id/favorite', favAdd);
router.delete('/:id/favorite', favDel);
router.post('/:id/dislike', disAdd);
router.delete('/:id/dislike', disDel);

export default router;
