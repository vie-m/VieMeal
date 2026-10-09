// Small helpers shared by all routes.
import jwt from 'jsonwebtoken';

// An error with an HTTP status. Thrown inside routes, turned into
// { "error": "message" } by the error handler in index.js.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);

// Wrap an async route so thrown errors reach the error handler
// (Express 4 does not catch rejected promises by itself).
export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Authentication ----
// Guests get a short token (24 h) because guest accounts are deleted after 24 h.
export function signToken(user) {
  const payload = { sub: user.id, guest: Boolean(user.is_guest) };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: user.is_guest ? '24h' : '7d' });
}

// Requires "Authorization: Bearer <token>". Puts the user id on req.userId.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = Number(payload.sub);
    req.isGuest = Boolean(payload.guest);
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

// Blocks guest accounts (use after requireAuth). Answers 403 with code "GUEST"
// so the frontend can show a "create a free account" message.
export function requireFullAccount(req, res, next) {
  if (!req.isGuest) return next();
  res.status(403).json({ code: 'GUEST', error: 'Create a free account to use this feature. Your guest data comes with you.' });
}

// ---- Input validation helpers (throw 400 with a friendly message) ----
export function int(value, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${name} must be a whole number between ${min} and ${max}`);
  return n;
}

export function num(value, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${name} must be a number between ${min} and ${max}`);
  return n;
}

export function str(value, name, { min = 1, max = 255, optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  if (typeof value !== 'string') throw badRequest(`${name} is required`);
  const s = value.trim();
  if (s.length < min || s.length > max) throw badRequest(`${name} must be ${min} to ${max} characters`);
  return s;
}

export function oneOf(value, name, allowed, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  if (!allowed.includes(value)) throw badRequest(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function date(value, name, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  if (typeof value !== 'string' || !DATE_RE.test(value) || isNaN(new Date(value))) {
    throw badRequest(`${name} must be a date like 2025-01-31`);
  }
  return value;
}

// Today's date as YYYY-MM-DD in the server's local timezone.
export function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
