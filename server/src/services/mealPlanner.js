// =====================================================================
// Rule-based meal planner (works with no AI at all).
//
// The core algorithm (buildDay / pickForSlot / balanceDay) is made of PURE
// functions that receive plain arrays, so it can be unit tested without a
// database. The functions at the bottom load data from PostgreSQL and save
// the plan.
//
// Steps (see README "How the planner works"):
//  1. Split the daily calorie target across meal slots.
//  2. Get candidates (recipes + stand-alone foods) that pass the user's diet,
//     allergens and dislikes (shared SQL function user_allowed_foods/recipes).
//  3. Scale each candidate's portion to hit the slot's calorie budget.
//  4. Score: protein closeness + favorite bonus - recently-eaten penalty + a
//     little randomness.
//  5. Pick the best per slot; then nudge portions so the day is within +-10%.
//  6. Swap = next best candidate; locked items are kept on regeneration.
// =====================================================================
import { query, withTransaction } from '../db.js';
import { addDays, today, badRequest, notFound } from '../utils/http.js';
import { getTargets } from './profileService.js';

// ---- Step 1: how the day is split ------------------------------------
// Each entry: [meal_type, share of daily calories]
export const SLOT_SPLITS = {
  3: [['breakfast', 0.30], ['lunch', 0.40], ['dinner', 0.30]],
  4: [['breakfast', 0.25], ['lunch', 0.35], ['snack', 0.10], ['dinner', 0.30]],
  5: [['breakfast', 0.25], ['snack', 0.10], ['lunch', 0.30], ['snack', 0.10], ['dinner', 0.25]],
};

export function slotsFor(mealsPerDay, dailyCalories) {
  const split = SLOT_SPLITS[mealsPerDay] || SLOT_SPLITS[3];
  return split.map(([mealType, share], i) => ({
    slot_no: i + 1,
    meal_type: mealType,
    calories: Math.round(dailyCalories * share),
  }));
}

// ---- Step 3: portion scaling -----------------------------------------
// Portions stay close to a normal serving so we never suggest 20 g of rice
// or 700 g of soup. `base_grams` = one typical serving of the candidate
// (recipe serving, or the food's household serving such as "1 piring").
//   single food: 0.5x to 2.5x a serving, and always 30 g to 500 g
//   recipe:      0.6x to 1.5x a serving (and at most 600 g unless one serving is bigger)
export function portionLimits(c) {
  const base = c.base_grams > 0 ? c.base_grams : (c.kind === 'recipe' ? 350 : 100);
  if (c.kind === 'recipe') return [Math.round(base * 0.6), Math.min(Math.round(base * 1.5), Math.max(base, 600))];
  return [Math.max(30, Math.round(base * 0.5)), Math.min(500, Math.round(base * 2.5))];
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round5 = (g) => Math.round(g / 5) * 5; // grams rounded to 5 g look friendlier

// Grams needed to reach `calories`, kept inside the portion limits.
// scalePortion({ kind: 'food', kcal: 200, base_grams: 100 }, 300) -> 150 g
export function scalePortion(candidate, calories) {
  const [lo, hi] = portionLimits(candidate);
  if (!(candidate.kcal > 0)) return hi;
  return clamp(round5((calories / candidate.kcal) * 100), lo, hi);
}

// Nutrition of `grams` of a candidate (all candidate values are per 100 g).
export function nutritionOf(c, grams) {
  const f = grams / 100;
  return {
    calories_kcal: Math.round(c.kcal * f),
    protein_g: Math.round(c.protein * f * 10) / 10,
    carbs_g: Math.round(c.carbs * f * 10) / 10,
    fat_g: Math.round(c.fat * f * 10) / 10,
  };
}

// ---- Step 4: scoring -------------------------------------------------
// Higher is better. `ctx` = { slotCalories, proteinPct, recentKeys, usedToday, rng }
export function scoreCandidate(c, ctx) {
  const grams = scalePortion(c, ctx.slotCalories);
  const n = nutritionOf(c, grams);

  // Protein target for this slot = share of the slot's calories / 4 kcal per g.
  const proteinTarget = (ctx.slotCalories * ctx.proteinPct) / 100 / 4;
  const proteinScore = 1 - Math.min(1, Math.abs(n.protein_g - proteinTarget) / proteinTarget); // 0..1

  // If the portion hit a limit, the calories are off: penalize that.
  const calorieMiss = Math.abs(n.calories_kcal - ctx.slotCalories) / ctx.slotCalories;

  const key = `${c.kind}:${c.id}`;
  let score = proteinScore - calorieMiss * 2;
  if (c.is_favorite) score += 0.3;                // user likes it
  if (ctx.recentKeys.has(key)) score -= 0.5;      // eaten / planned in the last 3 days -> variety
  if (ctx.usedToday.has(key)) score -= 2;         // never the same thing twice in one day
  if (c.kind === 'recipe') score += 0.15;         // complete, balanced plates are preferred
  score += (ctx.rng ?? Math.random)() * 0.25;     // a bit of randomness so plans differ
  return { score, grams, ...n };
}

// ---- Step 5a: pick the best candidates for a slot ---------------------
// Returns candidates sorted best-first (index 0 = pick, 1 = first swap option ...).
export function rankForSlot(candidates, slot, ctx) {
  return candidates
    .filter((c) => c.meal_types.includes(slot.meal_type))
    .map((c) => ({ candidate: c, ...scoreCandidate(c, { ...ctx, slotCalories: slot.calories }) }))
    .sort((a, b) => b.score - a.score);
}

// ---- Step 5b: keep the day within +-10% of target ---------------------
// items: [{ candidate, grams, is_locked }]. Locked items are never changed.
export function balanceDay(items, targetCalories) {
  for (let round = 0; round < 3; round++) {
    const total = items.reduce((s, it) => s + nutritionOf(it.candidate, it.grams).calories_kcal, 0);
    const ratio = total / targetCalories;
    if (ratio >= 0.9 && ratio <= 1.1) break; // good enough

    // Scale the unlocked items so that, together with the locked ones, we hit the target.
    const lockedKcal = items.filter((i) => i.is_locked)
      .reduce((s, it) => s + nutritionOf(it.candidate, it.grams).calories_kcal, 0);
    const freeKcal = total - lockedKcal;
    if (freeKcal <= 0) break;
    const factor = (targetCalories - lockedKcal) / freeKcal;
    for (const it of items) {
      if (it.is_locked) continue;
      const [lo, hi] = portionLimits(it.candidate);
      // Small sides from AI plans (e.g. 15 g sambal) may stay below the normal minimum.
      it.minGrams ??= Math.min(lo, it.grams);
      it.grams = clamp(round5(it.grams * factor) || 5, it.minGrams, hi);
    }
  }
  return items;
}

/**
 * Build one day. Pure function.
 *  candidates: [{ kind, id, name, kcal, protein, carbs, fat, meal_types: [], is_favorite }]
 *  slots:      from slotsFor()
 *  locked:     Map slot_no -> [{ candidate, grams }] items to keep
 *  ctx:        { proteinPct, recentKeys: Set, rng }
 * Returns [{ slot_no, meal_type, candidate, grams, is_locked }]
 */
export function buildDay({ candidates, slots, targetCalories, locked = new Map(), ctx }) {
  const usedToday = new Set();
  const items = [];
  for (const slot of slots) {
    if (locked.has(slot.slot_no)) {
      for (const it of locked.get(slot.slot_no)) {
        items.push({ slot_no: slot.slot_no, meal_type: slot.meal_type, candidate: it.candidate, grams: it.grams, is_locked: true });
        usedToday.add(`${it.candidate.kind}:${it.candidate.id}`);
      }
      continue;
    }
    const ranked = rankForSlot(candidates, slot, { ...ctx, usedToday });
    if (!ranked.length) continue; // nothing fits (very restrictive diet) -> leave slot empty
    const best = ranked[0];
    usedToday.add(`${best.candidate.kind}:${best.candidate.id}`);
    items.push({ slot_no: slot.slot_no, meal_type: slot.meal_type, candidate: best.candidate, grams: best.grams, is_locked: false });
  }
  return balanceDay(items, targetCalories);
}

// =====================================================================
// Database part
// =====================================================================

// Step 2: candidates that pass the user's diet / allergens / dislikes.
// Only "complete" foods can be a meal on their own (food_meal_types);
// side dishes like sambal or plain rice are used through recipes.
export async function loadCandidates(userId) {
  const { rows } = await query(
    `SELECT 'recipe' AS kind, r.id, r.name,
            n.calories_per_100g AS kcal, n.protein_per_100g AS protein,
            n.carbs_per_100g AS carbs, n.fat_per_100g AS fat,
            ARRAY(SELECT meal_type FROM recipe_meal_types m WHERE m.recipe_id = r.id) AS meal_types,
            FALSE AS is_favorite,
            n.serving_grams AS base_grams
     FROM user_allowed_recipes($1) r
     JOIN recipe_nutrition n ON n.recipe_id = r.id
     UNION ALL
     SELECT 'food', f.id, f.name, f.calories_kcal, f.protein_g, f.carbs_g, f.fat_g,
            ARRAY(SELECT meal_type FROM food_meal_types m WHERE m.food_id = f.id),
            EXISTS (SELECT 1 FROM user_favorite_foods uf WHERE uf.user_id = $1 AND uf.food_id = f.id),
            -- typical serving: the smallest household serving of at least 30 g
            COALESCE((SELECT MIN(s.grams) FROM food_servings s WHERE s.food_id = f.id AND s.grams >= 30), 100)
     FROM user_allowed_foods($1) f
     WHERE EXISTS (SELECT 1 FROM food_meal_types m WHERE m.food_id = f.id)
       AND f.calories_kcal > 0`,
    [userId]
  );
  return rows;
}

// Foods/recipes logged in the 3 days before `fromDate` (variety penalty).
async function recentKeys(userId, fromDate) {
  const { rows } = await query(
    `SELECT DISTINCT CASE WHEN food_id IS NOT NULL THEN 'food:' || food_id ELSE 'recipe:' || recipe_id END AS key
     FROM food_logs WHERE user_id = $1 AND logged_on BETWEEN $2::date - 3 AND $2::date - 1`,
    [userId, fromDate]
  );
  return new Set(rows.map((r) => r.key));
}

export async function latestPlanId(userId) {
  const { rows } = await query(
    'SELECT id FROM meal_plans WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [userId]);
  return rows[0]?.id ?? null;
}

/**
 * Generate and save a plan. Locked items of the user's current plan are kept
 * when their date falls inside the new plan.
 * Returns the new plan id.
 */
export async function generatePlan(userId, { days = 1, startDate = today(), rng = Math.random } = {}) {
  const data = await getTargets(userId);
  if (!data) throw badRequest('Please complete your profile first');
  const { profile, targets } = data;

  const candidates = await loadCandidates(userId);
  if (!candidates.length) throw badRequest('No foods match your diet and allergies. Try relaxing a filter in your profile.');
  const byKey = new Map(candidates.map((c) => [`${c.kind}:${c.id}`, c]));

  // Locked items from the current plan, keyed by date then slot.
  const lockedByDate = new Map();
  const prevId = await latestPlanId(userId);
  if (prevId) {
    const { rows } = await query(
      `SELECT plan_date, slot_no, food_id, recipe_id, grams FROM meal_plan_items
       WHERE meal_plan_id = $1 AND is_locked`, [prevId]);
    for (const r of rows) {
      const key = r.food_id ? `food:${r.food_id}` : `recipe:${r.recipe_id}`;
      // A locked item that no longer fits the diet is dropped.
      const candidate = byKey.get(key) || (await lockedCandidate(r));
      if (!candidate) continue;
      if (!lockedByDate.has(r.plan_date)) lockedByDate.set(r.plan_date, new Map());
      const slots = lockedByDate.get(r.plan_date);
      if (!slots.has(r.slot_no)) slots.set(r.slot_no, []);
      slots.get(r.slot_no).push({ candidate, grams: r.grams });
    }
  }

  const recent = await recentKeys(userId, startDate);
  const slots = slotsFor(profile.meals_per_day, targets.calories);
  const plan = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    const dayItems = buildDay({
      candidates, slots, targetCalories: targets.calories,
      locked: lockedByDate.get(date) || new Map(),
      ctx: { proteinPct: targets.macro_split.protein, recentKeys: recent, rng },
    });
    // Today's picks count as "recent" for the next days -> variety across the week.
    for (const it of dayItems) recent.add(`${it.candidate.kind}:${it.candidate.id}`);
    plan.push({ date, items: dayItems });
  }

  return savePlan(userId, { startDate, days, targetCalories: targets.calories, createdBy: 'algorithm', plan });
}

// Locked AI items can be foods without a meal type; load them directly.
async function lockedCandidate(r) {
  if (r.food_id) {
    const { rows } = await query(
      `SELECT 'food' AS kind, id, name, calories_kcal AS kcal, protein_g AS protein, carbs_g AS carbs, fat_g AS fat,
              ARRAY[]::text[] AS meal_types, FALSE AS is_favorite, 100 AS base_grams FROM foods WHERE id = $1`, [r.food_id]);
    return rows[0];
  }
  return null;
}

export async function savePlan(userId, { startDate, days, targetCalories, createdBy, plan }) {
  return withTransaction(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO meal_plans (user_id, start_date, days, target_calories, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, startDate, days, targetCalories, createdBy]
    );
    const planId = rows[0].id;
    for (const day of plan) {
      for (const it of day.items) {
        await c.query(
          `INSERT INTO meal_plan_items (meal_plan_id, plan_date, slot_no, meal_type, food_id, recipe_id, grams, is_locked)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [planId, day.date, it.slot_no, it.meal_type,
            it.candidate.kind === 'food' ? it.candidate.id : null,
            it.candidate.kind === 'recipe' ? it.candidate.id : null,
            it.grams, it.is_locked]
        );
      }
    }
    return planId;
  });
}

// Load a plan with nutrition per item, grouped by day.
export async function loadPlan(userId, planId) {
  const { rows: plans } = await query('SELECT * FROM meal_plans WHERE id = $1 AND user_id = $2', [planId, userId]);
  if (!plans[0]) throw notFound('Meal plan not found');
  const { rows: items } = await query(
    `SELECT i.id, i.plan_date, i.slot_no, i.meal_type, i.food_id, i.recipe_id, i.grams, i.is_locked,
            COALESCE(f.name, r.name) AS name, f.source,
            ROUND(COALESCE(f.calories_kcal, rn.calories_per_100g) * i.grams / 100) AS calories_kcal,
            ROUND(COALESCE(f.protein_g, rn.protein_per_100g) * i.grams / 100, 1) AS protein_g,
            ROUND(COALESCE(f.carbs_g, rn.carbs_per_100g) * i.grams / 100, 1) AS carbs_g,
            ROUND(COALESCE(f.fat_g, rn.fat_per_100g) * i.grams / 100, 1) AS fat_g
     FROM meal_plan_items i
     LEFT JOIN foods f ON f.id = i.food_id
     LEFT JOIN recipes r ON r.id = i.recipe_id
     LEFT JOIN recipe_nutrition rn ON rn.recipe_id = i.recipe_id
     WHERE i.meal_plan_id = $1
     ORDER BY i.plan_date, i.slot_no, i.id`,
    [planId]
  );
  const days = new Map();
  for (const it of items) {
    if (!days.has(it.plan_date)) days.set(it.plan_date, { date: it.plan_date, items: [], totals: { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } });
    const d = days.get(it.plan_date);
    d.items.push(it);
    for (const k in d.totals) d.totals[k] = Math.round((d.totals[k] + it[k]) * 10) / 10;
  }
  return { ...plans[0], days: [...days.values()] };
}

/**
 * Swap one item for the next best candidate for its slot.
 * For AI meals with several items per slot, the whole slot is replaced.
 */
export async function swapItem(userId, itemId, rng = Math.random) {
  const { rows } = await query(
    `SELECT i.*, p.target_calories, p.user_id FROM meal_plan_items i
     JOIN meal_plans p ON p.id = i.meal_plan_id WHERE i.id = $1 AND p.user_id = $2`,
    [itemId, userId]
  );
  const item = rows[0];
  if (!item) throw notFound('Meal not found');
  if (item.is_locked) throw badRequest('This meal is locked. Unlock it to swap.');

  const data = await getTargets(userId);
  const { rows: daySlots } = await query(
    `SELECT DISTINCT slot_no FROM meal_plan_items WHERE meal_plan_id = $1 AND plan_date = $2`,
    [item.meal_plan_id, item.plan_date]);
  const mealsPerDay = Math.max(daySlots.length, data?.profile.meals_per_day || 3);
  const slot = slotsFor(mealsPerDay, item.target_calories).find((s) => s.slot_no === item.slot_no)
    || { slot_no: item.slot_no, meal_type: item.meal_type, calories: Math.round(item.target_calories * 0.3) };
  slot.meal_type = item.meal_type;

  // Everything else planned that day is "used today" so we do not duplicate it.
  const { rows: others } = await query(
    `SELECT food_id, recipe_id FROM meal_plan_items WHERE meal_plan_id = $1 AND plan_date = $2`,
    [item.meal_plan_id, item.plan_date]);
  const usedToday = new Set(others.map((o) => (o.food_id ? `food:${o.food_id}` : `recipe:${o.recipe_id}`)));

  const candidates = await loadCandidates(userId);
  const ranked = rankForSlot(candidates, slot, {
    proteinPct: data?.targets.macro_split.protein ?? 25,
    recentKeys: await recentKeys(userId, item.plan_date),
    usedToday, rng,
  });
  if (!ranked.length) throw badRequest('No other meal fits this slot.');
  const next = ranked[0];

  await withTransaction(async (c) => {
    await c.query(
      `DELETE FROM meal_plan_items WHERE meal_plan_id = $1 AND plan_date = $2 AND slot_no = $3 AND id <> $4`,
      [item.meal_plan_id, item.plan_date, item.slot_no, item.id]);
    await c.query(
      `UPDATE meal_plan_items SET food_id = $1, recipe_id = $2, grams = $3 WHERE id = $4`,
      [next.candidate.kind === 'food' ? next.candidate.id : null,
        next.candidate.kind === 'recipe' ? next.candidate.id : null, next.grams, item.id]);
  });
  return item.meal_plan_id;
}
