# VieMeal - AI Meal Planner

**Live demo: https://viemeal.vercel.app** (click "Continue as guest" — no sign-up needed)

**Track what you eat, reach your nutrition targets, and get meal plans that fit your diet, allergies and goals. Works on phones (installable PWA) and on desktop.**

> Screenshots
>
> | Mobile | Desktop |
> | --- | --- |
> | ![Mobile screenshot](docs/screenshot-mobile.png) | ![Desktop screenshot](docs/screenshot-desktop.png) |
>
> *(placeholders: add your own screenshots to `docs/`)*

---

## Features

- **BMI, calorie and macro targets** for each user (Mifflin-St Jeor, activity factor, goal), with WHO or Asian BMI standard and an ideal weight range
- **Food database with ~7,900 foods**: USDA SR Legacy (7,793 foods) plus 84 common Indonesian dishes and ingredients (marked *estimated values*)
- **Typo-tolerant food search** (PostgreSQL `pg_trgm`), category chips, diet / allergen filtering with a "show all" option
- **Food detail**: nutrition per 100 g and per serving ("1 piring", "1 tusuk"...), grams calculator, macro pie chart, allergen tags, favorite / dislike
- **Custom foods** (private to the user) and **barcode lookup** via Open Food Facts
- **Food diary** with daily totals vs targets, edit and delete entries
- **Home dashboard**: calorie ring, macro bars, water tracker (+250 ml), today's planned meals with "Log this", BMI card
- **Rule-based meal planner** (1 or 7 days): swap, lock, "Log this day", shopping list grouped by category
- **Recipes**: 32 public recipes, detail with calculated nutrition, create your own
- **Progress**: weight chart, BMI trend, calories per day, 7 and 30 day averages
- **AI assistant (optional)**: nutrition chat, "Generate with AI" plans, "Why this meal?"
- **Safety rules**: minimum calorie targets, no weight-loss goal when underweight, supportive language, disclaimer
- **PWA**: installable, app icon, offline app shell; **dark mode**; responsive from 360 px to large screens

## Tech stack

| Part | Tools |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, react-router-dom, recharts, lucide-react, vite-plugin-pwa |
| Backend | Node.js, Express, `pg` (raw parameterized SQL, **no ORM**), bcryptjs, jsonwebtoken, dotenv |
| Database | PostgreSQL 14+ with `pg_trgm` |
| AI (optional) | Google Gemini, OpenAI or Anthropic Claude (one provider, chosen in `.env`, called only from the backend) |
| Tests | Vitest |

## Project structure

```
viemeal/
├── client/              React app (Vite + Tailwind + PWA)
│   └── src/pages/       one file per page
├── server/
│   ├── src/routes/      Express routes (auth, profile, foods, recipes, logs, meal-plans, ai, tools)
│   ├── src/services/    mealPlanner.js (recommendation algorithm), aiClient.js, profileService.js
│   ├── src/utils/       nutrition.js (all formulas), http.js (validation helpers, requireAuth)
│   ├── scripts/         runSql.js, importUsda.js, seedRecipes.js
│   └── tests/           nutrition.test.js, mealPlanner.test.js
├── database/            schema.sql, seed_base.sql, seed_indonesian.sql
├── data/usda/           USDA CSV files (you download these)
├── docker-compose.yml   PostgreSQL in Docker
└── start.bat            Windows: start DB + API + web app with a double-click
```

---

## Database design

The schema (`database/schema.sql`) is normalized to **3NF**: every non-key column depends only on the key of its own table. Things that have many values (allergens of a food, meal types of a recipe, favorites) live in junction tables instead of arrays or comma lists.

Constraints do a lot of the validation work:

- `CHECK` on every enum-like column (`sex`, `goal`, `diet_type`, `meal_type`, `source`...) and on numbers (`grams > 0`, nutrients `>= 0`, macro percentages add up to 100)
- `CHECK (num_nonnulls(food_id, recipe_id) = 1)` on `food_logs` and `meal_plan_items`: each row points to **exactly one** food or recipe
- `CHECK ((source = 'custom') = (created_by_user_id IS NOT NULL))`: only custom foods have an owner
- `UNIQUE (user_id, logged_on)` on weight logs (one weight per day), `UNIQUE (source, source_ref)` on foods (import runs are safe to repeat)
- Emails stored lowercase (`CHECK (email = lower(email))` + `UNIQUE`)

```mermaid
erDiagram
    users ||--o| user_profiles : has
    users ||--o{ weight_logs : logs
    users ||--o{ food_logs : logs
    users ||--o{ water_logs : logs
    users ||--o{ meal_plans : owns
    users ||--o{ user_allergens : avoids
    users ||--o{ user_disliked_foods : dislikes
    users ||--o{ user_favorite_foods : likes
    users ||--o{ foods : "creates (custom)"
    users ||--o{ recipes : "creates (private)"
    allergens ||--o{ user_allergens : ""
    allergens ||--o{ food_allergens : ""
    food_categories ||--o{ foods : groups
    foods ||--o{ food_servings : "has servings"
    foods ||--o{ food_allergens : contains
    foods ||--o{ food_meal_types : "suits"
    foods ||--o{ user_disliked_foods : ""
    foods ||--o{ user_favorite_foods : ""
    foods ||--o{ recipe_ingredients : "used in"
    recipes ||--o{ recipe_ingredients : has
    recipes ||--o{ recipe_meal_types : "suits"
    meal_plans ||--o{ meal_plan_items : contains
    foods ||--o{ meal_plan_items : ""
    recipes ||--o{ meal_plan_items : ""
    foods ||--o{ food_logs : ""
    recipes ||--o{ food_logs : ""

    users {
        int id PK
        varchar full_name
        varchar email UK "lowercase"
        varchar password_hash
        timestamptz created_at
    }
    user_profiles {
        int user_id PK,FK
        varchar sex "male|female"
        date birth_date
        numeric height_cm
        varchar activity_level
        varchar goal "lose|maintain|gain"
        varchar diet_type
        smallint meals_per_day "3-5"
        varchar bmi_standard "who|asian"
        smallint protein_pct
        smallint carbs_pct
        smallint fat_pct
        timestamptz updated_at
    }
    weight_logs {
        int id PK
        int user_id FK
        numeric weight_kg
        date logged_on "UNIQUE with user_id"
    }
    food_categories {
        int id PK
        varchar name UK
    }
    foods {
        int id PK
        varchar name "GIN trigram index"
        int category_id FK
        varchar source "usda|estimate|custom|openfoodfacts"
        varchar source_ref
        int created_by_user_id FK "custom only"
        numeric calories_kcal "per 100 g"
        numeric protein_g
        numeric carbs_g
        numeric fat_g
        numeric fiber_g
        numeric sugar_g
        numeric sodium_mg
        bool is_vegetarian
        bool is_vegan
        bool is_halal
    }
    food_servings {
        int id PK
        int food_id FK
        varchar description "1 piring"
        numeric grams
    }
    allergens {
        int id PK
        varchar name UK
    }
    food_allergens {
        int food_id PK,FK
        int allergen_id PK,FK
    }
    user_allergens {
        int user_id PK,FK
        int allergen_id PK,FK
    }
    user_disliked_foods {
        int user_id PK,FK
        int food_id PK,FK
    }
    user_favorite_foods {
        int user_id PK,FK
        int food_id PK,FK
    }
    food_meal_types {
        int food_id PK,FK
        varchar meal_type PK
    }
    recipes {
        int id PK
        varchar name
        text description
        text instructions
        smallint servings
        smallint prep_minutes
        int created_by_user_id FK "NULL = public"
    }
    recipe_ingredients {
        int recipe_id PK,FK
        int food_id PK,FK
        numeric grams
    }
    recipe_meal_types {
        int recipe_id PK,FK
        varchar meal_type PK
    }
    meal_plans {
        int id PK
        int user_id FK
        date start_date
        smallint days "1 or 7"
        int target_calories
        varchar created_by "algorithm|ai"
    }
    meal_plan_items {
        int id PK
        int meal_plan_id FK
        date plan_date
        smallint slot_no
        varchar meal_type
        int food_id FK "exactly one of"
        int recipe_id FK "food_id / recipe_id"
        numeric grams
        bool is_locked
    }
    food_logs {
        int id PK
        int user_id FK
        date logged_on
        varchar meal_type
        int food_id FK "exactly one of"
        int recipe_id FK "food_id / recipe_id"
        numeric grams
    }
    water_logs {
        int id PK
        int user_id FK
        date logged_on
        int amount_ml
    }
```

Two small extra tables beyond the original plan: `food_meal_types` and `recipe_meal_types` say which meals a food or recipe suits, so the planner does not suggest "wheat flour" for lunch.

### Views and functions

| Object | What it does |
| --- | --- |
| `recipe_nutrition` (view) | Total and per-serving nutrition of every recipe: `SUM(nutrient_per_100g * grams / 100)` over its ingredients, plus per-100 g values so a recipe can be logged by grams |
| `food_log_nutrition` (view) | Every diary entry with its real calories and macros (works for foods *and* recipes) |
| `daily_nutrition_summary` (view) | Per user per day: calories, protein, carbs, fat, fiber, sodium |
| `user_allowed_foods(user_id)` (function) | Foods that pass the user's diet type, allergens and dislikes. **Reused by search and the planner**, so both always follow the same rules |
| `user_allowed_recipes(user_id)` (function) | Same idea for recipes: a recipe is allowed only if *every* ingredient is allowed |

### Indexes (and why)

- `GIN (name gin_trgm_ops)` on `foods`: fast `ILIKE '%...%'` and similarity search on ~8,000 names
- `(user_id, logged_on)` on `food_logs` and `water_logs`: the diary and dashboard always ask "this user, this day"
- `(user_id, created_at DESC)` on `meal_plans`: "latest plan of this user"
- `(meal_plan_id, plan_date, slot_no)` on `meal_plan_items`: load a plan in display order
- Plain indexes on foreign keys used in joins (`foods.category_id`, `food_servings.food_id`, `recipe_ingredients.food_id`, ...)

Each index has a comment in `schema.sql` explaining its purpose.

---

## How nutrition is calculated

All formulas live in `server/src/utils/nutrition.js` and are covered by unit tests.

| Value | Formula |
| --- | --- |
| Age | Full years since `birth_date` |
| BMI | `weight_kg / (height_m)^2`, rounded to 1 decimal |
| BMI category (WHO) | underweight < 18.5, normal 18.5-24.9, overweight 25-29.9, obese >= 30 |
| BMI category (Asian / WHO Asia-Pacific, default) | underweight < 18.5, normal 18.5-22.9, overweight 23-24.9, obese >= 25 |
| BMR (Mifflin-St Jeor) | male: `10 x kg + 6.25 x cm - 5 x age + 5`<br>female: `10 x kg + 6.25 x cm - 5 x age - 161` |
| TDEE | `BMR x activity factor` (sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very active 1.9) |
| Calorie target | lose: `TDEE - 500`, maintain: `TDEE`, gain: `TDEE + 300` |
| Safety minimum | never below **1500 kcal (male)** / **1200 kcal (female)**; if the formula goes lower, the minimum is used and a note is shown |
| Macros | default 25% protein, 50% carbs, 25% fat; protein and carbs 4 kcal/g, fat 9 kcal/g. Users can adjust within protein 10-35%, carbs 40-65%, fat 20-35% |
| Water | about 35 ml per kg body weight |
| Ideal weight range | the weights that give a "normal" BMI for the user's height (standard-dependent) |
| Food / recipe portion | `nutrient_per_100g x grams / 100` |

Why the Asian standard? Research for Asian populations shows health risks starting at a lower BMI, so the WHO Asia-Pacific cut-offs are lower. The user can switch to WHO in their profile; a tooltip explains this.

### Why the AI never invents nutrition numbers

Language models are good at ideas ("try tempe with vegetables") but bad at exact numbers: they can confidently state wrong calories. So in VieMeal:

1. **Every number on screen comes from the database.** The AI is never asked for calories or macros.
2. When the AI suggests a meal plan, it must return strict JSON like `{"meal_type": "lunch", "foods": [{"name": "nasi putih", "grams": 150}]}`.
3. The backend **validates** the JSON, then **matches** each food name to a database row with trigram search (`ILIKE` or `word_similarity >= 0.45`).
4. Foods that do not match, or that conflict with the user's diet or allergens (checked with `user_allowed_foods`), are **removed**.
5. Portions are adjusted and the **real nutrition is calculated from the database**, then the plan is saved with `created_by = 'ai'`.
6. If the AI fails or returns unusable data, the **rule-based planner** makes the plan instead and the user is told.

This keeps the app honest and testable, and it means the app works fully without any AI key.

---

## How the meal planner works (simple words)

The planner is in `server/src/services/mealPlanner.js` and every step is commented. It does not need AI.

1. **Split the day.** The calorie target is divided between meals: 3 meals = breakfast 30%, lunch 40%, dinner 30%. With 4 or 5 meals, each snack gets about 10% and the main meals share the rest.
2. **Find candidates.** For each meal, it loads recipes and foods that the user is allowed to eat (diet, allergens, dislikes), using the same SQL function as search, and that suit that meal type.
3. **Scale the portion.** Each candidate gets the number of grams that hits the meal's calorie budget, kept within realistic limits (recipes 0.6x to 1.5x of one serving and at most 600 g; single foods between half and 2.5 servings, max 500 g).
4. **Score.** Every candidate gets points for being close to the meal's protein target, a bonus if it is a favorite, a penalty if it was used in the last 3 days (variety), and a little randomness so plans are not always the same.
5. **Pick and check.** The best candidate wins each meal. Then the day's total is compared with the target: if it is not within **plus or minus 10%**, portions are adjusted.
6. **1 or 7 days, swap and lock.** "Swap" replaces a meal with the next best candidate. "Lock" keeps a meal when you regenerate the plan.

A test (`server/tests/mealPlanner.test.js`) checks that plans respect allergens and diet type and stay within +-10% of the calorie target.

---

## AI features (optional)

Set `AI_PROVIDER`, `AI_API_KEY` and `AI_MODEL` in `server/.env`. The key stays on the server; the browser never sees it.

- **Chat assistant**: the system prompt contains the user's goal, targets, diet and allergies, but **not** their name or email. The last 10 messages are sent for context.
- **Generate with AI**: see "Why the AI never invents nutrition numbers" above.
- **Why this meal?**: a 2-3 sentence explanation of how a planned meal fits the user's goals.
- **Safety rules in the system prompt**: no crash diets, no extreme restriction, no skipping meals, no targets below the safe minimum, refer to a professional for medical questions, supportive language.
- **Rate limit**: 20 AI requests per user per hour (configurable).
- **Without a key**: AI routes return a friendly "AI is not available" message (HTTP 503) and the UI hides or disables AI buttons. Everything else works.

---

## Data sources and credits

- **USDA FoodData Central, SR Legacy** (April 2018 release). U.S. Department of Agriculture, Agricultural Research Service. Public domain. <https://fdc.nal.usda.gov/>
- **Open Food Facts** for barcode lookup (Open Database License). <https://world.openfoodfacts.org/>
- **Indonesian foods** (`database/seed_indonesian.sql`): values are **estimates** per 100 g based on typical recipes and common Indonesian food composition references. They are marked `source = 'estimate'` and shown with an *estimated values* label in the app. Real dishes vary a lot between cooks.

## Health disclaimer

> For general information only, not medical advice. Consult a doctor or nutritionist for medical conditions, pregnancy, or eating concerns.

VieMeal is a student portfolio project. It is designed for adults (18+). It never sets calorie targets below 1500 kcal (male) / 1200 kcal (female) and does not offer a weight-loss goal to users whose BMI is in the underweight range.

---

## Setup

Requirements: **Node.js 18+** (tested with Node 24), **PostgreSQL 14+** (with the `pg_trgm` extension, included in standard installs) or Docker.

### 1. Database

**Option A: Docker**

```bash
docker compose up -d          # PostgreSQL 16 on localhost:5433, db "viemeal", user/pass postgres/postgres
```

**Option B: local PostgreSQL install**

1. Install PostgreSQL from <https://www.postgresql.org/download/>.
2. Create the database:
   ```bash
   psql -U postgres -c "CREATE DATABASE viemeal;"
   ```
3. Use your own port/password in `DATABASE_URL` (step 3). Default local installs use port 5432.

### 2. USDA data

1. Download **SR Legacy, CSV** from <https://fdc.nal.usda.gov/download-datasets> (file `FoodData_Central_sr_legacy_food_csv_2018-04.zip`).
2. Unzip the CSV files into `data/usda/` (you need `food.csv`, `nutrient.csv`, `food_nutrient.csv`, `food_category.csv`, `food_portion.csv`, `measure_unit.csv`).

### 3. Server

```bash
cd server
cp .env.example .env          # then edit .env (DATABASE_URL, JWT_SECRET, optional AI key)
npm install
npm run db:setup              # schema + seeds + USDA import + public recipes (about 1 minute)
npm start                     # API on http://localhost:4100
```

`npm run db:setup` runs, in order:

| Step | Command | What it does |
| --- | --- | --- |
| 1 | `npm run db:schema` | `schema.sql` (tables, views, functions, indexes), `seed_base.sql` (categories, allergens), `seed_indonesian.sql` |
| 2 | `npm run db:usda` | `scripts/importUsda.js`: imports ~7,800 USDA foods with nutrients per 100 g, categories and servings |
| 3 | `npm run db:recipes` | `scripts/seedRecipes.js`: public recipes; guest sample data is created when a guest starts a session |

> Warning: `db:schema` drops and recreates the `public` schema. It deletes all data in the `viemeal` database.

### 4. Client

```bash
cd client
npm install
npm run dev                   # http://localhost:5174 (also on your LAN, for testing on a phone)
npm run build                 # production build in client/dist (with service worker)
```

In development, Vite forwards `/api` to the Express server, so the browser only talks to one address.

On Windows you can also double-click **`start.bat`** to start the database (if `local-postgres/` exists), API and web app.

### 5. Tests

```bash
cd server
npm test                      # nutrition.js unit tests + meal planner tests
```

The meal planner database test is skipped automatically if PostgreSQL is not reachable.

### Environment variables (`server/.env`)

| Name | Example | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5433/viemeal` | PostgreSQL connection |
| `PORT` | `4100` | API port |
| `JWT_SECRET` | long random string | Signs login tokens |
| `CLIENT_ORIGIN` | `http://localhost:5174` | Allowed browser origin (CORS) |
| `AI_PROVIDER` | `gemini` / `openai` / `anthropic` | Which AI API to use |
| `AI_API_KEY` | *(empty)* | Leave empty to run without AI |
| `AI_MODEL` | `gemini-3.5-flash`, `gpt-4o-mini`, `claude-3-5-haiku-latest` | Model name |
| `AI_BASE_URL` | *(empty)* | Optional OpenAI-compatible base URL |
| `AI_RATE_LIMIT_PER_HOUR` | `20` | AI requests per user per hour |

### Deploy for free (Vercel + Neon)

The website and the API are deployed together on **Vercel** (free Hobby plan). The database is **Neon** (free PostgreSQL).

- `vercel.json` builds `client/` into static files and sends every `/api/...` request to `api/index.js`.
- `api/index.js` runs the same Express app as local development (`server/src/app.js`) as a serverless function.
- The app and API share one address, so no CORS setup is needed.

Steps:

1. Create a Neon project in the Singapore region (`pg_trgm` is supported).
2. Load the database from your PC: put the Neon connection string in `server/.env.neon`, then run `npm run db:setup` with that file:
   ```bash
   cd server
   DOTENV_CONFIG_PATH=.env.neon npm run db:setup
   ```
3. Push the project to GitHub (`.env` files are ignored by `.gitignore`).
4. In Vercel, import the GitHub repository. Leave the build settings as they are (`vercel.json` sets them).
5. Under **Environment Variables**, add `DATABASE_URL` (Neon pooled connection string), `JWT_SECRET`, and the optional `AI_*` values. `PORT` and `CLIENT_ORIGIN` are not needed on Vercel.
6. Deploy.

The API function may run for up to 60 seconds (`maxDuration` in `vercel.json`), which is enough for the AI replies.

---

## Guest mode

Click **Continue as guest** on the landing, login, or register page. VieMeal creates a private temporary account with blank personal settings and temporary sample history: 14 days of food logs, weight logs, and water logs. You go directly to Profile & settings and choose your own sex, birth date, body details, activity, goal, diet, and allergies. Each visitor gets a separate account, so guest data is not shared.

Guests can search foods, use the rule-based meal planner, view recipes, create private recipes/custom foods, log meals, water, and weight, and inspect progress charts. Guests cannot use the AI assistant or barcode lookup. A guest can click **Create free account** to keep all guest data and unlock AI. Guest accounts expire after 24 hours if not upgraded; expired guests are cleaned when a new guest session starts.

No public demo email or password exists anymore.

## API endpoints

All responses are JSON. Errors look like `{ "error": "message" }`. Routes marked with a lock need `Authorization: Bearer <token>`; users can only read and change their own data.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | | Create account, returns token |
| POST | `/api/auth/login` | | Log in, returns token |
| POST | `/api/auth/guest` | | Start a private temporary guest session |
| POST | `/api/auth/upgrade` | 🔒 | Convert guest session into a permanent account and keep its data (also unlocks AI) |
| GET | `/api/auth/me` | 🔒 | Current user; includes `is_guest` |
| GET / PUT | `/api/profile` | 🔒 | Read / save profile (PUT can also log today's weight) |
| GET / PUT | `/api/profile/allergens` | 🔒 | All allergens + selected / replace selection |
| GET | `/api/profile/targets` | 🔒 | BMI, BMR, TDEE, calories, macros, water, ideal weight, notes |
| GET / POST | `/api/weights` | 🔒 | Weight history (with BMI) / log weight |
| GET | `/api/foods/categories` | 🔒 | Food categories |
| GET | `/api/foods/search?q=&category=&page=&all=1&favorites=1` | 🔒 | Search (filtered by diet/allergens unless `all=1`) |
| GET | `/api/foods/barcode/:code` | 🔒 | Open Food Facts lookup (registered accounts only; saved as a food) |
| GET | `/api/foods/:id` | 🔒 | Nutrition per 100 g, servings, allergens, favorite/dislike flags |
| POST | `/api/foods` | 🔒 | Create custom food |
| POST / DELETE | `/api/foods/:id/favorite` | 🔒 | Add / remove favorite |
| POST / DELETE | `/api/foods/:id/dislike` | 🔒 | Add / remove dislike |
| GET | `/api/recipes?q=&mine=1&fits=1` | 🔒 | List recipes with per-serving nutrition |
| GET | `/api/recipes/:id` | 🔒 | Ingredients + calculated nutrition |
| POST | `/api/recipes` | 🔒 | Create recipe |
| GET | `/api/logs?date=` | 🔒 | Diary entries + totals for a day |
| POST | `/api/logs` | 🔒 | Log a food or recipe |
| PUT / DELETE | `/api/logs/:id` | 🔒 | Edit / delete entry |
| GET | `/api/logs/summary?from=&to=` | 🔒 | Daily totals and averages |
| GET / POST | `/api/water` | 🔒 | Today's water / add (or undo) |
| POST | `/api/meal-plans/generate` | 🔒 | Rule-based plan, body `{ days: 1 \| 7 }` |
| GET | `/api/meal-plans/current` | 🔒 | Latest plan with days, items, totals |
| PUT | `/api/meal-plans/items/:id/swap` | 🔒 | Next best candidate |
| PUT | `/api/meal-plans/items/:id/lock` | 🔒 | Lock / unlock |
| POST | `/api/meal-plans/:id/log-day` | 🔒 | Copy a planned day (or some items) into the diary |
| GET | `/api/meal-plans/:id/shopping-list` | 🔒 | Ingredients grouped by category |
| GET | `/api/ai/status` | 🔒 | Is AI configured? Also reports `guest: true` |
| POST | `/api/ai/chat` | 🔒 | Chat (last 10 messages) |
| POST | `/api/ai/generate-plan` | 🔒 | AI plan, matched to the database (falls back to the planner) |
| POST | `/api/ai/explain` | 🔒 | "Why this meal?" |
| POST | `/api/tools/bmi` | | Public BMI calculator |
| GET | `/api/health` | | Health check |

---

## What I learned

- *Database design: ...*
- *Writing raw SQL with views and functions instead of an ORM: ...*
- *Full-text and trigram search in PostgreSQL: ...*
- *Designing a recommendation algorithm: ...*
- *Using an LLM safely (validation, never trusting its numbers): ...*
- *Building a PWA / responsive layout: ...*

## License

Code: MIT. USDA data: public domain. Open Food Facts data: ODbL.
