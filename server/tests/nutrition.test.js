import { describe, it, expect } from 'vitest';
import {
  ageFromBirthDate, calculateBmi, bmiCategory, calculateBmr, calculateTdee, calorieTarget,
  macroTargets, validateMacroSplit, waterTargetMl, idealWeightRange, canChooseLoseGoal,
  scaleNutrition, computeTargets,
} from '../src/utils/nutrition.js';

describe('ageFromBirthDate', () => {
  it('counts full years only', () => {
    expect(ageFromBirthDate('2000-06-15', new Date('2025-06-14'))).toBe(24);
    expect(ageFromBirthDate('2000-06-15', new Date('2025-06-15'))).toBe(25);
    expect(ageFromBirthDate('2000-01-01', new Date('2025-12-31'))).toBe(25);
  });
});

describe('calculateBmi', () => {
  it('uses kg / m^2 rounded to 1 decimal', () => {
    expect(calculateBmi(70, 175)).toBe(22.9);
    expect(calculateBmi(50, 160)).toBe(19.5);
  });
  it('rejects invalid input', () => {
    expect(() => calculateBmi(0, 170)).toThrow();
    expect(() => calculateBmi(70, -1)).toThrow();
  });
});

describe('bmiCategory', () => {
  it('WHO cut-offs', () => {
    expect(bmiCategory(18.4, 'who')).toBe('underweight');
    expect(bmiCategory(18.5, 'who')).toBe('normal');
    expect(bmiCategory(24.9, 'who')).toBe('normal');
    expect(bmiCategory(25, 'who')).toBe('overweight');
    expect(bmiCategory(29.9, 'who')).toBe('overweight');
    expect(bmiCategory(30, 'who')).toBe('obese');
  });
  it('Asian cut-offs', () => {
    expect(bmiCategory(18.4, 'asian')).toBe('underweight');
    expect(bmiCategory(22.9, 'asian')).toBe('normal');
    expect(bmiCategory(23, 'asian')).toBe('overweight');
    expect(bmiCategory(24.9, 'asian')).toBe('overweight');
    expect(bmiCategory(25, 'asian')).toBe('obese');
  });
  it('defaults to Asian', () => {
    expect(bmiCategory(24)).toBe('overweight');
  });
});

describe('calculateBmr (Mifflin-St Jeor)', () => {
  it('male', () => {
    expect(calculateBmr({ sex: 'male', weightKg: 70, heightCm: 175, age: 25 })).toBe(1673.75);
  });
  it('female', () => {
    expect(calculateBmr({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 })).toBe(1320.25);
  });
});

describe('calculateTdee', () => {
  it('multiplies by activity factor', () => {
    expect(calculateTdee(1000, 'sedentary')).toBeCloseTo(1200);
    expect(calculateTdee(1000, 'light')).toBeCloseTo(1375);
    expect(calculateTdee(1000, 'moderate')).toBeCloseTo(1550);
    expect(calculateTdee(1000, 'active')).toBeCloseTo(1725);
    expect(calculateTdee(1000, 'very_active')).toBeCloseTo(1900);
  });
  it('rejects unknown level', () => {
    expect(() => calculateTdee(1000, 'lazy')).toThrow();
  });
});

describe('calorieTarget', () => {
  it('applies goal adjustments', () => {
    expect(calorieTarget({ tdee: 2500, goal: 'lose', sex: 'male' }).calories).toBe(2000);
    expect(calorieTarget({ tdee: 2500, goal: 'maintain', sex: 'male' }).calories).toBe(2500);
    expect(calorieTarget({ tdee: 2500, goal: 'gain', sex: 'male' }).calories).toBe(2800);
  });
  it('never goes below the safe minimum for females (1200)', () => {
    expect(calorieTarget({ tdee: 1500, goal: 'lose', sex: 'female' }))
      .toEqual({ calories: 1200, adjustedToMinimum: true });
  });
  it('never goes below the safe minimum for males (1500)', () => {
    expect(calorieTarget({ tdee: 1800, goal: 'lose', sex: 'male' }))
      .toEqual({ calories: 1500, adjustedToMinimum: true });
  });
  it('exactly at the minimum is not adjusted', () => {
    expect(calorieTarget({ tdee: 1700, goal: 'lose', sex: 'female' }))
      .toEqual({ calories: 1200, adjustedToMinimum: false });
  });
});

describe('macroTargets', () => {
  it('default 25/50/25 split', () => {
    expect(macroTargets(2000)).toEqual({ protein_g: 125, carbs_g: 250, fat_g: 56 });
  });
  it('custom split', () => {
    expect(macroTargets(2000, { protein: 30, carbs: 40, fat: 30 })).toEqual({ protein_g: 150, carbs_g: 200, fat_g: 67 });
  });
  it('rejects splits not adding to 100', () => {
    expect(() => macroTargets(2000, { protein: 30, carbs: 50, fat: 30 })).toThrow();
  });
});

describe('validateMacroSplit', () => {
  it('accepts reasonable splits', () => {
    expect(validateMacroSplit({ protein: 30, carbs: 45, fat: 25 })).toBeNull();
  });
  it('rejects out-of-range values', () => {
    expect(validateMacroSplit({ protein: 60, carbs: 20, fat: 20 })).toMatch(/Protein/);
    expect(validateMacroSplit({ protein: 25, carbs: 45, fat: 25 })).toMatch(/100/);
  });
});

describe('waterTargetMl', () => {
  it('35 ml per kg, rounded to 50 ml', () => {
    expect(waterTargetMl(70)).toBe(2450);
    expect(waterTargetMl(61)).toBe(2150);
  });
});

describe('idealWeightRange', () => {
  it('WHO', () => {
    expect(idealWeightRange(175, 'who')).toEqual({ min: 56.7, max: 76.3 });
  });
  it('Asian', () => {
    expect(idealWeightRange(175, 'asian')).toEqual({ min: 56.7, max: 70.1 });
  });
});

describe('canChooseLoseGoal', () => {
  it('blocks weight loss when underweight', () => {
    expect(canChooseLoseGoal(17.9)).toBe(false);
    expect(canChooseLoseGoal(18.5)).toBe(true);
  });
});

describe('scaleNutrition', () => {
  it('scales per-100 g values to grams', () => {
    expect(scaleNutrition({ calories_kcal: 130, protein_g: 2.7, name: 'x' }, 150))
      .toEqual({ calories_kcal: 195, protein_g: 4.1 });
  });
});

describe('computeTargets', () => {
  const profile = {
    sex: 'female', birth_date: '1995-01-01', height_cm: 160, activity_level: 'sedentary',
    goal: 'lose', bmi_standard: 'asian', protein_pct: 25, carbs_pct: 50, fat_pct: 25,
  };
  const today = new Date('2025-06-01');

  it('returns all targets', () => {
    const t = computeTargets(profile, 60, today);
    expect(t.age).toBe(30);
    expect(t.bmi).toBe(23.4);
    expect(t.bmi_category).toBe('overweight');
    // BMR = 600 + 1000 - 150 - 161 = 1289; TDEE = 1546.8; lose -> 1047 -> minimum 1200
    expect(t.bmr).toBe(1289);
    expect(t.calories).toBe(1200);
    expect(t.adjusted_to_minimum).toBe(true);
    expect(t.notes.length).toBe(1);
  });

  it('switches "lose" to "maintain" for underweight users', () => {
    const t = computeTargets(profile, 45, today); // BMI 17.6
    expect(t.bmi_category).toBe('underweight');
    expect(t.goal).toBe('maintain');
    expect(t.notes[0]).toMatch(/underweight/);
  });
});
