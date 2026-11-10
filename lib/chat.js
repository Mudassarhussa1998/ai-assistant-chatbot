// Shared chat logic used by both the Node server (server.js) and the Netlify function.
// The Gemini API key stays on the server and is never sent to the browser.

const DEFAULT_SYSTEM_PROMPT =
  "You are an AI assistant. Your main purpose is to be integrated into any system and help its users. " +
  "Be friendly, clear and concise, and use short paragraphs or bullet lists when helpful.";
const MAX_HISTORY = 20;
const MAX_BODY_BYTES = 100 * 1024;

// Read settings at call time so hosts that inject env vars per request (Netlify) work too.
function settings() {
  const env = process.env;
  return {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || "gemini-3.8-flash",
    // low | medium | high — "low" keeps chat replies fast. Ignored for gemini-2.x models.
    thinkingLevel: env.GEMINI_THINKING_LEVEL || "low",
    systemPrompt: env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
    // Comma-separated list of sites allowed to embed the widget, or * for any.
    allowedOrigins: (env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()),
  };
}

function corsHeaders(origin) {
  const { allowedOrigins } = settings();
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (allowedOrigins.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

// Takes the raw JSON request body, returns { status, data } to send back as JSON.
async function handleChat(rawBody) {
  const { apiKey, model, thinkingLevel, systemPrompt } = settings();
  if (!apiKey) {
    return { status: 500, data: { error: "Server is missing GEMINI_API_KEY." } };
  }
  if (Buffer.byteLength(rawBody || "") > MAX_BODY_BYTES) {
    return { status: 413, data: { error: "Request too large." } };
  }

  let messages;
  try {
    ({ messages } = JSON.parse(rawBody));
  } catch {
    return { status: 400, data: { error: "Invalid request body." } };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, data: { error: "messages must be a non-empty array." } };
  }

  // Convert widget messages ({role: "user"|"bot", text}) to Gemini's format.
  const contents = messages
    .slice(-MAX_HISTORY)
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text.slice(0, 4000) }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = { systemInstruction: { parts: [{ text: systemPrompt }] }, contents };
  if (!model.startsWith("gemini-2")) {
    body.generationConfig = { thinkingConfig: { thinkingLevel } };
  }
  const callGemini = () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });

  try {
    let r = await callGemini();
    // Retry once on temporary overload / rate limit.
    if (r.status === 503 || r.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      r = await callGemini();
    }
    const data = await r.json();
    if (!r.ok) {
      console.error("Gemini error:", data.error || data);
      return { status: 502, data: { error: "The AI service returned an error. Please try again." } };
    }
    const reply =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
      "Sorry, I couldn't come up with a reply.";
    return { status: 200, data: { reply } };
  } catch (err) {
    console.error("Gemini request failed:", err);
    return { status: 502, data: { error: "Could not reach the AI service." } };
  }
}

module.exports = { corsHeaders, handleChat, MAX_BODY_BYTES };
