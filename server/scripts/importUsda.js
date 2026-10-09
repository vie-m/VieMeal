// =====================================================================
// Imports the USDA FoodData Central "SR Legacy" CSV files into VieMeal.
//
// Download: https://fdc.nal.usda.gov/download-datasets.html
//   -> "SR Legacy" -> CSV. Unzip so the .csv files sit directly in data/usda/
//
// Files used:
//   food.csv           fdc_id, description, food_category_id
//   food_category.csv  USDA food groups (e.g. "Poultry Products")
//   food_nutrient.csv  one row per (food, nutrient) with the amount per 100 g
//   food_portion.csv   household measures ("1 cup" = 240 g)
//   measure_unit.csv   unit names for the portions
//
// Run: npm run db:usda      (safe to re-run: existing USDA foods are skipped)
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import { pool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data/usda');

// Nutrient IDs looked up in nutrient.csv (column "id"). All values are per 100 g.
const NUTRIENTS = {
  1008: 'calories_kcal', // "Energy", unit KCAL   (1062 is the same energy in kJ, not used)
  1003: 'protein_g',     // "Protein", G
  1005: 'carbs_g',       // "Carbohydrate, by difference", G
  1004: 'fat_g',         // "Total lipid (fat)", G
  1079: 'fiber_g',       // "Fiber, total dietary", G
  2000: 'sugar_g',       // "Sugars, Total", G   (1063 "Sugars, Total NLEA" is a fallback)
  1063: 'sugar_nlea_g',
  1093: 'sodium_mg',     // "Sodium, Na", MG
};

// USDA food group (food_category.csv "id") -> VieMeal category name.
const CATEGORY_MAP = {
  1: 'dairy',         // Dairy and Egg Products (eggs are moved below by name)
  2: 'spices & herbs',
  3: 'other',         // Baby Foods
  4: 'fats & oils',
  5: 'poultry',
  6: 'soups & sauces',
  7: 'meat',          // Sausages and Luncheon Meats
  8: 'grains',        // Breakfast Cereals
  9: 'fruits',
  10: 'meat',         // Pork Products
  11: 'vegetables',
  12: 'nuts & seeds',
  13: 'meat',         // Beef Products
  14: 'drinks',
  15: 'fish',         // Finfish and Shellfish Products
  16: 'legumes',
  17: 'meat',         // Lamb, Veal, and Game Products
  18: 'grains',       // Baked Products
  19: 'sweets',
  20: 'grains',       // Cereal Grains and Pasta
  21: 'dishes',       // Fast Foods
  22: 'dishes',       // Meals, Entrees, and Side Dishes
  23: 'snacks',
  24: 'other',        // American Indian/Alaska Native Foods
  25: 'dishes',       // Restaurant Foods
  26: 'other',        // Branded
  27: 'other',        // Quality Control Materials (skipped below)
  28: 'drinks',       // Alcoholic Beverages
};

// Groups that are clearly animal flesh -> not vegetarian.
const MEAT_GROUPS = new Set([5, 7, 10, 13, 15, 17]);
// Groups that are plant-based by nature.
const PLANT_GROUPS = new Set([2, 9, 11, 12, 16, 20]);

const has = (name, words) => words.some((w) => name.includes(w));

const MEAT_WORDS = ['beef', 'pork', 'chicken', 'turkey', 'lamb', 'veal', 'bacon', 'ham,', 'ham ', 'sausage',
  'fish', 'tuna', 'salmon', 'shrimp', 'crab', 'meat', 'anchov', 'gelatin', 'lard', 'duck', 'venison', 'pepperoni', 'salami'];
const ANIMAL_WORDS = ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg', 'honey', 'whey', 'casein', 'ghee', 'mayonnaise'];
const NOT_HALAL_WORDS = ['pork', 'bacon', 'ham,', 'ham ', 'lard', 'wine', 'beer', 'whiskey', 'rum', 'vodka', 'liqueur',
  'pepperoni', 'salami', 'prosciutto', 'gelatin'];

// Guess diet flags. NULL = unknown (we prefer "unknown" over a wrong guess).
function dietFlags(groupId, rawName) {
  const name = rawName.toLowerCase();
  const isMeat = MEAT_GROUPS.has(groupId) || has(name, MEAT_WORDS);
  const isAnimal = isMeat || groupId === 1 || has(name, ANIMAL_WORDS);

  let is_vegetarian = null;
  let is_vegan = null;
  if (isMeat) { is_vegetarian = false; is_vegan = false; }
  else if (groupId === 1) { is_vegetarian = true; is_vegan = false; }   // dairy & eggs
  else if (PLANT_GROUPS.has(groupId)) {
    is_vegetarian = true;
    is_vegan = !isAnimal;
  } else if (groupId === 4) {                                          // fats & oils
    is_vegetarian = !has(name, ['lard', 'tallow', 'fish', 'chicken fat', 'beef']);
    is_vegan = is_vegetarian && !isAnimal;
  }

  // Halal: only mark FALSE when we are sure (pork group, alcohol, pork words).
  const is_halal = groupId === 10 || groupId === 28 || has(name, NOT_HALAL_WORDS) ? false : null;
  return { is_vegetarian, is_vegan, is_halal };
}

// Guess allergens from the USDA name (keyword based, conservative).
function allergensFor(groupId, rawName) {
  const n = rawName.toLowerCase();
  const out = [];
  if (has(n, ['wheat', 'bread', 'pasta', 'spaghetti', 'macaroni', 'noodle', 'flour', 'barley', 'rye', 'cracker',
    'cookie', 'cake', 'muffin', 'bagel', 'croissant', 'pizza', 'biscuit', 'tortillas, ready-to-bake or -fry, flour'])
    && !n.includes('rice noodle')) out.push('gluten');
  if ((groupId === 1 && !n.startsWith('egg')) || has(n, ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'whey']))
    if (!has(n, ['coconut milk', 'soymilk', 'peanut butter', 'almond butter', 'cocoa butter', 'butterbur', 'buttermilk biscuits']))
      out.push('dairy');
  if (n.startsWith('egg') || has(n, [' egg', 'mayonnaise'])) out.push('egg');
  if (n.includes('peanut')) out.push('peanut');
  if (has(n, ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazilnut'])) out.push('tree nut');
  if (has(n, ['soy', 'tofu', 'tempeh', 'miso', 'edamame'])) out.push('soy');
  if (groupId === 15 && !has(n, ['crustacean', 'mollusk', 'shrimp', 'crab', 'lobster'])) out.push('fish');
  if (has(n, ['fish', 'tuna', 'salmon', 'anchov', 'sardine', 'cod,'])) out.push('fish');
  if (has(n, ['crustacean', 'mollusk', 'shrimp', 'crab', 'lobster', 'clam', 'oyster', 'mussel', 'scallop', 'squid'])) out.push('shellfish');
  if (n.includes('sesame') || n.includes('tahini')) out.push('sesame');
  return [...new Set(out)];
}

// A small curated set of USDA foods that the meal planner may suggest on
// their own, with the meals they suit. (Most USDA rows are ingredients like
// "Beef, chuck, raw", which should not be a whole meal.)
const PLANNER_FOODS = {
  173904: ['breakfast'],               // Oats, dry (cooked as oatmeal)
  170894: ['breakfast', 'snack'],      // Greek yogurt, nonfat
  173944: ['breakfast', 'snack'],      // Banana
  171688: ['snack'],                   // Apple
  169097: ['snack'],                   // Orange
  169910: ['snack'],                   // Mango
  169926: ['breakfast', 'snack'],      // Papaya
  167762: ['snack'],                   // Strawberries
  173424: ['breakfast', 'snack'],      // Egg, hard-boiled
  171646: ['breakfast', 'snack'],      // Granola
  168592: ['snack'],                   // Almonds, honey roasted
  172454: ['snack'],                   // Hummus
  170870: ['breakfast', 'snack'],      // Milk 2%
  172446: ['breakfast', 'snack'],      // Soymilk
  171705: ['snack'],                   // Avocado
  168483: ['snack', 'lunch', 'dinner'] // Sweet potato, baked
};

// Read a whole CSV file into an array of objects (fine for the small files).
async function readCsv(file) {
  const rows = [];
  const parser = fs.createReadStream(path.join(DATA_DIR, file)).pipe(parse({ columns: true }));
  for await (const row of parser) rows.push(row);
  return rows;
}

async function main() {
  if (!fs.existsSync(path.join(DATA_DIR, 'food.csv'))) {
    console.error(`USDA CSV files not found in ${DATA_DIR}. See README "USDA import".`);
    process.exit(1);
  }
  console.time('USDA import');

  // 1) Load foods (only "sr_legacy_food" rows, skip QC materials)
  const foods = new Map();
  for (const r of await readCsv('food.csv')) {
    const group = Number(r.food_category_id);
    if (r.data_type !== 'sr_legacy_food' || group === 27) continue;
    foods.set(r.fdc_id, { fdc_id: r.fdc_id, name: r.description.slice(0, 255), group, n: {} });
  }
  console.log(`foods read: ${foods.size}`);

  // 2) Stream the big nutrient file (~640k rows) and keep only our nutrient IDs
  const parser = fs.createReadStream(path.join(DATA_DIR, 'food_nutrient.csv')).pipe(parse({ columns: true }));
  for await (const r of parser) {
    const key = NUTRIENTS[r.nutrient_id];
    const food = foods.get(r.fdc_id);
    if (key && food) food.n[key] = Number(r.amount);
  }

  // 3) Household portions
  const units = new Map((await readCsv('measure_unit.csv')).map((u) => [u.id, u.name]));
  const portions = [];
  for (const p of await readCsv('food_portion.csv')) {
    if (!foods.has(p.fdc_id) || !(Number(p.gram_weight) > 0)) continue;
    const unit = p.measure_unit_id === '9999' ? '' : units.get(p.measure_unit_id) || '';
    // e.g. "1 cup, chopped" or "1 large"
    const desc = [p.amount, unit, p.modifier || p.portion_description].filter(Boolean).join(' ').trim();
    portions.push({ fdc_id: p.fdc_id, desc: desc.slice(0, 120), grams: Number(p.gram_weight) });
  }

  // 4) Category name -> id
  const { rows: cats } = await pool.query('SELECT id, name FROM food_categories');
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  const { rows: alls } = await pool.query('SELECT id, name FROM allergens');
  const allergenId = Object.fromEntries(alls.map((a) => [a.name, a.id]));

  // 5) Insert in batches of 1000 using unnest() so one query inserts many rows
  const list = [...foods.values()].filter((f) => f.n.calories_kcal !== undefined);
  let inserted = 0;
  for (let i = 0; i < list.length; i += 1000) {
    const batch = list.slice(i, i + 1000);
    const cols = { name: [], cat: [], ref: [], kcal: [], p: [], c: [], f: [], fib: [], sug: [], na: [], veg: [], vegan: [], halal: [] };
    for (const f of batch) {
      const lower = f.name.toLowerCase();
      // Eggs live in the dairy group in USDA; give them their own category.
      const category = lower.startsWith('egg,') || lower.startsWith('egg ') ? 'eggs' : CATEGORY_MAP[f.group] || 'other';
      const d = dietFlags(f.group, f.name);
      cols.name.push(f.name); cols.cat.push(catId[category]); cols.ref.push(f.fdc_id);
      cols.kcal.push(f.n.calories_kcal); cols.p.push(f.n.protein_g ?? 0); cols.c.push(f.n.carbs_g ?? 0);
      cols.f.push(f.n.fat_g ?? 0); cols.fib.push(f.n.fiber_g ?? 0);
      cols.sug.push(f.n.sugar_g ?? f.n.sugar_nlea_g ?? 0); cols.na.push(f.n.sodium_mg ?? 0);
      cols.veg.push(d.is_vegetarian); cols.vegan.push(d.is_vegan); cols.halal.push(d.is_halal);
    }
    const res = await pool.query(
      `INSERT INTO foods (name, category_id, source, source_ref, calories_kcal, protein_g, carbs_g, fat_g,
                          fiber_g, sugar_g, sodium_mg, is_vegetarian, is_vegan, is_halal)
       SELECT n, c, 'usda', r, k, p, cb, f, fb, s, na, v, vg, h
       FROM unnest($1::text[], $2::int[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[],
                   $8::numeric[], $9::numeric[], $10::numeric[], $11::bool[], $12::bool[], $13::bool[])
            AS t(n, c, r, k, p, cb, f, fb, s, na, v, vg, h)
       ON CONFLICT (source, source_ref) DO NOTHING`,
      [cols.name, cols.cat, cols.ref, cols.kcal, cols.p, cols.c, cols.f, cols.fib, cols.sug, cols.na,
        cols.veg, cols.vegan, cols.halal]
    );
    inserted += res.rowCount;
  }
  console.log(`foods inserted: ${inserted} (skipped existing: ${list.length - inserted})`);

  // 6) Map fdc_id -> our foods.id, then insert servings, allergens, planner meal types
  const { rows: idRows } = await pool.query(`SELECT id, source_ref FROM foods WHERE source = 'usda'`);
  const idOf = new Map(idRows.map((r) => [r.source_ref, r.id]));

  const sFood = [], sDesc = [], sGrams = [];
  for (const p of portions) {
    if (!idOf.has(p.fdc_id) || !p.desc) continue;
    sFood.push(idOf.get(p.fdc_id)); sDesc.push(`${p.desc} (${Math.round(p.grams)} g)`); sGrams.push(p.grams);
  }
  await pool.query(
    `INSERT INTO food_servings (food_id, description, grams)
     SELECT * FROM unnest($1::int[], $2::text[], $3::numeric[]) ON CONFLICT DO NOTHING`,
    [sFood, sDesc, sGrams]
  );

  const aFood = [], aId = [];
  for (const f of list) {
    for (const a of allergensFor(f.group, f.name)) {
      if (idOf.has(f.fdc_id)) { aFood.push(idOf.get(f.fdc_id)); aId.push(allergenId[a]); }
    }
  }
  await pool.query(
    `INSERT INTO food_allergens (food_id, allergen_id)
     SELECT * FROM unnest($1::int[], $2::int[]) ON CONFLICT DO NOTHING`, [aFood, aId]);

  for (const [fdc, meals] of Object.entries(PLANNER_FOODS)) {
    const id = idOf.get(fdc);
    if (!id) continue;
    for (const m of meals) {
      await pool.query(`INSERT INTO food_meal_types VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, m]);
    }
  }

  console.log(`servings: ${sFood.length}, allergen links: ${aFood.length}`);
  console.timeEnd('USDA import');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
