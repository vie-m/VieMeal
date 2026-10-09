// Meal planner tests.
// Part 1 tests the pure algorithm with fake foods (no database needed).
// Part 2 runs the real planner against PostgreSQL with a temporary vegan user
// who is allergic to peanuts and soy, and checks every planned item.
// Part 2 is skipped automatically when the database is not reachable.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import {
  slotsFor, scalePortion, portionLimits, buildDay, balanceDay, nutritionOf, rankForSlot,
} from '../src/services/mealPlanner.js';

// Simple seeded random generator so the tests are repeatable.
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const food = (id, name, kcal, protein, meal_types, extra = {}) => ({
  kind: 'food', id, name, kcal, protein, carbs: 20, fat: 5, meal_types, is_favorite: false, base_grams: 100, ...extra,
});
const recipe = (id, name, kcal, protein, meal_types, extra = {}) => ({
  kind: 'recipe', id, name, kcal, protein, carbs: 20, fat: 5, meal_types, is_favorite: false, base_grams: 400, ...extra,
});

const CANDIDATES = [
  recipe(1, 'Oatmeal', 110, 4, ['breakfast']),
  recipe(2, 'Egg toast', 180, 11, ['breakfast']),
  recipe(3, 'Chicken rice', 150, 10, ['lunch', 'dinner']),
  recipe(4, 'Fish rice', 140, 11, ['lunch', 'dinner']),
  recipe(5, 'Tofu stir-fry', 130, 7, ['lunch', 'dinner']),
  food(6, 'Yogurt', 95, 9, ['snack', 'breakfast'], { base_grams: 170 }),
  food(7, 'Banana', 89, 1, ['snack'], { base_grams: 120 }),
];

const totalKcal = (items) => items.reduce((s, it) => s + nutritionOf(it.candidate, it.grams).calories_kcal, 0);

describe('slotsFor (step 1)', () => {
  it('splits 3 meals 30/40/30', () => {
    expect(slotsFor(3, 2000).map((s) => s.calories)).toEqual([600, 800, 600]);
  });
  it('adds snacks for 4 and 5 meals and always sums to ~100%', () => {
    for (const n of [4, 5]) {
      const slots = slotsFor(n, 2000);
      expect(slots).toHaveLength(n);
      expect(slots.some((s) => s.meal_type === 'snack')).toBe(true);
      expect(slots.reduce((s, x) => s + x.calories, 0)).toBe(2000);
    }
  });
});

describe('scalePortion (step 3)', () => {
  it('hits the calorie budget when possible', () => {
    // 200 kcal per 100 g, want 300 kcal -> 150 g
    expect(scalePortion(food(1, 'x', 200, 5, [], { base_grams: 100 }), 300)).toBe(150);
  });
  it('stays inside realistic limits', () => {
    const tiny = food(1, 'lettuce', 15, 1, [], { base_grams: 100 });
    const [lo, hi] = portionLimits(tiny);
    expect(scalePortion(tiny, 800)).toBe(hi); // would need 5 kg -> capped
    expect(hi).toBeLessThanOrEqual(500);
    expect(scalePortion(food(2, 'oil', 884, 0, [], { base_grams: 100 }), 50)).toBe(lo);
    expect(lo).toBeGreaterThanOrEqual(30);
  });
});

describe('rankForSlot / buildDay (steps 4-5)', () => {
  it('only uses candidates suitable for the meal type', () => {
    const ranked = rankForSlot(CANDIDATES, { meal_type: 'breakfast', calories: 500 },
      { proteinPct: 25, recentKeys: new Set(), usedToday: new Set(), rng: seeded(1) });
    expect(ranked.every((r) => r.candidate.meal_types.includes('breakfast'))).toBe(true);
  });

  it('never repeats the same item in one day', () => {
    const items = buildDay({
      candidates: CANDIDATES, slots: slotsFor(5, 2000), targetCalories: 2000,
      ctx: { proteinPct: 25, recentKeys: new Set(), rng: seeded(2) },
    });
    const keys = items.map((i) => `${i.candidate.kind}:${i.candidate.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the day within +-10% of the target for many targets', () => {
    for (const target of [1200, 1500, 1800, 2200, 2600]) {
      for (const meals of [3, 4, 5]) {
        const items = buildDay({
          candidates: CANDIDATES, slots: slotsFor(meals, target), targetCalories: target,
          ctx: { proteinPct: 25, recentKeys: new Set(), rng: seeded(target + meals) },
        });
        const ratio = totalKcal(items) / target;
        expect(ratio).toBeGreaterThanOrEqual(0.9);
        expect(ratio).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('keeps locked items exactly as they were', () => {
    const locked = new Map([[1, [{ candidate: CANDIDATES[1], grams: 250 }]]]);
    const items = buildDay({
      candidates: CANDIDATES, slots: slotsFor(3, 1800), targetCalories: 1800, locked,
      ctx: { proteinPct: 25, recentKeys: new Set(), rng: seeded(3) },
    });
    const first = items.find((i) => i.slot_no === 1);
    expect(first.is_locked).toBe(true);
    expect(first.candidate.id).toBe(2);
    expect(first.grams).toBe(250);
  });

  it('prefers variety: recently eaten items get a penalty', () => {
    const ctx = { proteinPct: 25, usedToday: new Set(), rng: () => 0 };
    const slot = { meal_type: 'lunch', calories: 700 };
    const best = rankForSlot(CANDIDATES, slot, { ...ctx, recentKeys: new Set() })[0];
    const key = `${best.candidate.kind}:${best.candidate.id}`;
    const again = rankForSlot(CANDIDATES, slot, { ...ctx, recentKeys: new Set([key]) })[0];
    expect(`${again.candidate.kind}:${again.candidate.id}`).not.toBe(key);
  });

  it('balanceDay scales unlocked portions toward the target', () => {
    const items = [
      { candidate: CANDIDATES[2], grams: 200, is_locked: false },
      { candidate: CANDIDATES[3], grams: 200, is_locked: false },
    ];
    balanceDay(items, 1000); // starts at 580 kcal
    expect(totalKcal(items)).toBeGreaterThan(900);
  });
});

// ---------------------------------------------------------------------
// Part 2: real database
// ---------------------------------------------------------------------
let db = null;
try {
  db = await import('../src/db.js');
  await db.query('SELECT 1 FROM foods LIMIT 1');
} catch {
  db = null;
}

describe.skipIf(!db)('generatePlan with the real database', () => {
  let userId;
  let planner;
  const target = { calories: 0 };

  beforeAll(async () => {
    planner = await import('../src/services/mealPlanner.js');
    const { getTargets } = await import('../src/services/profileService.js');
    const { rows } = await db.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ('Planner Test', 'planner-test-' || floor(random() * 1e9)::text || '@test.local', 'x') RETURNING id`);
    userId = rows[0].id;
    await db.query(
      `INSERT INTO user_profiles (user_id, sex, birth_date, height_cm, activity_level, goal, diet_type, meals_per_day, bmi_standard)
       VALUES ($1, 'female', '1998-06-01', 160, 'moderate', 'maintain', 'vegan', 4, 'asian')`, [userId]);
    await db.query('INSERT INTO weight_logs (user_id, weight_kg, logged_on) VALUES ($1, 55, CURRENT_DATE)', [userId]);
    await db.query(`INSERT INTO user_allergens SELECT $1, id FROM allergens WHERE name IN ('peanut', 'soy')`, [userId]);
    target.calories = (await getTargets(userId)).targets.calories;
  });

  afterAll(async () => {
    if (userId) await db.query('DELETE FROM users WHERE id = $1', [userId]); // cascades to plans
    await db.pool.end();
  });

  it('7-day plan: vegan, no peanut/soy, every day within +-10%', async () => {
    const planId = await planner.generatePlan(userId, { days: 7, rng: seeded(7) });
    const plan = await planner.loadPlan(userId, planId);
    expect(plan.days).toHaveLength(7);

    // Every planned food (directly, or as a recipe ingredient) must be vegan and allergen-free.
    const { rows: bad } = await db.query(
      `WITH planned AS (
         SELECT food_id FROM meal_plan_items WHERE meal_plan_id = $1 AND food_id IS NOT NULL
         UNION
         SELECT ri.food_id FROM meal_plan_items i JOIN recipe_ingredients ri ON ri.recipe_id = i.recipe_id
         WHERE i.meal_plan_id = $1)
       SELECT f.name, f.is_vegan,
              ARRAY(SELECT a.name FROM food_allergens fa JOIN allergens a ON a.id = fa.allergen_id
                    WHERE fa.food_id = f.id AND a.name IN ('peanut', 'soy')) AS allergens
       FROM planned p JOIN foods f ON f.id = p.food_id
       WHERE f.is_vegan IS DISTINCT FROM TRUE
          OR EXISTS (SELECT 1 FROM food_allergens fa JOIN allergens a ON a.id = fa.allergen_id
                     WHERE fa.food_id = f.id AND a.name IN ('peanut', 'soy'))`,
      [planId]);
    expect(bad).toEqual([]);

    for (const day of plan.days) {
      expect(day.items.length).toBeGreaterThan(0);
      const ratio = day.totals.calories_kcal / target.calories;
      expect(ratio).toBeGreaterThanOrEqual(0.9);
      expect(ratio).toBeLessThanOrEqual(1.1);
    }
  });
});
