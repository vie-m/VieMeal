// =====================================================================
// LLM client. Called ONLY from the backend so the API key never reaches
// the browser. Supports Google Gemini, OpenAI (or any OpenAI-compatible
// server via AI_BASE_URL) and Anthropic Claude, chosen in .env.
// =====================================================================

export function aiEnabled() {
  return Boolean(process.env.AI_API_KEY);
}

// Rules every AI answer must follow. Kept in one place so chat, plan
// generation and "Why this meal?" all share them.
export const SAFETY_RULES = `
You are VieMeal, a friendly nutrition assistant inside a meal-planning app.
Rules you must always follow:
- Give general nutrition information only, not medical advice.
- Never suggest crash diets, fasting for weight loss, extreme restriction, skipping meals, detoxes or diet pills.
- Never suggest a daily intake below 1200 kcal (women) or 1500 kcal (men), and never below the user's own target.
- For medical conditions, pregnancy, eating disorders, medication or unusual symptoms, kindly recommend a doctor or registered dietitian.
- Do not invent precise nutrition numbers. Say "about" for rough estimates; the app calculates exact values from its database.
- Use supportive, neutral language. Never shame bodies, weight or food choices.
- Keep answers short and practical (under 180 words unless asked for more). Use simple language. You know Indonesian food well.
`.trim();

/**
 * Send messages to the configured provider.
 *  system:   system prompt string
 *  messages: [{ role: 'user' | 'assistant', content }]
 *  json:     ask for a JSON response
 * Returns the reply text.
 */
export async function callAi({ system, messages, json = false, maxTokens = 800 }) {
  if (!aiEnabled()) throw Object.assign(new Error('AI is not configured'), { status: 503 });
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const timeout = AbortSignal.timeout(45000);

  let url, headers, body, extract;

  if (provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-3.5-flash'}:generateContent`;
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      // thinkingBudget 0: newer Gemini models "think" first, which uses up the token budget
      // and cuts answers short. Our tasks are simple, so we turn it off.
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 }, ...(json && { responseMimeType: 'application/json' }) },
    };
    extract = (d) => d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  } else if (provider === 'anthropic' || provider === 'claude') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    body = { model: model || 'claude-3-5-haiku-latest', system, messages, max_tokens: maxTokens };
    extract = (d) => d.content?.map((c) => c.text).join('') ?? '';
  } else {
    // OpenAI and OpenAI-compatible servers
    const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    url = `${base}/chat/completions`;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    body = {
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens,
      ...(json && { response_format: { type: 'json_object' } }),
    };
    extract = (d) => d.choices?.[0]?.message?.content ?? '';
  }

  // Free AI tiers are sometimes "busy" (429 / 500 / 503). These errors are
  // temporary, so we try up to 3 times, waiting a bit longer each time.
  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: timeout });
    if (![429, 500, 503].includes(res.status) || attempt === 3) break;
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`AI ${provider} error ${res.status}:`, JSON.stringify(data).slice(0, 300));
    throw Object.assign(new Error(res.status === 503 || res.status === 429 ? 'The AI is busy right now. Please try again in a minute.' : 'The AI service returned an error'), { status: 502 });
  }
  const text = extract(data).trim();
  if (!text) throw Object.assign(new Error('The AI returned an empty answer'), { status: 502 });
  return text;
}

// Pull the first JSON object out of a reply (models sometimes wrap it in ```json fences).
export function parseJsonReply(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in AI reply');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ---- Simple per-user rate limit (in memory, resets when the server restarts) ----
const hits = new Map(); // userId -> [timestamps]
export function aiRateLimit(req, res, next) {
  const limit = Number(process.env.AI_RATE_LIMIT_PER_HOUR || 20);
  const now = Date.now();
  const recent = (hits.get(req.userId) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= limit) {
    const waitMin = Math.ceil((3600_000 - (now - recent[0])) / 60000);
    return res.status(429).json({ error: `You have reached the AI limit of ${limit} requests per hour. Please try again in ${waitMin} minutes.` });
  }
  recent.push(now);
  hits.set(req.userId, recent);
  next();
}
