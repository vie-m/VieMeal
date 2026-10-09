// Public tools (no login): BMI calculator for visitors on the landing page.
import { Router } from 'express';
import { num, oneOf } from '../utils/http.js';
import { calculateBmi, bmiCategory, idealWeightRange } from '../utils/nutrition.js';

const router = Router();

router.post('/bmi', (req, res, next) => {
  try {
    const weight = num(req.body.weight_kg, 'Weight (kg)', { min: 20, max: 400 });
    const height = num(req.body.height_cm, 'Height (cm)', { min: 100, max: 250 });
    const standard = oneOf(req.body.standard ?? 'asian', 'Standard', ['who', 'asian']);
    const bmi = calculateBmi(weight, height);
    res.json({ bmi, category: bmiCategory(bmi, standard), standard, ideal_weight: idealWeightRange(height, standard) });
  } catch (err) {
    next(err);
  }
});

export default router;
