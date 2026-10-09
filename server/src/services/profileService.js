// Loads a user's profile + latest weight and computes their targets.
// Used by the profile route, the meal planner and the AI context.
import { query } from '../db.js';
import { computeTargets } from '../utils/nutrition.js';

export async function getProfileWithWeight(userId) {
  const { rows } = await query(
    `SELECT p.*,
            (SELECT weight_kg FROM weight_logs w
              WHERE w.user_id = p.user_id ORDER BY logged_on DESC LIMIT 1) AS weight_kg
     FROM user_profiles p
     WHERE p.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

// Returns null when onboarding is not finished.
export async function getTargets(userId) {
  const profile = await getProfileWithWeight(userId);
  if (!profile || !profile.weight_kg) return null;
  return { profile, targets: computeTargets(profile, profile.weight_kg) };
}

export async function getUserAllergens(userId) {
  const { rows } = await query(
    `SELECT a.id, a.name FROM user_allergens ua JOIN allergens a ON a.id = ua.allergen_id
     WHERE ua.user_id = $1 ORDER BY a.name`,
    [userId]
  );
  return rows;
}
