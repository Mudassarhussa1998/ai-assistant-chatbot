# AI Assistant — product guide

AI Assistant is an AI chat widget that can be added to any website or system. Visitors click the
robot button in the bottom-right corner to open a chat window and get instant answers.
It is powered by Google Gemini and can answer from the company's own documents (RAG).

## Installing on a website

Add one line of code before the closing `</body>` tag:

```html
<script src="https://YOUR-FRONTEND-DOMAIN/widget.js" defer></script>
```

It works on plain HTML sites, WordPress (with a header/footer code plugin such as WPCode),
Shopify (theme.liquid), Webflow (Footer code), Wix and Squarespace (custom code / code injection),
and React or Next.js apps.

## Customising the widget

Settings are added as attributes on the script tag:

- `data-title` — the name shown in the chat header, e.g. "Support Bot".
- `data-color` — the main color. The default is olive green (#556b2f).
- `data-welcome` — the greeting text on the welcome screen.
- `data-suggestions` — quick question buttons, separated by `|`.
- `data-api` — the backend URL, only needed if the API runs on a different domain.

## Teaching the assistant about your business

Put .md or .txt files into the `backend/knowledge/` folder and restart the backend. The files are
split into chunks, embedded with Gemini embeddings and searched whenever a visitor asks a question,
so answers are based on your own content. Each answer lists the documents it used as sources.

## Privacy and security

The Gemini API key is kept on the backend server and is never sent to visitors' browsers.
Conversations are kept only in the visitor's browser tab and are not stored on the server.
Site owners can restrict which websites may use the chat with the `ALLOWED_ORIGINS` setting.

## Support

For help with installation or customisation, contact the team that set up the assistant on your website.
