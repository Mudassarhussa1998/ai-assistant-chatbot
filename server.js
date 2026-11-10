// Zero-dependency Node server: serves the demo page + widget and proxies chat to Gemini.
// For Netlify, the same chat logic runs as a function instead (netlify/functions/chat.mjs).
const http = require("http");
const fs = require("fs");
const path = require("path");

try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
  // No .env file — rely on real environment variables (e.g. on your host).
}

const { corsHeaders, handleChat, MAX_BODY_BYTES } = require("./lib/chat");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
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
    const cors = corsHeaders(req.headers.origin);
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" }, cors);
    return readBody(req)
      .then(handleChat, () => ({ status: 413, data: { error: "Request too large." } }))
      .then(({ status, data }) => sendJson(res, status, data, cors));
  }
  if (req.url === "/health") return sendJson(res, 200, { ok: true });
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Chatbot running at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) console.warn("Warning: GEMINI_API_KEY is not set. Add it to .env");
});
