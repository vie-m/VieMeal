// Fills a brand-new account with temporary sample history, so a guest sees
// food, weight and water charts after setting their own profile.
// The guest profile itself stays empty. Used by POST /api/auth/guest.
//
// Must run inside a transaction (pass the client "c" from withTransaction).
// Public recipes must exist first (npm run db:recipes).

// Small seeded random generator: same seed = same sample data.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Local date "offset" days from today, as 'YYYY-MM-DD'.
const isoDay = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export async function fillSampleData(c, userId, seed = 42) {
  // 1) Keep profile, allergies and favorites empty. The guest chooses them.
  // Sample history below is not used to guess personal settings.

  // 2) 14 days of temporary weights: slow downward trend with small noise.
  const rng = mulberry32(seed);
  for (let d = -13; d <= 0; d++) {
    const kg = Math.round((76 + d * -0.075 + (rng() - 0.5) * 0.4) * 10) / 10;
    await c.query('INSERT INTO weight_logs (user_id, weight_kg, logged_on) VALUES ($1, $2, $3)', [userId, kg, isoDay(d)]);
  }

  // 3) 14 past days of meals + water (today stays empty so the user can try logging).
  //    Only recipes/foods this user is allowed to eat (diet + allergies) are used.
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const { rows: allowed } = await c.query(
    `SELECT r.id, m.meal_type, rn.total_grams FROM user_allowed_recipes($1) r
     JOIN recipe_meal_types m ON m.recipe_id = r.id JOIN recipe_nutrition rn ON rn.recipe_id = r.id`, [userId]);
  const byMeal = (t) => allowed.filter((a) => a.meal_type === t);
  const { rows: snackFoods } = await c.query(
    `SELECT f.id, s.grams FROM user_allowed_foods($1) f JOIN food_meal_types m ON m.food_id = f.id AND m.meal_type = 'snack'
     JOIN LATERAL (SELECT grams FROM food_servings WHERE food_id = f.id ORDER BY grams LIMIT 1) s ON TRUE`, [userId]);
  if (!byMeal('lunch').length) throw new Error('No public recipes found. Run: npm run db:recipes');

  for (let d = -14; d <= -1; d++) {
    const day = isoDay(d);
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      const r = pick(byMeal(meal));
      const grams = Math.round(r.total_grams * (0.85 + rng() * 0.3)); // 85-115% of one serving
      await c.query(`INSERT INTO food_logs (user_id, logged_on, meal_type, recipe_id, grams) VALUES ($1,$2,$3,$4,$5)`,
        [userId, day, meal, r.id, grams]);
    }
    if (snackFoods.length) {
      const s = pick(snackFoods);
      await c.query(`INSERT INTO food_logs (user_id, logged_on, meal_type, food_id, grams) VALUES ($1,$2,'snack',$3,$4)`,
        [userId, day, s.id, s.grams]);
    }
    // Water: 6-10 glasses of 250 ml, inserted in one statement with generate_series.
    const glasses = 6 + Math.floor(rng() * 5);
    await c.query(
      `INSERT INTO water_logs (user_id, logged_on, amount_ml) SELECT $1, $2, 250 FROM generate_series(1, $3)`,
      [userId, day, glasses]);
  }
}
