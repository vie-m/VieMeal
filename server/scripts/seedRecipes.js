// =====================================================================
// Seeds the public recipes (Indonesian + international).
// Run AFTER schema, Indonesian seed and USDA import:  npm run db:recipes
// Safe to re-run: existing recipes are kept.
// (Guest accounts get their sample logs from src/services/sampleData.js.)
// =====================================================================
import { pool, withTransaction } from '../src/db.js';

// Ingredient references: 'usda:<fdc_id>' or 'id:<exact Indonesian food name>'
const RECIPES = [
  // ---- Indonesian plates ----
  { name: 'Nasi ayam goreng komplit', meals: ['lunch', 'dinner'], prep: 30, desc: 'Fried chicken with rice, stir-fried water spinach and sambal.',
    steps: 'Fry the marinated chicken until golden. Stir-fry kangkung with garlic. Serve with warm rice and a little sambal.',
    items: [['id:Nasi putih', 150], ['id:Ayam goreng', 100], ['id:Tumis kangkung', 80], ['id:Sambal terasi', 10]] },
  { name: 'Nasi rendang', meals: ['lunch', 'dinner'], prep: 15, desc: 'Rice with beef rendang and cassava-leaf style vegetables.',
    steps: 'Warm the rendang. Serve with rice and stir-fried greens.',
    items: [['id:Nasi putih', 150], ['id:Rendang daging', 80], ['id:Tumis kangkung', 80]] },
  { name: 'Nasi pecel', meals: ['breakfast', 'lunch'], prep: 20, desc: 'Rice with boiled vegetables, peanut sauce and fried tempe.',
    steps: 'Boil the vegetables, pour peanut sauce over, serve with rice and tempe.',
    items: [['id:Nasi putih', 120], ['id:Pecel', 180], ['id:Tempe goreng', 40]] },
  { name: 'Soto ayam dengan nasi', meals: ['breakfast', 'lunch', 'dinner'], prep: 40, desc: 'Turmeric chicken soup served with rice.',
    steps: 'Simmer chicken with turmeric broth, add bean sprouts and egg noodles, serve with rice.',
    items: [['id:Soto ayam', 350], ['id:Nasi putih', 100]] },
  { name: 'Nasi ikan bakar sayur asem', meals: ['lunch', 'dinner'], prep: 35, desc: 'Grilled fish with rice and tamarind vegetable soup.',
    steps: 'Grill the marinated fish. Cook the sayur asem. Serve together with rice.',
    items: [['id:Nasi putih', 150], ['id:Ikan bakar', 120], ['id:Sayur asem', 200]] },
  { name: 'Nasi tempe tahu sayur sop', meals: ['lunch', 'dinner'], prep: 30, desc: 'Vegetarian plate: sweet tempe, fried tofu and vegetable soup.',
    steps: 'Cook tempe bacem, fry the tofu, prepare the vegetable soup, serve with rice.',
    items: [['id:Nasi putih', 150], ['id:Tempe bacem', 60], ['id:Tahu goreng', 50], ['id:Sayur sop', 200]] },
  { name: 'Lontong sayur', meals: ['breakfast', 'lunch'], prep: 30, desc: 'Rice cake in coconut vegetable curry with a balado egg.',
    steps: 'Slice the lontong, pour hot sayur lodeh on top, add a telur balado.',
    items: [['id:Lontong', 150], ['id:Sayur lodeh', 250], ['id:Telur balado', 65]] },
  { name: 'Nasi merah ayam bakar', meals: ['lunch', 'dinner'], prep: 40, desc: 'Brown rice, grilled chicken and water spinach.',
    steps: 'Grill the chicken with sweet soy marinade. Serve with brown rice and stir-fried kangkung.',
    items: [['id:Nasi merah', 150], ['id:Ayam bakar', 120], ['id:Tumis kangkung', 100]] },
  { name: 'Sate ayam lontong', meals: ['lunch', 'dinner'], prep: 40, desc: 'Chicken satay with peanut sauce and rice cake.',
    steps: 'Grill the skewers, serve with peanut sauce and sliced lontong.',
    items: [['id:Sate ayam', 125], ['id:Lontong', 150]] },
  { name: 'Gado-gado lontong', meals: ['lunch', 'dinner'], prep: 25, desc: 'Vegetable salad with peanut sauce and rice cake.',
    steps: 'Arrange boiled vegetables, tofu, tempe and egg; pour peanut sauce; add lontong.',
    items: [['id:Gado-gado', 280], ['id:Lontong', 100]] },
  { name: 'Nasi pepes ikan', meals: ['lunch', 'dinner'], prep: 45, desc: 'Steamed spiced fish in banana leaf with rice and soup.',
    steps: 'Wrap seasoned fish in banana leaf, steam, then grill briefly. Serve with rice and sayur sop.',
    items: [['id:Nasi putih', 150], ['id:Pepes ikan', 120], ['id:Sayur sop', 200]] },
  { name: 'Nasi telur dadar', meals: ['breakfast', 'lunch'], prep: 15, desc: 'Quick rice with omelette and greens.',
    steps: 'Make an omelette with spring onion, stir-fry the kangkung, serve with rice.',
    items: [['id:Nasi putih', 150], ['id:Telur dadar', 70], ['id:Tumis kangkung', 80]] },
  { name: 'Nasi uduk komplit', meals: ['breakfast', 'lunch'], prep: 30, desc: 'Coconut rice with omelette, tempe and sambal.',
    steps: 'Serve the coconut rice with sliced omelette, fried tempe and sambal.',
    items: [['id:Nasi uduk', 180], ['id:Telur dadar', 50], ['id:Tempe goreng', 30], ['id:Sambal terasi', 10]] },
  { name: 'Nasi opor ayam', meals: ['lunch', 'dinner'], prep: 50, desc: 'Chicken in mild coconut curry with rice.',
    steps: 'Simmer chicken in spiced coconut milk until tender. Serve with rice.',
    items: [['id:Nasi putih', 150], ['id:Opor ayam', 220]] },
  { name: 'Nasi gulai kambing', meals: ['lunch', 'dinner'], prep: 60, desc: 'Goat curry with rice and vegetables.',
    steps: 'Simmer goat meat in gulai spices. Serve with rice and stir-fried greens.',
    items: [['id:Nasi putih', 150], ['id:Gulai kambing', 200], ['id:Tumis kangkung', 60]] },
  // ---- International ----
  { name: 'Oatmeal with banana and milk', meals: ['breakfast'], prep: 10, desc: 'Warm oats cooked in milk, topped with banana.',
    steps: 'Cook oats in milk for 5 minutes. Top with sliced banana and a little honey.',
    items: [['usda:173904', 50], ['usda:170870', 200], ['usda:173944', 100], ['usda:169640', 8]] },
  { name: 'Overnight oats with soy milk', meals: ['breakfast'], prep: 5, desc: 'Vegan overnight oats with strawberries.',
    steps: 'Mix oats and soy milk, refrigerate overnight, top with strawberries.',
    items: [['usda:173904', 50], ['usda:172446', 200], ['usda:167762', 80]] },
  { name: 'Greek yogurt parfait', meals: ['breakfast', 'snack'], prep: 5, desc: 'Yogurt layered with granola and blueberries.',
    steps: 'Layer yogurt, granola and blueberries in a glass. Drizzle honey.',
    items: [['usda:170894', 170], ['usda:171646', 35], ['usda:171711', 70], ['usda:169640', 8]] },
  { name: 'Scrambled eggs on whole-wheat toast', meals: ['breakfast'], prep: 10, desc: 'Soft eggs with spinach on toast.',
    steps: 'Scramble eggs in a little butter with spinach. Serve on toasted bread.',
    items: [['usda:171287', 100], ['usda:172688', 60], ['usda:173410', 5], ['usda:168462', 30]] },
  { name: 'Peanut butter banana toast', meals: ['breakfast', 'snack'], prep: 5, desc: 'Whole-wheat toast with peanut butter and banana.',
    steps: 'Toast the bread, spread peanut butter, add banana slices.',
    items: [['usda:172688', 60], ['usda:172470', 25], ['usda:173944', 100]] },
  { name: 'Avocado toast with egg', meals: ['breakfast'], prep: 10, desc: 'Smashed avocado and a boiled egg on toast.',
    steps: 'Mash avocado with salt and pepper, spread on toast, top with sliced egg.',
    items: [['usda:172688', 60], ['usda:171705', 60], ['usda:173424', 50], ['usda:170457', 40]] },
  { name: 'Grilled chicken salad', meals: ['lunch', 'dinner'], prep: 20, desc: 'Chicken breast on greens with avocado and olive oil.',
    steps: 'Grill the chicken, slice it, toss with lettuce, tomato, cucumber, avocado and olive oil.',
    items: [['usda:171477', 120], ['usda:169247', 100], ['usda:170457', 80], ['usda:168409', 80], ['usda:171705', 50], ['usda:171413', 10], ['usda:172688', 40]] },
  { name: 'Salmon with rice and broccoli', meals: ['lunch', 'dinner'], prep: 25, desc: 'Oven-baked salmon, rice and steamed broccoli.',
    steps: 'Bake salmon at 200 C for 12 minutes. Serve with rice and steamed broccoli.',
    items: [['usda:175168', 130], ['usda:168878', 150], ['usda:169967', 100]] },
  { name: 'Spaghetti bolognese', meals: ['lunch', 'dinner'], prep: 30, desc: 'Pasta with lean beef tomato sauce.',
    steps: 'Brown the beef with onion, add pasta sauce, simmer 10 minutes, serve over pasta.',
    items: [['usda:169737', 200], ['usda:174031', 90], ['usda:171192', 120], ['usda:170000', 30]] },
  { name: 'Chickpea quinoa bowl', meals: ['lunch', 'dinner'], prep: 20, desc: 'Vegan bowl with quinoa, chickpeas and vegetables.',
    steps: 'Cook quinoa. Top with chickpeas, spinach, tomato and red pepper. Dress with olive oil.',
    items: [['usda:168917', 150], ['usda:173757', 100], ['usda:168462', 40], ['usda:170457', 60], ['usda:170108', 60], ['usda:171413', 10]] },
  { name: 'Lentil coconut curry with brown rice', meals: ['lunch', 'dinner'], prep: 35, desc: 'Vegan red lentil curry.',
    steps: 'Cook onion and garlic, add tomato, lentils and coconut milk, simmer 15 minutes. Serve with brown rice.',
    items: [['usda:172421', 180], ['usda:170172', 50], ['usda:170000', 40], ['usda:170457', 80], ['usda:169230', 5], ['usda:169704', 150]] },
  { name: 'Tofu vegetable stir-fry with rice', meals: ['lunch', 'dinner'], prep: 20, desc: 'Vegan stir-fry with firm tofu.',
    steps: 'Fry tofu cubes, add vegetables and stir-fry 5 minutes. Serve with rice.',
    items: [['usda:172448', 150], ['usda:169967', 80], ['usda:170393', 50], ['usda:170108', 50], ['usda:169251', 50], ['usda:171413', 10], ['usda:168878', 150]] },
  { name: 'Tuna sandwich', meals: ['lunch'], prep: 10, desc: 'Whole-wheat tuna sandwich with salad.',
    steps: 'Mix tuna with a little olive oil and pepper, fill bread with tuna, lettuce and tomato.',
    items: [['usda:172688', 70], ['usda:171986', 80], ['usda:169247', 20], ['usda:170457', 40], ['usda:171413', 5]] },
  { name: 'Chicken burrito bowl', meals: ['lunch', 'dinner'], prep: 25, desc: 'Rice, chicken, beans, corn and avocado.',
    steps: 'Arrange rice, sliced chicken, beans, corn, tomato and avocado in a bowl. Top with cheese.',
    items: [['usda:171477', 110], ['usda:168878', 150], ['usda:175194', 80], ['usda:169999', 60], ['usda:170457', 60], ['usda:171705', 40], ['usda:170899', 15]] },
  { name: 'Shrimp vegetable noodles', meals: ['lunch', 'dinner'], prep: 20, desc: 'Egg noodles stir-fried with shrimp and vegetables.',
    steps: 'Stir-fry shrimp, cabbage and carrot, add cooked noodles and toss.',
    items: [['usda:168919', 180], ['usda:171970', 100], ['usda:169975', 60], ['usda:170393', 40], ['usda:171413', 8]] },
  { name: 'Yogurt with mango', meals: ['snack'], prep: 3, desc: 'Greek yogurt topped with fresh mango.',
    steps: 'Dice the mango and add it to the yogurt.',
    items: [['usda:170894', 150], ['usda:169910', 100]] },
  { name: 'Apple with peanut butter', meals: ['snack'], prep: 3, desc: 'Apple slices with peanut butter dip.',
    steps: 'Slice the apple and serve with peanut butter.',
    items: [['usda:171688', 150], ['usda:172470', 20]] },
];

// Resolve 'usda:123' / 'id:Name' to foods.id
async function resolveFood(c, ref) {
  const [kind, value] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
  const { rows } = kind === 'usda'
    ? await c.query(`SELECT id FROM foods WHERE source = 'usda' AND source_ref = $1`, [value])
    : await c.query(`SELECT id FROM foods WHERE source = 'estimate' AND name = $1`, [value]);
  if (!rows[0]) throw new Error(`Food not found for recipe ingredient ${ref} (did you run the USDA import?)`);
  return rows[0].id;
}

async function main() {
  await withTransaction(async (c) => {
    // Public recipes (skip the ones that already exist, so it is safe to re-run)
    let created = 0;
    for (const r of RECIPES) {
      const exists = await c.query('SELECT 1 FROM recipes WHERE name = $1 AND created_by_user_id IS NULL', [r.name]);
      if (exists.rowCount) continue;
      const { rows } = await c.query(
        `INSERT INTO recipes (name, description, instructions, servings, prep_minutes)
         VALUES ($1, $2, $3, 1, $4) RETURNING id`, [r.name, r.desc, r.steps, r.prep]);
      for (const [ref, grams] of r.items) {
        await c.query('INSERT INTO recipe_ingredients VALUES ($1, $2, $3)', [rows[0].id, await resolveFood(c, ref), grams]);
      }
      for (const m of r.meals) await c.query('INSERT INTO recipe_meal_types VALUES ($1, $2)', [rows[0].id, m]);
      created++;
    }
    console.log(`recipes created: ${created} (total defined: ${RECIPES.length})`);

    // The old shared demo account was replaced by "Continue as guest". Remove it if it still exists.
    const old = await c.query(`DELETE FROM users WHERE email = 'demo@viemeal.com'`);
    if (old.rowCount) console.log('removed the old demo account');
  });
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
