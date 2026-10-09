// Auth: register, login, current user.
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../db.js';
import { asyncRoute, badRequest, requireAuth, signToken, str, HttpError } from '../utils/http.js';
import { fillSampleData } from '../services/sampleData.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readEmail(value) {
  const email = str(value, 'Email', { max: 255 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest('Please enter a valid email address');
  return email;
}

router.post('/register', asyncRoute(async (req, res) => {
  const fullName = str(req.body.full_name, 'Name', { max: 100 });
  const email = readEmail(req.body.email);
  const password = str(req.body.password, 'Password', { min: 8, max: 72 }); // bcrypt uses max 72 bytes

  // bcrypt hashes with a random salt; cost 10 is a good default.
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      `INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, full_name, email, is_guest, created_at`,
      [fullName, email, hash]
    );
    res.status(201).json({ token: signToken(rows[0]), user: { ...rows[0], has_profile: false } });
  } catch (err) {
    // 23505 = unique_violation (email already registered)
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
}));

router.post('/login', asyncRoute(async (req, res) => {
  const email = readEmail(req.body.email);
  const password = str(req.body.password, 'Password', { max: 72 });
  const { rows } = await query(
    `SELECT u.*, EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id) AS has_profile
     FROM users u WHERE email = $1 AND NOT is_guest`, [email]); // guests have no password
  const user = rows[0];
  // Same message for "no user" and "wrong password" so emails cannot be guessed.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect');
  }
  const { password_hash, ...safe } = user;
  res.json({ token: signToken(user), user: safe });
}));

// ---- Guest mode ----
// "Continue as guest" creates a NEW private sandbox account for each visitor,
// filled with 14 days of sample data. Nobody shares it, so one visitor cannot
// mess up another visitor's data. Guests cannot use the AI or barcode lookup,
// and guest accounts are deleted after 24 hours (unless they sign up).
const GUEST_LIFETIME = '24 hours';
const guestHits = new Map(); // ip -> timestamps, to stop someone creating thousands of guests

router.post('/guest', asyncRoute(async (req, res) => {
  const now = Date.now();
  const recent = (guestHits.get(req.ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 10) throw new HttpError(429, 'Too many guest sessions from your network. Please try again later.');
  guestHits.set(req.ip, [...recent, now]);

  // Clean up old guests first. ON DELETE CASCADE removes all their logs too.
  await query(`DELETE FROM users WHERE is_guest AND created_at < now() - $1::interval`, [GUEST_LIFETIME]);

  const user = await withTransaction(async (c) => {
    // A guest has no real email and no usable password: the "hash" is random
    // text, not a bcrypt hash, so logging in with a password can never work.
    const tag = crypto.randomBytes(6).toString('hex');
    const { rows } = await c.query(
      `INSERT INTO users (full_name, email, password_hash, is_guest)
       VALUES ('Guest', $1, $2, TRUE) RETURNING id, full_name, email, is_guest, created_at`,
      [`guest-${tag}@guest.viemeal.local`, `guest:${crypto.randomBytes(16).toString('hex')}`]);
    await fillSampleData(c, rows[0].id, now % 100000);
    return rows[0];
  });
  // Guest profile stays empty; user must choose every setting in Profile.
  res.status(201).json({ token: signToken(user), user: { ...user, has_profile: false } });
}));

// Guest -> real account. Keeps everything the guest logged (same user id),
// just sets a real name, email and password and clears the guest flag.
router.post('/upgrade', requireAuth, asyncRoute(async (req, res) => {
  if (!req.isGuest) throw badRequest('You already have an account');
  const fullName = str(req.body.full_name, 'Name', { max: 100 });
  const email = readEmail(req.body.email);
  const password = str(req.body.password, 'Password', { min: 8, max: 72 });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      `UPDATE users SET full_name = $1, email = $2, password_hash = $3, is_guest = FALSE
       WHERE id = $4 AND is_guest
       RETURNING id, full_name, email, is_guest, created_at`,
      [fullName, email, hash, req.userId]);
    if (!rows[0]) throw new HttpError(401, 'Your guest session has expired. Please sign up again.');
    const { rows: profileRows } = await query('SELECT 1 FROM user_profiles WHERE user_id = $1', [rows[0].id]);
    res.json({ token: signToken(rows[0]), user: { ...rows[0], has_profile: Boolean(profileRows[0]) } });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
}));

router.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.is_guest, u.created_at,
            EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id) AS has_profile
     FROM users u WHERE u.id = $1`, [req.userId]);
  if (!rows[0]) throw new HttpError(401, 'Account not found');
  res.json(rows[0]);
}));

export default router;
