// VieMeal API app (routes + error handling), without starting a server.
// - Locally, src/index.js imports this and calls app.listen().
// - On Vercel, api/index.js exports this app as a serverless function.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import foodRoutes from './routes/foods.js';
import recipeRoutes from './routes/recipes.js';
import logRoutes from './routes/logs.js';
import mealPlanRoutes from './routes/mealPlans.js';
import aiRoutes from './routes/ai.js';
import toolRoutes from './routes/tools.js';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing (server/.env locally, Environment Variables on Vercel)');
}

const app = express();

// On Vercel, requests come through Vercel's proxy, which sets the real visitor IP
// in X-Forwarded-For. Trusting it lets req.ip (used by the guest limit) see that IP.
if (process.env.VERCEL) app.set('trust proxy', true);

const origins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
// In development allow any localhost / LAN origin (so you can test on your phone).
// On Vercel the app and API share one address, so CORS is not needed there.
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || origins.includes(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)),
}));
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api', profileRoutes);        // /api/profile..., /api/weights
app.use('/api/foods', foodRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api', logRoutes);            // /api/logs..., /api/water
app.use('/api/meal-plans', mealPlanRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/tools', toolRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// Central error handler: always answers { "error": "message" }.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  // Database CHECK / FK errors become friendly 400s.
  if (err.code === '23514' || err.code === '23503') return res.status(400).json({ error: 'Some values are not valid' });
  res.status(status).json({ error: status >= 500 && !err.status ? 'Something went wrong on our side. Please try again.' : err.message });
});

export default app;
