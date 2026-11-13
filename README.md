# AI Assistant for your website

An embeddable AI chat widget (robot button → chat popup) powered by Google Gemini, with
**RAG** (answers from your own documents) and a **tool-calling agent**.

```
frontend/   Next.js — landing page + the embeddable widget (public/widget.js)
backend/    FastAPI (Python) — chat API, agent, RAG
render.yaml one-click deploy of both services on Render
```

How a message flows:

```
Any website ── widget.js ──► Frontend /api/chat ──(Next.js rewrite)──► Backend /api/chat
                                                                         │
                                                                   Agent (Gemini 3.8 Flash)
                                                                   ├─ search_knowledge_base → RAG
                                                                   └─ get_current_datetime
```

## Run locally

**Backend** (Python 3.12+):

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```
```bash
cp backend/.env.example backend/.env   # then put your GEMINI_API_KEY in it
```
```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

**Frontend** (Node 20.9+), in a second terminal:

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000 and click the robot. If the backend runs on another port, start the
frontend with `BACKEND_URL=http://localhost:PORT npm run dev`.

## RAG: teach it about your business

**Admin panel (easiest):** open `/admin` on the frontend (e.g. http://localhost:3000/admin), log in with
`ADMIN_TOKEN`, then upload PDF, Word (.docx), Markdown or text files, or write/paste a document.
Changes are indexed immediately; no restart needed. You can also delete documents there.

**Or by hand:** put `.md`, `.txt`, `.pdf` or `.docx` files in `backend/knowledge/` and restart the backend.

Files are chunked and embedded with `gemini-embedding-2`. Embeddings are cached per chunk in
`backend/knowledge/.index/`, so only new or changed text is embedded. When a visitor asks a question,
the agent searches the knowledge base and the widget shows the documents the answer came from.

The vector store is in memory (`backend/app/rag/vector_store.py`), which is fine for hundreds of
documents. For large collections, swap it for pgvector, Qdrant, Pinecone or Chroma.

## Agents and tools

- `backend/app/agents/tools.py` — tools are plain Python functions with type hints and a docstring.
  Add a function to give the agent a new ability (look up an order, book a meeting, call your API…).
- `backend/app/agents/__init__.py` — the agent registry. Add more agents with their own instructions
  and tools; the API picks one with `{"agent": "<name>"}` (default `assistant`).
- `backend/app/agents/agent.py` — the tool-calling loop on top of Gemini.

## Add the widget to any website

```html
<script src="https://YOUR-FRONTEND-DOMAIN/widget.js"
        data-title="Support Bot"
        data-color="#556b2f"
        data-welcome="Hi! How can I help?"
        data-suggestions="What do you offer?|Pricing|Contact us"
        defer></script>
```

## API

| Method | Path          | Body / response |
|--------|---------------|-----------------|
| POST   | `/api/chat`   | `{"messages":[{"role":"user","text":"Hi"}], "agent":"assistant"}` → `{"reply":"…","sources":["file.md"]}` |
| GET    | `/api/health` | `{"ok":true,"knowledge_chunks":3}` |
| GET    | `/api/admin/documents` | List documents (admin) |
| POST   | `/api/admin/documents` | Upload files, multipart field `files` (admin) |
| POST   | `/api/admin/documents/text` | `{"title":"…","content":"…"}` (admin) |
| DELETE | `/api/admin/documents/{name}` | Delete a document (admin) |

Admin routes need the header `Authorization: Bearer <ADMIN_TOKEN>`.

Interactive docs: `http://localhost:8000/docs` (FastAPI).

## Configuration

Backend (`backend/.env`, or environment variables on your host):

| Variable                 | Default              | Notes |
|--------------------------|----------------------|-------|
| `GEMINI_API_KEY`         | — (required)         | https://aistudio.google.com/apikey |
| `GEMINI_MODEL`           | `gemini-3.8-flash`   | Chat model |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-2` | RAG embeddings |
| `GEMINI_THINKING_LEVEL`  | `low`                | `low` / `medium` / `high` |
| `SYSTEM_PROMPT`          | generic assistant    | The bot's personality and rules |
| `ALLOWED_ORIGINS`        | `*`                  | Comma-separated sites allowed to call the API |
| `RAG_TOP_K`              | `4`                  | Chunks retrieved per search |
| `ADMIN_TOKEN`            | — (admin disabled)   | Password for the `/admin` panel. Use a long random value |
| `KNOWLEDGE_DIR`          | `backend/knowledge`  | Where documents are stored (point it at a persistent disk in production) |

Frontend:

| Variable      | Default                 | Notes |
|---------------|-------------------------|-------|
| `BACKEND_URL` | `http://localhost:8000` | The backend's URL. Read at **build** time. |

## Deploy

### Render
1. In Render: **New → Blueprint** → choose this repo. `render.yaml` creates both services.
2. Enter `GEMINI_API_KEY` for the backend. Once it's live, copy its URL
   (e.g. `https://ai-assistant-backend.onrender.com`).
3. Set the frontend's `BACKEND_URL` to that URL and redeploy the frontend.

### Railway
1. Create a project from this repo with two services:
   - **backend**: Root Directory `backend` (the `Procfile` starts uvicorn). Add `GEMINI_API_KEY`.
   - **frontend**: Root Directory `frontend` (Next.js is detected automatically).
2. Generate a public domain for the backend, set it as the frontend's `BACKEND_URL`, and redeploy the frontend.

Embed the widget using the **frontend** URL.

### Keep uploaded documents across deploys
Files uploaded in the admin panel are saved on the backend's disk. On Render and Railway that disk is
wiped on every redeploy/restart unless you attach persistent storage:

- **Render:** add a persistent disk (paid plans; see the commented block in `render.yaml`) and set
  `KNOWLEDGE_DIR` to its mount path.
- **Railway:** add a Volume to the backend service, mounted e.g. at `/data/knowledge`, and set
  `KNOWLEDGE_DIR=/data/knowledge`.

Without persistent storage, keep important documents committed in `backend/knowledge/` instead.
