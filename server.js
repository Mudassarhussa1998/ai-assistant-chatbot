// Zero-dependency Node server: serves the demo page + widget and proxies chat to Gemini.
// The Gemini API key stays on the server and is never sent to the browser.
const http = require("http");
const fs = require("fs");
const path = require("path");

try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
  // No .env file — rely on real environment variables (e.g. on your host).
}

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// low | medium | high — "low" keeps chat replies fast. Ignored for gemini-2.x models.
const GEMINI_THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL || "low";
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are an AI assistant. Your main purpose is to be integrated into any system and help its users. " +
    "Be friendly, clear and concise, and use short paragraphs or bullet lists when helpful.";
// Comma-separated list of sites allowed to embed the widget, or * for any.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());

const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const MAX_HISTORY = 20;
const MAX_BODY_BYTES = 100 * 1024;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 500, { error: "Server is missing GEMINI_API_KEY." });
  }

  let messages;
  try {
    ({ messages } = JSON.parse(await readBody(req)));
  } catch {
    return sendJson(res, 400, { error: "Invalid request body." });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: "messages must be a non-empty array." });
  }

  // Convert widget messages ({role: "user"|"bot", text}) to Gemini's format.
  const contents = messages
    .slice(-MAX_HISTORY)
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text.slice(0, 4000) }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents };
  if (!GEMINI_MODEL.startsWith("gemini-2")) {
    body.generationConfig = { thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL } };
  }
  const callGemini = () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
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
      return sendJson(res, 502, { error: "The AI service returned an error. Please try again." });
    }
    const reply =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
      "Sorry, I couldn't come up with a reply.";
    sendJson(res, 200, { reply });
  } catch (err) {
    console.error("Gemini request failed:", err);
    sendJson(res, 502, { error: "Could not reach the AI service." });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const headers = { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" };
    // widget.js is loaded cross-origin by other sites.
    if (filePath.endsWith("widget.js")) headers["Access-Control-Allow-Origin"] = "*";
    res.writeHead(200, headers);
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/chat")) {
    setCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "POST") return handleChat(req, res);
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  if (req.url === "/health") return sendJson(res, 200, { ok: true });
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Chatbot running at http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) console.warn("Warning: GEMINI_API_KEY is not set. Add it to .env");
});
