# Gemini Chat Widget

A floating robot chat widget you can drop into **any website** with one line of code, powered by Google Gemini.

- `lib/chat.js` — the chat logic: sends messages to Gemini so your API key stays secret on the server.
- `server.js` — tiny Node server (no dependencies) for local use, Render, Railway, Docker or a VPS.
- `netlify/functions/chat.mjs` + `netlify.toml` — the same chat API as a Netlify Function.
- `public/widget.js` — the embeddable widget (robot button bottom-right → chat popup).
- `public/index.html` — the live demo page.

## Run locally

1. Get a Gemini API key: https://aistudio.google.com/apikey
2. Create your env file and paste the key in:
   ```bash
   cp .env.example .env
   ```
3. Start it (Node 20.12+):
   ```bash
   npm start
   ```
4. Open http://localhost:3000 and click the robot.

## Add it to any website

Once deployed, paste this before `</body>` on any site:

```html
<script src="https://YOUR-DOMAIN/widget.js"
        data-title="Support Bot"
        data-color="#556b2f"
        data-welcome="Hi! How can I help?"
        defer></script>
```

| Attribute      | Default                       | Purpose                              |
|----------------|-------------------------------|--------------------------------------|
| `data-title`   | `AI Assistant`                | Header title                         |
| `data-color`   | `#556b2f`                     | Accent color                         |
| `data-welcome` | friendly greeting             | First message from the bot           |
| `data-api`     | origin of `widget.js`         | Use if the API runs on another host  |

You can also open/close it from your own buttons: `GeminiChat.open()` / `GeminiChat.close()`.

## Configuration (environment variables)

| Variable          | Required | Default             | Notes                                                    |
|-------------------|----------|---------------------|----------------------------------------------------------|
| `GEMINI_API_KEY`  | yes      | —                   | Your Gemini key                                          |
| `GEMINI_MODEL`    | no       | `gemini-3.8-flash`  | Any Gemini model id (e.g. `gemini-4-argon` for max quality) |
| `GEMINI_THINKING_LEVEL` | no | `low`            | `low` / `medium` / `high` — higher is smarter but slower |
| `SYSTEM_PROMPT`   | no       | generic assistant   | Give the bot its personality / company knowledge         |
| `ALLOWED_ORIGINS` | no       | `*`                 | Comma-separated sites allowed to call the API            |
| `PORT`            | no       | `3000`              | Most hosts set this automatically                        |

**Tip:** In production set `ALLOWED_ORIGINS=https://yoursite.com` so other sites can't use your quota.

## Deploy

It's a plain Node app with no build step and no dependencies, so it runs anywhere:

- **Netlify:** import the GitHub repo. `netlify.toml` already sets everything up (no build command needed).
  Then go to **Site configuration → Environment variables**, add `GEMINI_API_KEY`, and redeploy
  (**Deploys → Trigger deploy → Deploy site**).

- **Render / Railway / Fly.io / Heroku:** connect the folder/repo, start command `npm start`, add `GEMINI_API_KEY` as an environment variable.
- **Docker:**
  ```bash
  docker build -t chat-widget .
  ```
  ```bash
  docker run -p 3000:3000 -e GEMINI_API_KEY=your-key chat-widget
  ```
- **Any VPS:** copy the folder, set the env vars, run `node server.js` (use pm2 or systemd to keep it alive).
