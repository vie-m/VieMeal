// =====================================================================
// Nutrition calculations. Pure functions (no database), so they are easy
// to unit test. Examples in comments match the tests in nutrition.test.js.
// =====================================================================

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,    // little or no exercise
  light: 1.375,      // light exercise 1-3 days/week
  moderate: 1.55,    // moderate exercise 3-5 days/week
  active: 1.725,     // hard exercise 6-7 days/week
  very_active: 1.9,  // physical job or training twice a day
};

// Calorie change per goal (kcal/day). -500 kcal/day is roughly -0.5 kg/week.
export const GOAL_ADJUSTMENT = { lose: -500, maintain: 0, gain: 300 };

// Never recommend less than this (kcal/day).
export const MIN_CALORIES = { male: 1500, female: 1200 };

// BMI category upper limits. Each category is "BMI < limit".
export const BMI_STANDARDS = {
  who: { underweight: 18.5, normal: 25, overweight: 30 },   // obese >= 30
  asian: { underweight: 18.5, normal: 23, overweight: 25 }, // obese >= 25
};

const round1 = (x) => Math.round(x * 10) / 10;

/**
 * Age in whole years on a given date.
 * ageFromBirthDate('2000-06-15', new Date('2025-06-14')) -> 24
 * ageFromBirthDate('2000-06-15', new Date('2025-06-15')) -> 25
 */
export function ageFromBirthDate(birthDate, today = new Date()) {
  const b = new Date(birthDate);
  let age = today.getFullYear() - b.getFullYear();
  // Not had the birthday yet this year? Subtract one.
  const beforeBirthday =
    today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * BMI = weight (kg) / height (m)^2, rounded to 1 decimal.
 * calculateBmi(70, 175) -> 22.9
 */
export function calculateBmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) throw new Error('Weight and height must be positive');
  const h = heightCm / 100;
  return round1(weightKg / (h * h));
}

/**
 * BMI category for the chosen standard ('who' or 'asian').
 * bmiCategory(24, 'who')   -> 'normal'
 * bmiCategory(24, 'asian') -> 'overweight'
 */
export function bmiCategory(bmi, standard = 'asian') {
  const s = BMI_STANDARDS[standard] || BMI_STANDARDS.asian;
  if (bmi < s.underweight) return 'underweight';
  if (bmi < s.normal) return 'normal';
  if (bmi < s.overweight) return 'overweight';
  return 'obese';
}

/**
 * Basal Metabolic Rate with the Mifflin-St Jeor equation (kcal/day).
 * male:   10*kg + 6.25*cm - 5*age + 5
 * female: 10*kg + 6.25*cm - 5*age - 161
 * calculateBmr({ sex: 'male', weightKg: 70, heightCm: 175, age: 25 })   -> 1673.75
 * calculateBmr({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 }) -> 1320.25
 */
export function calculateBmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/**
 * Total Daily Energy Expenditure = BMR x activity factor.
 * calculateTdee(1673.75, 'moderate') -> 2594.3125
 */
export function calculateTdee(bmr, activityLevel) {
  const factor = ACTIVITY_FACTORS[activityLevel];
  if (!factor) throw new Error(`Unknown activity level: ${activityLevel}`);
  return bmr * factor;
}

/**
 * Daily calorie target from TDEE and goal, never below the safe minimum.
 * calorieTarget({ tdee: 2594, goal: 'lose', sex: 'male' })   -> { calories: 2094, adjustedToMinimum: false }
 * calorieTarget({ tdee: 1500, goal: 'lose', sex: 'female' }) -> { calories: 1200, adjustedToMinimum: true }
 */
export function calorieTarget({ tdee, goal, sex }) {
  const raw = Math.round(tdee + (GOAL_ADJUSTMENT[goal] ?? 0));
  const min = MIN_CALORIES[sex] ?? 1200;
  if (raw < min) return { calories: min, adjustedToMinimum: true };
  return { calories: raw, adjustedToMinimum: false };
}

/**
 * Macro targets in grams. Protein & carbs = 4 kcal/g, fat = 9 kcal/g.
 * macroTargets(2000) -> { protein_g: 125, carbs_g: 250, fat_g: 56 }   (25/50/25 %)
 */
export function macroTargets(calories, split = { protein: 25, carbs: 50, fat: 25 }) {
  const { protein, carbs, fat } = split;
  if (protein + carbs + fat !== 100) throw new Error('Macro percentages must add up to 100');
  return {
    protein_g: Math.round((calories * protein) / 100 / 4),
    carbs_g: Math.round((calories * carbs) / 100 / 4),
    fat_g: Math.round((calories * fat) / 100 / 9),
  };
}

/**
 * Checks a custom macro split stays in reasonable limits.
 * validateMacroSplit({ protein: 30, carbs: 45, fat: 25 }) -> null (ok)
 * validateMacroSplit({ protein: 60, carbs: 20, fat: 20 }) -> 'Protein must be between 10% and 35%'
 */
export const MACRO_LIMITS = { protein: [10, 35], carbs: [40, 65], fat: [20, 35] };
export function validateMacroSplit(split) {
  for (const [key, [lo, hi]] of Object.entries(MACRO_LIMITS)) {
    const v = Number(split[key]);
    if (!Number.isInteger(v) || v < lo || v > hi) {
      return `${key[0].toUpperCase() + key.slice(1)} must be between ${lo}% and ${hi}%`;
    }
  }
  if (split.protein + split.carbs + split.fat !== 100) return 'Percentages must add up to 100';
  return null;
}

/**
 * Water target: about 35 ml per kg, rounded to the nearest 50 ml.
 * waterTargetMl(70) -> 2450
 */
export function waterTargetMl(weightKg) {
  return Math.round((weightKg * 35) / 50) * 50;
}

/**
 * Weight range (kg) that gives a "normal" BMI at this height.
 * idealWeightRange(175, 'who')   -> { min: 56.7, max: 76.3 }   (BMI 18.5 to 24.9)
 * idealWeightRange(175, 'asian') -> { min: 56.7, max: 70.1 }   (BMI 18.5 to 22.9)
 */
export function idealWeightRange(heightCm, standard = 'asian') {
  const s = BMI_STANDARDS[standard] || BMI_STANDARDS.asian;
  const h2 = (heightCm / 100) ** 2;
  return {
    min: round1(s.underweight * h2),
    max: round1((s.normal - 0.1) * h2),
  };
}

/**
 * Whether the user may choose "lose weight". Not allowed when underweight.
 * canChooseLoseGoal(17.9) -> false
 */
export function canChooseLoseGoal(bmi) {
  return bmi >= BMI_STANDARDS.who.underweight;
}

/**
 * Nutrition for a given amount of a food (values are stored per 100 g).
 * scaleNutrition({ calories_kcal: 130, protein_g: 2.7 }, 150) -> { calories_kcal: 195, protein_g: 4.1 }
 */
export function scaleNutrition(per100g, grams) {
  const out = {};
  for (const [k, v] of Object.entries(per100g)) {
    if (typeof v === 'number') out[k] = round1((v * grams) / 100);
  }
  return out;
}

/**
 * Everything the "My targets" screen needs, in one call.
 * profile: { sex, birth_date, height_cm, activity_level, goal, bmi_standard,
 *            protein_pct, carbs_pct, fat_pct }
 */
export function computeTargets(profile, weightKg, today = new Date()) {
  const age = ageFromBirthDate(profile.birth_date, today);
  const bmi = calculateBmi(weightKg, profile.height_cm);
  const standard = profile.bmi_standard || 'asian';
  const category = bmiCategory(bmi, standard);
  const bmr = calculateBmr({ sex: profile.sex, weightKg, heightCm: profile.height_cm, age });
  const tdee = calculateTdee(bmr, profile.activity_level);

  // Safety: an underweight user never gets a calorie deficit.
  let goal = profile.goal;
  const notes = [];
  if (goal === 'lose' && !canChooseLoseGoal(bmi)) {
    goal = 'maintain';
    notes.push('Your BMI is in the underweight range, so we use a "maintain" target instead of weight loss.');
  }
  const target = calorieTarget({ tdee, goal, sex: profile.sex });
  if (target.adjustedToMinimum) {
    notes.push(`Your target was raised to the safe minimum of ${target.calories} kcal per day.`);
  }
  const split = {
    protein: profile.protein_pct ?? 25,
    carbs: profile.carbs_pct ?? 50,
    fat: profile.fat_pct ?? 25,
  };

  return {
    age,
    weight_kg: weightKg,
    height_cm: Number(profile.height_cm),
    bmi,
    bmi_category: category,
    bmi_standard: standard,
    ideal_weight: idealWeightRange(profile.height_cm, standard),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    goal,
    calories: target.calories,
    adjusted_to_minimum: target.adjustedToMinimum,
    macro_split: split,
    macros: macroTargets(target.calories, split),
    water_ml: waterTargetMl(weightKg),
    notes,
  };
}
