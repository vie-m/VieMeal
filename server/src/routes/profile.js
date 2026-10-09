// Profile, allergens, targets and weight logs.
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import {
  asyncRoute, badRequest, requireAuth, int, num, oneOf, date, today,
} from '../utils/http.js';
import { calculateBmi, canChooseLoseGoal, validateMacroSplit } from '../utils/nutrition.js';
import { getProfileWithWeight, getTargets, getUserAllergens } from '../services/profileService.js';

const router = Router();
// Only these paths need login (this router is mounted at /api).
router.use(['/profile', '/weights'], requireAuth);

router.get('/profile', asyncRoute(async (req, res) => {
  const profile = await getProfileWithWeight(req.userId);
  if (!profile) return res.json({ profile: null });
  res.json({ profile, allergens: await getUserAllergens(req.userId) });
}));

// Create or update the profile (used by onboarding and settings).
// Optional weight_kg logs today's weight in the same request.
router.put('/profile', asyncRoute(async (req, res) => {
  const b = req.body;
  const p = {
    sex: oneOf(b.sex, 'Sex', ['male', 'female']),
    birth_date: date(b.birth_date, 'Birth date'),
    height_cm: num(b.height_cm, 'Height (cm)', { min: 100, max: 250 }),
    activity_level: oneOf(b.activity_level, 'Activity level', ['sedentary', 'light', 'moderate', 'active', 'very_active']),
    goal: oneOf(b.goal, 'Goal', ['lose', 'maintain', 'gain']),
    diet_type: oneOf(b.diet_type ?? 'any', 'Diet type', ['any', 'vegetarian', 'vegan', 'pescatarian', 'halal']),
    meals_per_day: int(b.meals_per_day ?? 3, 'Meals per day', { min: 3, max: 5 }),
    bmi_standard: oneOf(b.bmi_standard ?? 'asian', 'BMI standard', ['who', 'asian']),
    protein_pct: int(b.protein_pct ?? 25, 'Protein %'),
    carbs_pct: int(b.carbs_pct ?? 50, 'Carbs %'),
    fat_pct: int(b.fat_pct ?? 25, 'Fat %'),
  };
  const age = (Date.now() - new Date(p.birth_date)) / 3.156e10;
  if (age < 18 || age > 100) throw badRequest('VieMeal is designed for adults aged 18 to 100');
  const macroError = validateMacroSplit({ protein: p.protein_pct, carbs: p.carbs_pct, fat: p.fat_pct });
  if (macroError) throw badRequest(macroError);

  const weight = num(b.weight_kg, 'Weight (kg)', { min: 25, max: 400, optional: true });

  // Safety rule: no weight-loss goal for underweight users.
  const current = weight ?? (await getProfileWithWeight(req.userId))?.weight_kg;
  if (p.goal === 'lose' && current && !canChooseLoseGoal(calculateBmi(current, p.height_cm))) {
    throw badRequest('Your BMI is in the underweight range, so a weight-loss goal is not available. ' +
      '"Maintain" or "gain" is a healthier choice; a doctor or nutritionist can give personal advice.');
  }
  if (!current && !weight) throw badRequest('Please enter your current weight');

  await withTransaction(async (c) => {
    // UPSERT: insert, or update if the profile already exists.
    await c.query(
      `INSERT INTO user_profiles (user_id, sex, birth_date, height_cm, activity_level, goal, diet_type,
                                  meals_per_day, bmi_standard, protein_pct, carbs_pct, fat_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (user_id) DO UPDATE SET
         sex = EXCLUDED.sex, birth_date = EXCLUDED.birth_date, height_cm = EXCLUDED.height_cm,
         activity_level = EXCLUDED.activity_level, goal = EXCLUDED.goal, diet_type = EXCLUDED.diet_type,
         meals_per_day = EXCLUDED.meals_per_day, bmi_standard = EXCLUDED.bmi_standard,
         protein_pct = EXCLUDED.protein_pct, carbs_pct = EXCLUDED.carbs_pct, fat_pct = EXCLUDED.fat_pct,
         updated_at = now()`,
      [req.userId, p.sex, p.birth_date, p.height_cm, p.activity_level, p.goal, p.diet_type,
        p.meals_per_day, p.bmi_standard, p.protein_pct, p.carbs_pct, p.fat_pct]
    );
    if (weight) {
      await c.query(
        `INSERT INTO weight_logs (user_id, weight_kg, logged_on) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, logged_on) DO UPDATE SET weight_kg = EXCLUDED.weight_kg`,
        [req.userId, weight, today()]
      );
    }
  });
  res.json({ profile: await getProfileWithWeight(req.userId) });
}));

router.get('/profile/allergens', asyncRoute(async (req, res) => {
  const { rows: all } = await query('SELECT id, name FROM allergens ORDER BY name');
  res.json({ all, selected: (await getUserAllergens(req.userId)).map((a) => a.id) });
}));

// Replace the whole allergen list: body { allergen_ids: [1, 3] }
router.put('/profile/allergens', asyncRoute(async (req, res) => {
  const ids = req.body.allergen_ids;
  if (!Array.isArray(ids)) throw badRequest('allergen_ids must be a list');
  const clean = ids.map((id) => int(id, 'Allergen id', { min: 1 }));
  await withTransaction(async (c) => {
    await c.query('DELETE FROM user_allergens WHERE user_id = $1', [req.userId]);
    if (clean.length) {
      await c.query(
        `INSERT INTO user_allergens (user_id, allergen_id)
         SELECT $1, a.id FROM allergens a WHERE a.id = ANY($2::int[])`,
        [req.userId, clean]
      );
    }
  });
  res.json({ selected: (await getUserAllergens(req.userId)).map((a) => a.id) });
}));

router.get('/profile/targets', asyncRoute(async (req, res) => {
  const data = await getTargets(req.userId);
  if (!data) return res.status(404).json({ error: 'Please complete your profile first' });
  res.json(data.targets);
}));

// ---- Weight logs ----
router.get('/weights', asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT w.id, w.weight_kg, w.logged_on,
            -- BMI per entry, computed in SQL from the profile height
            ROUND(w.weight_kg / ((p.height_cm / 100) ^ 2), 1) AS bmi
     FROM weight_logs w
     LEFT JOIN user_profiles p ON p.user_id = w.user_id
     WHERE w.user_id = $1
     ORDER BY w.logged_on`,
    [req.userId]
  );
  res.json(rows);
}));

router.post('/weights', asyncRoute(async (req, res) => {
  const weight = num(req.body.weight_kg, 'Weight (kg)', { min: 25, max: 400 });
  const day = date(req.body.logged_on, 'Date', { optional: true }) || today();
  if (day > today()) throw badRequest('Date cannot be in the future');
  const { rows } = await query(
    `INSERT INTO weight_logs (user_id, weight_kg, logged_on) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, logged_on) DO UPDATE SET weight_kg = EXCLUDED.weight_kg
     RETURNING id, weight_kg, logged_on`,
    [req.userId, weight, day]
  );
  res.status(201).json(rows[0]);
}));

export default router;
