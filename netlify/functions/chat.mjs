// Netlify Function serving /api/chat — Netlify only hosts static files, so the chat API runs here.
import chat from "../../lib/chat.js";

export default async (req) => {
  const cors = chat.corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });

  const { status, data } = await chat.handleChat(await req.text());
  return Response.json(data, { status, headers: cors });
};

export const config = { path: "/api/chat" };
