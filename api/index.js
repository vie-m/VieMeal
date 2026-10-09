// Vercel serverless function: every /api/... request is sent here (see vercel.json).
// It runs the same Express app as local development.
import app from '../server/src/app.js';

export default app;
