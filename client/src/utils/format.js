// Formatting helpers shared by all pages.
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
export const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

export const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};
export const fmt = (n, d = 0) => round(n, d).toLocaleString('en-US');

// Local date as YYYY-MM-DD (toISOString would use UTC and can be "yesterday").
export function isoDate(d = new Date()) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function prettyDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', opts);
}

export function mealTypeForNow() {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
}

// Nutrition of `grams` from per-100 g values.
export function scale(food, grams) {
  const f = (Number(grams) || 0) / 100;
  return {
    calories_kcal: round(food.calories_kcal * f),
    protein_g: round(food.protein_g * f, 1),
    carbs_g: round(food.carbs_g * f, 1),
    fat_g: round(food.fat_g * f, 1),
    fiber_g: round((food.fiber_g || 0) * f, 1),
    sugar_g: round((food.sugar_g || 0) * f, 1),
    sodium_mg: round((food.sodium_mg || 0) * f),
  };
}

export const BMI_COLORS = {
  underweight: 'text-sky-600 bg-sky-50 dark:bg-sky-950 dark:text-sky-300',
  normal: 'text-brand-700 bg-brand-50 dark:bg-brand-950 dark:text-brand-300',
  overweight: 'text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300',
  obese: 'text-orange-700 bg-orange-50 dark:bg-orange-950 dark:text-orange-300',
};
export const BMI_LABELS = { underweight: 'Underweight', normal: 'Healthy range', overweight: 'Overweight', obese: 'Obese' };

export const ACTIVITY = [
  ['sedentary', 'Sedentary', 'Desk job, little exercise'],
  ['light', 'Lightly active', 'Light exercise 1-3 days/week'],
  ['moderate', 'Moderately active', 'Exercise 3-5 days/week'],
  ['active', 'Active', 'Hard exercise 6-7 days/week'],
  ['very_active', 'Very active', 'Physical job or training twice a day'],
];
export const GOALS = [
  ['lose', 'Lose weight', 'About 500 kcal below your needs'],
  ['maintain', 'Maintain', 'Eat what your body uses'],
  ['gain', 'Gain weight', 'About 300 kcal above your needs'],
];
export const DIETS = [
  ['any', 'No preference'], ['halal', 'Halal'], ['vegetarian', 'Vegetarian'],
  ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian'],
];

export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
