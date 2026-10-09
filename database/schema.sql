-- =====================================================================
-- VieMeal database schema (PostgreSQL 14+)
-- Normalized to 3NF: every non-key column depends only on its table's key.
-- Run order: schema.sql -> seed_base.sql -> seed_indonesian.sql
--            -> importUsda.js -> seedRecipes.js   (or just: npm run db:setup)
-- =====================================================================

-- Start clean so the script can be re-run during development.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- pg_trgm gives us "similarity" search: "rendang" still finds "Rendang daging"
-- and typos like "rendnag" still match. Used by the GIN index on foods.name.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------
-- Users and profiles
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL CHECK (length(trim(full_name)) > 0),
  -- Emails are stored lowercase so "A@x.com" and "a@x.com" are the same user.
  email         VARCHAR(255) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash VARCHAR(100) NOT NULL,
  -- Guest = temporary sandbox account (no real email, cannot log in with a
  -- password, no AI). Guests older than 24 hours are cleaned on next guest start.
  is_guest      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One-to-one with users (user_id is both PK and FK).
-- Kept separate so a user can exist before finishing onboarding.
CREATE TABLE user_profiles (
  user_id        INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sex            VARCHAR(6)  NOT NULL CHECK (sex IN ('male', 'female')),
  birth_date     DATE        NOT NULL CHECK (birth_date > DATE '1900-01-01'),
  height_cm      NUMERIC(5,1) NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
  activity_level VARCHAR(12) NOT NULL DEFAULT 'light'
                 CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  goal           VARCHAR(8)  NOT NULL DEFAULT 'maintain'
                 CHECK (goal IN ('lose','maintain','gain')),
  diet_type      VARCHAR(12) NOT NULL DEFAULT 'any'
                 CHECK (diet_type IN ('any','vegetarian','vegan','pescatarian','halal')),
  meals_per_day  SMALLINT    NOT NULL DEFAULT 3 CHECK (meals_per_day BETWEEN 3 AND 5),
  bmi_standard   VARCHAR(5)  NOT NULL DEFAULT 'asian' CHECK (bmi_standard IN ('who','asian')),
  -- Macro split in % of calories. Ranges follow common dietary guidelines
  -- (AMDR-style), and the three must add up to 100.
  protein_pct    SMALLINT    NOT NULL DEFAULT 25 CHECK (protein_pct BETWEEN 10 AND 35),
  carbs_pct      SMALLINT    NOT NULL DEFAULT 50 CHECK (carbs_pct BETWEEN 40 AND 65),
  fat_pct        SMALLINT    NOT NULL DEFAULT 25 CHECK (fat_pct BETWEEN 20 AND 35),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT macro_pct_sum CHECK (protein_pct + carbs_pct + fat_pct = 100)
);

CREATE TABLE weight_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg  NUMERIC(5,1) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  logged_on  DATE         NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- One weight per user per day (a second entry the same day updates it).
  UNIQUE (user_id, logged_on)
);

-- ---------------------------------------------------------------------
-- Foods
-- ---------------------------------------------------------------------
CREATE TABLE food_categories (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE foods (
  id                 SERIAL PRIMARY KEY,
  name               VARCHAR(255) NOT NULL,
  category_id        INT REFERENCES food_categories(id),
  source             VARCHAR(15)  NOT NULL
                     CHECK (source IN ('usda','estimate','custom','openfoodfacts')),
  source_ref         VARCHAR(50),               -- e.g. USDA fdc_id or barcode
  created_by_user_id INT REFERENCES users(id) ON DELETE CASCADE, -- only for custom foods
  -- All nutrient values are per 100 g of food.
  calories_kcal NUMERIC(7,2) NOT NULL CHECK (calories_kcal >= 0),
  protein_g     NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g       NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g         NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  fiber_g       NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (fiber_g >= 0),
  sugar_g       NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (sugar_g >= 0),
  sodium_mg     NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (sodium_mg >= 0),
  -- NULL means "unknown". The diet filter treats unknown as "not allowed"
  -- for vegetarian/vegan, and as "allowed" for halal (only known non-halal is hidden).
  is_vegetarian BOOLEAN,
  is_vegan      BOOLEAN,
  is_halal      BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Custom foods must have an owner; other sources must not.
  CONSTRAINT custom_food_owner CHECK ((source = 'custom') = (created_by_user_id IS NOT NULL)),
  -- A vegan food is always vegetarian.
  CONSTRAINT vegan_is_vegetarian CHECK (NOT (is_vegan IS TRUE AND is_vegetarian IS FALSE)),
  -- The same external record (USDA id / barcode) is imported only once.
  UNIQUE (source, source_ref)
);

-- Typical household servings, e.g. "1 piring" = 250 g.
CREATE TABLE food_servings (
  id          SERIAL PRIMARY KEY,
  food_id     INT          NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  description VARCHAR(120) NOT NULL,
  grams       NUMERIC(7,1) NOT NULL CHECK (grams > 0),
  UNIQUE (food_id, description)
);

CREATE TABLE allergens (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE food_allergens (
  food_id     INT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  allergen_id INT NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
  PRIMARY KEY (food_id, allergen_id)
);

CREATE TABLE user_allergens (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allergen_id INT NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, allergen_id)
);

CREATE TABLE user_disliked_foods (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_id INT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, food_id)
);

CREATE TABLE user_favorite_foods (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_id INT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, food_id)
);

-- ---------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------
CREATE TABLE recipes (
  id                 SERIAL PRIMARY KEY,
  name               VARCHAR(150) NOT NULL,
  description        TEXT,
  instructions       TEXT,
  servings           SMALLINT NOT NULL DEFAULT 1 CHECK (servings BETWEEN 1 AND 50),
  prep_minutes       SMALLINT CHECK (prep_minutes BETWEEN 0 AND 1440),
  created_by_user_id INT REFERENCES users(id) ON DELETE CASCADE, -- NULL = public recipe
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_ingredients (
  recipe_id INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_id   INT NOT NULL REFERENCES foods(id),
  grams     NUMERIC(7,1) NOT NULL CHECK (grams > 0),
  PRIMARY KEY (recipe_id, food_id)
);

-- Which meals a food / recipe is suitable for (used by the meal planner so it
-- does not suggest "wheat flour" for lunch). A junction table instead of an
-- array column keeps the design in 1NF.
CREATE TABLE food_meal_types (
  food_id   INT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  meal_type VARCHAR(10) NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  PRIMARY KEY (food_id, meal_type)
);

CREATE TABLE recipe_meal_types (
  recipe_id INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  meal_type VARCHAR(10) NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  PRIMARY KEY (recipe_id, meal_type)
);

-- ---------------------------------------------------------------------
-- Meal plans
-- ---------------------------------------------------------------------
CREATE TABLE meal_plans (
  id              SERIAL PRIMARY KEY,
  user_id         INT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date      DATE     NOT NULL,
  days            SMALLINT NOT NULL CHECK (days IN (1, 7)),
  target_calories INT      NOT NULL CHECK (target_calories BETWEEN 1000 AND 6000),
  created_by      VARCHAR(10) NOT NULL CHECK (created_by IN ('algorithm','ai')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meal_plan_items (
  id           SERIAL PRIMARY KEY,
  meal_plan_id INT  NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  plan_date    DATE NOT NULL,
  slot_no      SMALLINT NOT NULL CHECK (slot_no BETWEEN 1 AND 5), -- position in the day
  meal_type    VARCHAR(10) NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  food_id      INT REFERENCES foods(id),
  recipe_id    INT REFERENCES recipes(id),
  grams        NUMERIC(7,1) NOT NULL CHECK (grams > 0),
  is_locked    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Exactly one of food_id / recipe_id must be set.
  -- (A slot can hold several items: AI meals like "rice + chicken + vegetables".)
  CONSTRAINT plan_item_one_source CHECK (num_nonnulls(food_id, recipe_id) = 1)
);

-- ---------------------------------------------------------------------
-- Daily logs
-- ---------------------------------------------------------------------
CREATE TABLE food_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type  VARCHAR(10) NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  food_id    INT REFERENCES foods(id),
  recipe_id  INT REFERENCES recipes(id),
  grams      NUMERIC(7,1) NOT NULL CHECK (grams > 0 AND grams <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT food_log_one_source CHECK (num_nonnulls(food_id, recipe_id) = 1)
);

CREATE TABLE water_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml  INT  NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Indexes
-- (PostgreSQL indexes primary keys and UNIQUE columns automatically, but
--  NOT foreign keys, so we add the ones we join or filter on.)
-- =====================================================================

-- Trigram GIN index: makes "name ILIKE '%goreng%'" and similarity() search fast
-- and typo-tolerant across ~8,000 foods.
CREATE INDEX idx_foods_name_trgm ON foods USING GIN (name gin_trgm_ops);
-- Category filter chips on the search page.
CREATE INDEX idx_foods_category ON foods (category_id);
-- Finding a user's custom foods (only exists for custom rows, so partial index).
CREATE INDEX idx_foods_created_by ON foods (created_by_user_id) WHERE created_by_user_id IS NOT NULL;
-- Food detail page loads its servings.
CREATE INDEX idx_food_servings_food ON food_servings (food_id);
-- The diet filter checks "does this allergen appear in this food?" (PK covers food_id first,
-- this one covers lookups by allergen).
CREATE INDEX idx_food_allergens_allergen ON food_allergens (allergen_id);
-- Recipe nutrition view joins ingredients to foods.
CREATE INDEX idx_recipe_ingredients_food ON recipe_ingredients (food_id);
CREATE INDEX idx_recipes_created_by ON recipes (created_by_user_id);
-- Planner looks up candidates by meal type.
CREATE INDEX idx_food_meal_types_type ON food_meal_types (meal_type);
CREATE INDEX idx_recipe_meal_types_type ON recipe_meal_types (meal_type);
-- "Current plan" = newest plan of the user.
CREATE INDEX idx_meal_plans_user ON meal_plans (user_id, created_at DESC);
-- Loading the items of one plan, ordered by day and slot.
CREATE INDEX idx_meal_plan_items_plan ON meal_plan_items (meal_plan_id, plan_date, slot_no);
CREATE INDEX idx_meal_plan_items_food ON meal_plan_items (food_id);
CREATE INDEX idx_meal_plan_items_recipe ON meal_plan_items (recipe_id);
-- Diary and dashboard: "all logs of user X on day Y" / date ranges.
CREATE INDEX idx_food_logs_user_day ON food_logs (user_id, logged_on);
CREATE INDEX idx_water_logs_user_day ON water_logs (user_id, logged_on);
-- (weight_logs already has UNIQUE (user_id, logged_on), which is an index.)
-- Joins from logs back to foods/recipes.
CREATE INDEX idx_food_logs_food ON food_logs (food_id);
CREATE INDEX idx_food_logs_recipe ON food_logs (recipe_id);

-- =====================================================================
-- Views
-- =====================================================================

-- Nutrition of each recipe, calculated from its ingredients:
--   nutrient of an ingredient = nutrient per 100 g x grams / 100
-- We expose totals, per serving, and per 100 g (needed when a user eats
-- "350 g of this recipe").
CREATE VIEW recipe_nutrition AS
SELECT
  r.id                                           AS recipe_id,
  r.name,
  r.servings,
  SUM(ri.grams)                                  AS total_grams,
  ROUND(SUM(f.calories_kcal * ri.grams / 100), 1) AS calories_kcal,
  ROUND(SUM(f.protein_g     * ri.grams / 100), 1) AS protein_g,
  ROUND(SUM(f.carbs_g       * ri.grams / 100), 1) AS carbs_g,
  ROUND(SUM(f.fat_g         * ri.grams / 100), 1) AS fat_g,
  ROUND(SUM(f.fiber_g       * ri.grams / 100), 1) AS fiber_g,
  ROUND(SUM(f.sugar_g       * ri.grams / 100), 1) AS sugar_g,
  ROUND(SUM(f.sodium_mg     * ri.grams / 100), 1) AS sodium_mg,
  -- per serving
  ROUND(SUM(f.calories_kcal * ri.grams / 100) / r.servings, 1) AS serving_calories_kcal,
  ROUND(SUM(f.protein_g     * ri.grams / 100) / r.servings, 1) AS serving_protein_g,
  ROUND(SUM(f.carbs_g       * ri.grams / 100) / r.servings, 1) AS serving_carbs_g,
  ROUND(SUM(f.fat_g         * ri.grams / 100) / r.servings, 1) AS serving_fat_g,
  ROUND(SUM(ri.grams) / r.servings, 1)                         AS serving_grams,
  -- per 100 g of the finished recipe (same shape as the foods table)
  SUM(f.calories_kcal * ri.grams) / SUM(ri.grams) AS calories_per_100g,
  SUM(f.protein_g     * ri.grams) / SUM(ri.grams) AS protein_per_100g,
  SUM(f.carbs_g       * ri.grams) / SUM(ri.grams) AS carbs_per_100g,
  SUM(f.fat_g         * ri.grams) / SUM(ri.grams) AS fat_per_100g,
  SUM(f.fiber_g       * ri.grams) / SUM(ri.grams) AS fiber_per_100g,
  SUM(f.sugar_g       * ri.grams) / SUM(ri.grams) AS sugar_per_100g,
  SUM(f.sodium_mg     * ri.grams) / SUM(ri.grams) AS sodium_per_100g
FROM recipes r
JOIN recipe_ingredients ri ON ri.recipe_id = r.id
JOIN foods f               ON f.id = ri.food_id
GROUP BY r.id, r.name, r.servings;

-- One row per log entry with its real nutrition. Works for both foods and
-- recipes: we take the per-100 g values from whichever one is set (COALESCE).
CREATE VIEW food_log_nutrition AS
SELECT
  l.id, l.user_id, l.logged_on, l.meal_type, l.food_id, l.recipe_id, l.grams, l.created_at,
  COALESCE(f.name, rn.name) AS item_name,
  ROUND(COALESCE(f.calories_kcal, rn.calories_per_100g) * l.grams / 100, 1) AS calories_kcal,
  ROUND(COALESCE(f.protein_g,     rn.protein_per_100g)  * l.grams / 100, 1) AS protein_g,
  ROUND(COALESCE(f.carbs_g,       rn.carbs_per_100g)    * l.grams / 100, 1) AS carbs_g,
  ROUND(COALESCE(f.fat_g,         rn.fat_per_100g)      * l.grams / 100, 1) AS fat_g,
  ROUND(COALESCE(f.fiber_g,       rn.fiber_per_100g)    * l.grams / 100, 1) AS fiber_g,
  ROUND(COALESCE(f.sodium_mg,     rn.sodium_per_100g)   * l.grams / 100, 1) AS sodium_mg
FROM food_logs l
LEFT JOIN foods f             ON f.id = l.food_id
LEFT JOIN recipe_nutrition rn ON rn.recipe_id = l.recipe_id;

-- Totals per user per day (dashboard, diary, progress page).
CREATE VIEW daily_nutrition_summary AS
SELECT
  user_id,
  logged_on,
  ROUND(SUM(calories_kcal), 0) AS calories_kcal,
  ROUND(SUM(protein_g), 1)     AS protein_g,
  ROUND(SUM(carbs_g), 1)       AS carbs_g,
  ROUND(SUM(fat_g), 1)         AS fat_g,
  ROUND(SUM(fiber_g), 1)       AS fiber_g,
  ROUND(SUM(sodium_mg), 0)     AS sodium_mg,
  COUNT(*)                     AS entries
FROM food_log_nutrition
GROUP BY user_id, logged_on;

-- =====================================================================
-- Shared filter functions (used by food search AND the meal planner)
-- =====================================================================

-- Returns the foods a user may eat: visible to them (public or their own
-- custom food), matching their diet type, free of their allergens, and not
-- on their dislike list.
CREATE FUNCTION user_allowed_foods(p_user_id INT)
RETURNS SETOF foods
LANGUAGE sql STABLE AS $$
  SELECT f.*
  FROM foods f
  LEFT JOIN food_categories c ON c.id = f.category_id
  LEFT JOIN user_profiles p   ON p.user_id = p_user_id
  WHERE (f.created_by_user_id IS NULL OR f.created_by_user_id = p_user_id)
    -- Diet type. COALESCE(..., FALSE) = unknown counts as "not allowed".
    AND CASE COALESCE(p.diet_type, 'any')
          WHEN 'any'         THEN TRUE
          WHEN 'vegetarian'  THEN COALESCE(f.is_vegetarian, FALSE)
          WHEN 'vegan'       THEN COALESCE(f.is_vegan, FALSE)
          WHEN 'pescatarian' THEN COALESCE(f.is_vegetarian, FALSE) OR c.name = 'fish'
          WHEN 'halal'       THEN f.is_halal IS NOT FALSE
        END
    -- No allergen of this food is in the user's allergen list.
    AND NOT EXISTS (
      SELECT 1 FROM food_allergens fa
      JOIN user_allergens ua ON ua.allergen_id = fa.allergen_id
      WHERE fa.food_id = f.id AND ua.user_id = p_user_id)
    -- Not disliked.
    AND NOT EXISTS (
      SELECT 1 FROM user_disliked_foods d
      WHERE d.food_id = f.id AND d.user_id = p_user_id)
$$;

-- A recipe is allowed when EVERY ingredient is an allowed food.
CREATE FUNCTION user_allowed_recipes(p_user_id INT)
RETURNS SETOF recipes
LANGUAGE sql STABLE AS $$
  SELECT r.*
  FROM recipes r
  WHERE (r.created_by_user_id IS NULL OR r.created_by_user_id = p_user_id)
    AND EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = r.id)
    AND NOT EXISTS (
      SELECT 1 FROM recipe_ingredients ri
      WHERE ri.recipe_id = r.id
        AND ri.food_id NOT IN (SELECT id FROM user_allowed_foods(p_user_id)))
$$;
