// AI endpoints: chat, AI plan generation, "Why this meal?".
// All nutrition numbers come from the database, never from the AI.
import { Router } from 'express';
import { query } from '../db.js';
import { asyncRoute, badRequest, notFound, requireAuth, requireFullAccount, int, str, oneOf, date, today, addDays, MEAL_TYPES } from '../utils/http.js';
import { aiEnabled, aiRateLimit, callAi, parseJsonReply, SAFETY_RULES } from '../services/aiClient.js';
import { getTargets, getUserAllergens } from '../services/profileService.js';
import { balanceDay, generatePlan, loadPlan, savePlan, slotsFor } from '../services/mealPlanner.js';

const router = Router();
router.use(requireAuth);

const NO_AI = 'The AI assistant is not switched on for this app (no AI key configured). ' +
  'Everything else works, including the meal planner.';

// Lets the frontend know whether to show AI buttons.
// "guest: true" means AI is switched on but this user must sign up first.
router.get('/status', (req, res) => {
  res.json({ enabled: aiEnabled(), guest: req.isGuest, provider: aiEnabled() ? process.env.AI_PROVIDER || 'gemini' : null });
});

// Everything below needs a real account (guests get 403 GUEST) and an AI key.
router.use(requireFullAccount);
router.use((req, res, next) => (aiEnabled() ? next() : res.status(503).json({ error: NO_AI })));
router.use(aiRateLimit);

// Profile context for the system prompt. Deliberately NO name or email.
async function userContext(userId) {
  const data = await getTargets(userId);
  if (!data) return 'The user has not completed their profile yet.';
  const { profile, targets: t } = data;
  const allergens = (await getUserAllergens(userId)).map((a) => a.name);
  return [
    `User context (do not repeat it back unless relevant):`,
    `- Sex: ${profile.sex}, age ${t.age}, BMI ${t.bmi} (${t.bmi_category}, ${t.bmi_standard.toUpperCase()} standard)`,
    `- Goal: ${t.goal} weight. Activity: ${profile.activity_level}.`,
    `- Daily target: ${t.calories} kcal; protein ${t.macros.protein_g} g, carbs ${t.macros.carbs_g} g, fat ${t.macros.fat_g} g.`,
    `- Diet: ${profile.diet_type}. Allergies: ${allergens.length ? allergens.join(', ') : 'none'}.`,
    `- Meals per day: ${profile.meals_per_day}.`,
  ].join('\n');
}

// ---- 1. Chat ----
// Body: { messages: [{ role, content }] } (frontend keeps the last 10)
router.post('/chat', asyncRoute(async (req, res) => {
  const msgs = Array.isArray(req.body.messages) ? req.body.messages.slice(-10) : [];
  const clean = msgs
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  // Providers require the conversation to start with a user message.
  while (clean.length && clean[0].role !== 'user') clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== 'user') throw badRequest('Please type a question');

  const system = `${SAFETY_RULES}\n\n${await userContext(req.userId)}`;
  const reply = await callAi({ system, messages: clean });
  res.json({ reply });
}));

// ---- 2. Generate a plan with AI ----
// Find the best database match for a food name the AI suggested, among the
// foods this user is ALLOWED to eat (diet + allergens + dislikes).
async function matchFood(userId, rawName) {
  // AI often writes "Bubur Ayam (Chicken Congee)": try the main name first,
  // then the part in brackets (the translation) if that finds nothing.
  const main = rawName.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  const inBrackets = (rawName.match(/\((.*?)\)/) || [])[1]?.trim();
  for (const name of [main, inBrackets].filter(Boolean)) {
    const food = await matchOne(userId, name);
    if (food) return food;
  }
  return null;
}

async function matchOne(userId, name) {
  const { rows } = await query(
    `SELECT f.id, f.name, f.calories_kcal AS kcal, f.protein_g AS protein, f.carbs_g AS carbs, f.fat_g AS fat,
            (SELECT MIN(s.grams) FROM food_servings s WHERE s.food_id = f.id AND s.grams >= 30) AS base_grams
     FROM user_allowed_foods($1) f
     WHERE f.name ILIKE '%' || $2 || '%' OR word_similarity($2, f.name) >= 0.45
     -- Exact name first, then the closest name, then Indonesian/custom entries, then shorter names
     ORDER BY (f.name ILIKE $2) DESC, round(word_similarity($2, f.name)::numeric, 1) DESC,
              (f.source <> 'usda') DESC, similarity(f.name, $2) DESC, length(f.name)
     LIMIT 1`,
    [userId, name]
  );
  return rows[0] || null;
}

const AI_PLAN_FORMAT = `Return ONLY a JSON object, no other text, in exactly this shape:
{"days":[{"meals":[{"meal_type":"breakfast","items":[{"food":"Nasi putih","grams":150}]}]}]}
- meal_type is one of: breakfast, lunch, dinner, snack
- 1 to 4 items per meal; "food" is a simple, common food name (English or Indonesian), WITHOUT translations or notes in brackets; grams is a number between 5 and 600
- Use foods as eaten (cooked rice, boiled egg), not raw ingredients.
- Use whole foods and common dishes; vary meals across days.`;

router.post('/generate-plan', asyncRoute(async (req, res) => {
  const days = int(req.body.days ?? 1, 'days', { min: 1, max: 7 });
  if (days !== 1 && days !== 7) throw badRequest('days must be 1 or 7');
  const start = date(req.body.start_date, 'start_date', { optional: true }) || today();
  const data = await getTargets(req.userId);
  if (!data) throw badRequest('Please complete your profile first');
  const { profile, targets } = data;
  const slots = slotsFor(profile.meals_per_day, targets.calories);

  const fallback = async (reason) => {
    const id = await generatePlan(req.userId, { days, startDate: start });
    res.status(201).json({ plan: await loadPlan(req.userId, id), fallback: true,
      message: `${reason} We made a plan with our own planner instead.` });
  };

  let parsed;
  try {
    const system = `${SAFETY_RULES}\n\n${await userContext(req.userId)}\n\n${AI_PLAN_FORMAT}`;
    const ask = `Create a ${days}-day meal plan with these meals each day: ${slots.map((s) => `${s.meal_type} (~${s.calories} kcal)`).join(', ')}. ` +
      `Total about ${targets.calories} kcal per day. Respect the diet and allergies.`;
    const text = await callAi({ system, messages: [{ role: 'user', content: ask }], json: true, maxTokens: days === 7 ? 4000 : 1200 });
    parsed = parseJsonReply(text);
    if (!Array.isArray(parsed.days) || parsed.days.length === 0) throw new Error('missing days');
  } catch (err) {
    console.warn('AI plan failed:', err.message);
    return fallback('The AI could not create a plan right now.');
  }

  // Validate + match every food to the database. Nothing from the AI is used
  // except food names, grams and meal types.
  const plan = [];
  const removed = new Set();
  for (let d = 0; d < days; d++) {
    const aiDay = parsed.days[d] || parsed.days[d % parsed.days.length];
    const items = [];
    const meals = Array.isArray(aiDay?.meals) ? aiDay.meals : [];
    meals.slice(0, slots.length).forEach((meal, i) => {
      // Map the AI meal to our slot (use the AI's meal type if valid).
      const slot = slots[i];
      meal._slot = { slot_no: slot.slot_no, meal_type: MEAL_TYPES.includes(meal.meal_type) ? meal.meal_type : slot.meal_type };
    });
    for (const meal of meals.slice(0, slots.length)) {
      for (const it of (Array.isArray(meal.items) ? meal.items : []).slice(0, 4)) {
        const name = typeof it.food === 'string' ? it.food.trim().slice(0, 80) : '';
        const grams = Number(it.grams);
        if (!name || !(grams >= 5 && grams <= 600)) continue;
        const food = await matchFood(req.userId, name);
        if (!food) { removed.add(name); continue; } // unknown or conflicts with diet/allergens
        items.push({ ...meal._slot, candidate: { kind: 'food', ...food }, grams: Math.round(grams), is_locked: false });
      }
    }
    if (!items.length) return fallback('The AI suggested foods we could not match safely.');
    // Real nutrition from the DB: adjust portions so the day is within +-10% of target.
    balanceDay(items, targets.calories);
    plan.push({ date: addDays(start, d), items });
  }

  const id = await savePlan(req.userId, { startDate: start, days, targetCalories: targets.calories, createdBy: 'ai', plan });
  res.status(201).json({
    plan: await loadPlan(req.userId, id),
    fallback: false,
    removed: [...removed],
    message: removed.size
      ? `Some suggested foods were left out because they were not in our database or did not fit your diet/allergies: ${[...removed].slice(0, 6).join(', ')}.`
      : 'Plan created by AI. All nutrition values are calculated from our food database.',
  });
}));

// ---- 3. Why this meal? ----
router.post('/explain', asyncRoute(async (req, res) => {
  const itemId = int(req.body.item_id, 'item_id', { min: 1 });
  const { rows } = await query(
    `SELECT i.meal_type, i.grams, i.plan_date, i.slot_no, i.meal_plan_id, COALESCE(f.name, r.name) AS name,
            ROUND(COALESCE(f.calories_kcal, rn.calories_per_100g) * i.grams / 100) AS kcal,
            ROUND(COALESCE(f.protein_g, rn.protein_per_100g) * i.grams / 100, 1) AS protein,
            ROUND(COALESCE(f.carbs_g, rn.carbs_per_100g) * i.grams / 100, 1) AS carbs,
            ROUND(COALESCE(f.fat_g, rn.fat_per_100g) * i.grams / 100, 1) AS fat
     FROM meal_plan_items i JOIN meal_plans p ON p.id = i.meal_plan_id
     LEFT JOIN foods f ON f.id = i.food_id
     LEFT JOIN recipes r ON r.id = i.recipe_id
     LEFT JOIN recipe_nutrition rn ON rn.recipe_id = i.recipe_id
     WHERE i.id = $1 AND p.user_id = $2`,
    [itemId, req.userId]
  );
  const it = rows[0];
  if (!it) throw notFound('Meal not found');
  // Include the other items of the same slot (AI meals can have several).
  const { rows: same } = await query(
    `SELECT COALESCE(f.name, r.name) AS name, i.grams FROM meal_plan_items i
     LEFT JOIN foods f ON f.id = i.food_id LEFT JOIN recipes r ON r.id = i.recipe_id
     WHERE i.meal_plan_id = $1 AND i.plan_date = $2 AND i.slot_no = $3`,
    [it.meal_plan_id, it.plan_date, it.slot_no]);

  const system = `${SAFETY_RULES}\n\n${await userContext(req.userId)}\nAnswer in 2 to 3 sentences only.`;
  const ask = `Why does this ${it.meal_type} fit my goals? Meal: ${same.map((s) => `${s.name} (${s.grams} g)`).join(', ')}. ` +
    `For "${it.name}" (${it.grams} g) our database says: ${it.kcal} kcal, ${it.protein} g protein, ${it.carbs} g carbs, ${it.fat} g fat. ` +
    `Use these numbers, do not invent others.`;
  const reply = await callAi({ system, messages: [{ role: 'user', content: ask }], maxTokens: 250 });
  res.json({ explanation: reply });
}));

export default router;
