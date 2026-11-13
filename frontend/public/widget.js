/*
 * AI Chat Widget — drop into any website with one line:
 *   <script src="https://YOUR-SERVER/widget.js" defer></script>
 *
 * Optional attributes on the script tag:
 *   data-title="Support Bot"            header title
 *   data-color="#556b2f"                accent color (olive green by default)
 *   data-welcome="Hi! How can I help?"  intro text
 *   data-suggestions="A|B|C"            quick-reply chips, separated by |
 *   data-show-sources="true"            show which documents an answer came from (hidden by default)
 *   data-api="https://YOUR-SERVER"      API base (defaults to where widget.js is served from)
 */
(function () {
  if (window.__geminiChatWidgetLoaded) return;
  window.__geminiChatWidgetLoaded = true;

  const script =
    document.currentScript || document.querySelector('script[src*="widget.js"]');
  const cfg = {
    title: script?.dataset.title || "AI Assistant",
    color: script?.dataset.color || "#556b2f",
    welcome: script?.dataset.welcome || "Ask me anything — I'm here to help you 24/7.",
    suggestions: (script?.dataset.suggestions || "What can you do?|How can you help my business?|Give me a quick tip")
      .split("|").map((s) => s.trim()).filter(Boolean),
    showSources: script?.dataset.showSources === "true",
    api: (script?.dataset.api || defaultApi()).replace(/\/$/, ""),
  };

  function defaultApi() {
    const src = script?.src ? new URL(script.src) : location;
    // Page opened straight from disk (file://) — talk to the local server.
    if (src.protocol === "file:") return "http://localhost:3000";
    return src.origin;
  }

  const STORAGE_KEY = "gemini-chat-widget-history";
  const MOBILE_QUERY = "(max-width: 520px)";

  const ROBOT_SVG = `
    <svg class="robot" viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="7" x2="32" y2="14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <circle cx="32" cy="6" r="3.5" fill="currentColor"/>
      <rect x="12" y="14" width="40" height="32" rx="11" fill="currentColor"/>
      <rect x="6" y="25" width="4.5" height="11" rx="2.25" fill="currentColor"/>
      <rect x="53.5" y="25" width="4.5" height="11" rx="2.25" fill="currentColor"/>
      <circle class="eye" cx="24.5" cy="29" r="4" fill="var(--robot-face)"/>
      <circle class="eye" cx="39.5" cy="29" r="4" fill="var(--robot-face)"/>
      <path d="M25 37.5 q7 4.5 14 0" stroke="var(--robot-face)" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect x="21" y="49" width="22" height="9" rx="4.5" fill="currentColor"/>
    </svg>`;

  const ICONS = {
    close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    down: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    reset: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
    send: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
    check: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>`,
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
    button { font: inherit; -webkit-tap-highlight-color: transparent; }
    .wrap {
      --ink: #1f211d; --muted: #6b6f68; --line: #e6e7e2; --soft: #f6f6f3;
      --accent-dark: color-mix(in srgb, var(--accent) 72%, #000);
      --accent-tint: color-mix(in srgb, var(--accent) 10%, #fff);
      --robot-face: var(--accent);
      --safe-b: env(safe-area-inset-bottom, 0px); --safe-t: env(safe-area-inset-top, 0px);
    }
    .robot { width: 28px; height: 28px; display: block; }

    /* ---------- Launcher ---------- */
    .launcher {
      position: fixed; right: 24px; bottom: 24px; z-index: 2147483646;
      width: 62px; height: 62px; border-radius: 50%; border: none; cursor: pointer;
      background: linear-gradient(145deg, var(--accent), var(--accent-dark)); color: #fff; display: grid; place-items: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 2px 4px rgba(0,0,0,.15), 0 14px 34px -6px color-mix(in srgb, var(--accent) 70%, transparent);
      transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
    }
    .launcher:hover { transform: translateY(-2px) scale(1.05); }
    .launcher:active { transform: scale(.95); }
    .launcher::after {
      content: ""; position: absolute; inset: 0; border-radius: 50%;
      box-shadow: 0 0 0 0 var(--accent); opacity: .35; animation: pulse 2.6s ease-out infinite;
    }
    .launcher > span { grid-area: 1 / 1; display: grid; place-items: center; transition: transform .3s, opacity .2s; }
    .launcher .robot { width: 30px; height: 30px; }
    .launcher .when-open { opacity: 0; transform: rotate(-90deg) scale(.6); }
    .open .launcher .when-closed { opacity: 0; transform: rotate(90deg) scale(.6); }
    .open .launcher .when-open { opacity: 1; transform: none; }
    .open .launcher::after, .seen .launcher::after { animation: none; }
    .launcher .eye { animation: blink 4.5s infinite; transform-origin: center; transform-box: fill-box; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 var(--accent); opacity: .35; } 100% { box-shadow: 0 0 0 16px var(--accent); opacity: 0; } }
    @keyframes blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }

    .tooltip {
      position: fixed; right: 98px; bottom: 36px; z-index: 2147483646;
      background: #fff; color: var(--ink); font-size: 13.5px; font-weight: 500; padding: 10px 15px;
      border-radius: 14px; box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 10px 30px -6px rgba(0,0,0,.18);
      white-space: nowrap; pointer-events: none; animation: tipIn .4s 1.5s both;
    }
    .tooltip::after {
      content: ""; position: absolute; right: -5px; top: 50%; width: 10px; height: 10px; background: #fff;
      transform: translateY(-50%) rotate(45deg); border-radius: 2px;
    }
    .open .tooltip, .seen .tooltip { display: none; }
    @keyframes tipIn { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: none; } }

    /* ---------- Panel ---------- */
    .panel {
      position: fixed; right: 24px; bottom: 100px; z-index: 2147483647;
      width: 400px; height: 660px; max-height: calc(100vh - 124px);
      background: var(--soft); color: var(--ink); border-radius: 26px; overflow: hidden;
      box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.06), 0 32px 80px -12px rgba(0,0,0,.32);
      display: flex; flex-direction: column;
      opacity: 0; visibility: hidden; transform: translateY(16px) scale(.96); transform-origin: bottom right;
      transition: opacity .2s ease, transform .3s cubic-bezier(.2,.9,.3,1), visibility 0s .3s;
    }
    .open .panel { opacity: 1; visibility: visible; transform: none; transition: opacity .2s ease, transform .3s cubic-bezier(.2,.9,.3,1); }

    .header {
      position: relative; z-index: 1;
      display: flex; align-items: center; gap: 12px; padding: 14px 12px 14px 16px;
      background: var(--accent); color: #fff;
      transition: box-shadow .2s;
    }
    .scrolled .header { box-shadow: 0 6px 20px -8px rgba(0,0,0,.35); }
    .avatar {
      position: relative; width: 40px; height: 40px; border-radius: 13px; background: rgba(255,255,255,.16); color: #fff;
      display: grid; place-items: center; flex-shrink: 0; --robot-face: var(--accent);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
    }
    .avatar .robot { width: 25px; height: 25px; }
    .avatar .dot {
      position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px; border-radius: 50%;
      background: #4ade80; border: 2.5px solid var(--accent);
    }
    .title { min-width: 0; flex: 1; }
    .title h3 { font-size: 15.5px; font-weight: 650; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title p { margin-top: 2px; font-size: 12.5px; color: rgba(255,255,255,.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .icon-btn {
      width: 36px; height: 36px; border-radius: 11px; border: none; flex-shrink: 0;
      background: transparent; color: rgba(255,255,255,.85); cursor: pointer; display: grid; place-items: center;
      transition: background .15s, color .15s;
    }
    .icon-btn:hover { background: rgba(255,255,255,.14); color: #fff; }

    /* ---------- Messages ---------- */
    .messages {
      position: relative; flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 16px;
      display: flex; flex-direction: column; gap: 14px; background: var(--soft);
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb { background: #dcddd7; border-radius: 3px; }

    /* Welcome band: continues the header color, with the suggestions card overlapping its edge. */
    .intro {
      position: relative; margin: 0 -16px; padding: 18px 24px 52px; color: #fff; overflow: hidden;
      background: linear-gradient(180deg, var(--accent) 0%, var(--accent-dark) 100%);
    }
    .intro::before, .intro::after {
      content: ""; position: absolute; border-radius: 50%; pointer-events: none;
      border: 1px solid rgba(255,255,255,.12);
    }
    .intro::before { width: 220px; height: 220px; right: -70px; top: -90px; }
    .intro::after { width: 140px; height: 140px; right: -20px; top: -40px; }
    .intro .big {
      width: 52px; height: 52px; border-radius: 16px; background: #fff; color: var(--accent);
      display: grid; place-items: center; margin-bottom: 18px; --robot-face: #fff;
      box-shadow: 0 10px 24px -8px rgba(0,0,0,.45);
    }
    .intro .big .robot { width: 32px; height: 32px; }
    .intro h4 { font-size: 26px; font-weight: 750; letter-spacing: -.035em; line-height: 1.15; }
    .intro h4 span { display: block; color: rgba(255,255,255,.62); font-weight: 650; }
    .intro p { margin-top: 10px; font-size: 14px; color: rgba(255,255,255,.78); line-height: 1.5; max-width: 300px; }

    .chips {
      position: relative; margin-top: -48px; background: #fff; border-radius: 18px; padding: 6px;
      box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 12px 30px -12px rgba(0,0,0,.25);
    }
    .chips-label { padding: 10px 12px 6px; font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: .02em; text-transform: uppercase; }
    .chip {
      display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
      text-align: left; border: none; background: transparent; color: var(--ink);
      border-radius: 12px; padding: 12px 12px; font-size: 14px; font-weight: 550; cursor: pointer;
      transition: background .15s, transform .15s;
    }
    .chip + .chip { box-shadow: 0 -1px 0 var(--line); }
    .chip:hover, .chip:hover + .chip { box-shadow: none; }
    .chip svg { color: var(--accent); flex-shrink: 0; transition: transform .15s; }
    .chip:hover { background: var(--accent-tint); }
    .chip:hover svg { transform: translateX(3px); }
    .chip:active { transform: scale(.99); }

    .row { display: flex; gap: 8px; align-items: flex-end; animation: pop .28s cubic-bezier(.2,.9,.3,1) both; }
    .row.user { justify-content: flex-end; }
    .intro + .row { margin-top: 4px; }
    .mini {
      width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: #fff;
      display: grid; place-items: center; flex-shrink: 0; --robot-face: var(--accent); margin-bottom: 2px;
    }
    .row.has-actions .mini { margin-bottom: 26px; }
    .mini .robot { width: 18px; height: 18px; }
    @keyframes pop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

    .col { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; max-width: 82%; }
    .user .col { align-items: flex-end; }
    .msg {
      max-width: 100%; padding: 11px 15px; border-radius: 20px; font-size: 14.5px; line-height: 1.55;
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .bot .msg {
      background: #fff; color: var(--ink); border-bottom-left-radius: 6px;
      box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgba(0,0,0,.04);
    }
    .user .msg {
      background: linear-gradient(145deg, var(--accent), var(--accent-dark)); color: #fff; border-bottom-right-radius: 6px;
      box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--accent) 80%, transparent);
    }
    .msg.error { background: #fff; box-shadow: inset 0 0 0 1px #fca5a5; color: #b91c1c; }
    .msg strong { font-weight: 650; }
    .msg code { background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 5px; font-family: ui-monospace, Menlo, monospace; font-size: 13px; }
    .msg pre { background: #2b2d29; color: #f5f5f5; padding: 10px 12px; border-radius: 10px; overflow-x: auto; white-space: pre; margin: 6px 0; }
    .msg pre code { background: none; padding: 0; color: inherit; }
    .msg a { color: var(--accent); font-weight: 550; text-decoration: underline; text-underline-offset: 2px; }
    .user .msg a { color: inherit; }

    .actions { display: flex; gap: 2px; margin-top: 4px; padding-left: 4px; opacity: .55; transition: opacity .15s; }
    .row:hover .actions, .actions:focus-within { opacity: 1; }
    .copy {
      display: inline-flex; align-items: center; gap: 5px; border: none; background: transparent; cursor: pointer;
      color: var(--muted); font-size: 12px; font-weight: 500; padding: 3px 7px; border-radius: 8px;
      transition: background .15s, color .15s;
    }
    .copy:hover { background: rgba(0,0,0,.05); color: var(--ink); }
    .copy.done { color: var(--accent); }

    .typing { display: flex; gap: 4px; padding: 16px 16px; }
    .typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: bounce 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: .15s; }
    .typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes bounce { 0%,60%,100% { transform: translateY(0); opacity: .25; } 30% { transform: translateY(-4px); opacity: .85; } }

    /* ---------- Composer ---------- */
    form { padding: 12px 14px 4px; background: #fff; border-top: 1px solid var(--line); }
    .composer {
      display: flex; align-items: flex-end; gap: 8px; background: var(--soft);
      border: 1px solid var(--line); border-radius: 22px; padding: 5px 5px 5px 16px;
      transition: border-color .15s, background .15s, box-shadow .15s;
    }
    .composer:focus-within { background: #fff; border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent); }
    textarea {
      flex: 1; resize: none; border: none; outline: none; padding: 9px 0; background: transparent;
      font-size: 14.5px; line-height: 1.4; max-height: 120px; color: var(--ink);
    }
    textarea::placeholder { color: #9a9d95; }
    .send {
      width: 38px; height: 38px; flex-shrink: 0; border: none; border-radius: 50%;
      background: var(--accent); color: #fff; cursor: pointer; display: grid; place-items: center;
      transition: opacity .15s, transform .15s, background .15s;
    }
    .send:hover:not(:disabled) { transform: scale(1.06); background: var(--accent-dark); }
    .send:disabled { opacity: .25; cursor: default; }
    .footer { text-align: center; font-size: 11px; color: #a1a49c; padding: 6px 0 10px; background: #fff; }
    .sources { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); white-space: normal; }
    .source {
      display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--accent);
      background: #fff; border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px;
    }
    .source::before { content: "📄"; font-size: 10px; }

    /* ---------- Mobile: full-screen sheet ---------- */
    @media ${MOBILE_QUERY} {
      .launcher { right: 16px; bottom: calc(16px + var(--safe-b)); width: 58px; height: 58px; }
      .tooltip { display: none; }
      .open .launcher { opacity: 0; pointer-events: none; transform: scale(.6); }
      .panel {
        top: 0; left: 0; right: 0; bottom: auto; width: 100%; height: 100dvh; max-height: none;
        border-radius: 0; box-shadow: none;
        transform: translateY(100%); transform-origin: bottom center;
        transition: transform .35s cubic-bezier(.2,.9,.3,1), opacity .2s, visibility 0s .35s;
      }
      .open .panel { transition: transform .35s cubic-bezier(.2,.9,.3,1), opacity .2s; }
      .header { padding: calc(12px + var(--safe-t)) 8px 12px 16px; }
      .icon-btn { width: 42px; height: 42px; }
      .messages { padding: 0 14px 14px; }
      .intro { margin: 0 -14px; padding: 20px 22px 56px; }
      .intro h4 { font-size: 28px; }
      .msg { font-size: 15px; }
      .col { max-width: 86%; }
      .actions { opacity: 1; }
      textarea { font-size: 16px; } /* 16px stops iOS from zooming on focus */
      .send { width: 40px; height: 40px; }
      form { padding: 10px 12px calc(10px + var(--safe-b)); }
      .footer { display: none; }
      .chip { padding: 14px 12px; font-size: 15px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  `;

  // Build the widget inside a Shadow DOM so host-page styles can't break it (and vice versa).
  const host = document.createElement("div");
  host.id = "gemini-chat-widget";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>${CSS}</style>
    <div class="wrap" style="--accent:${cfg.color}">
      <div class="panel" role="dialog" aria-modal="false" aria-label="${escapeHtml(cfg.title)} chat">
        <div class="header">
          <div class="avatar">${ROBOT_SVG}<span class="dot"></span></div>
          <div class="title"><h3>${escapeHtml(cfg.title)}</h3><p>Online · Replies instantly</p></div>
          <button class="icon-btn reset" type="button" title="New conversation" aria-label="New conversation">${ICONS.reset}</button>
          <button class="icon-btn close" type="button" title="Close" aria-label="Close chat">${ICONS.close}</button>
        </div>
        <div class="messages" aria-live="polite"></div>
        <form>
          <div class="composer">
            <textarea rows="1" placeholder="Message ${escapeHtml(cfg.title)}…" aria-label="Message" enterkeyhint="send"></textarea>
            <button class="send" type="submit" aria-label="Send" disabled>${ICONS.send}</button>
          </div>
        </form>
        <div class="footer">Powered by Gemini · AI can make mistakes</div>
      </div>
      <span class="tooltip">Hi! Need any help? 👋</span>
      <button class="launcher" type="button" aria-label="Open chat">
        <span class="when-closed">${ROBOT_SVG}</span>
        <span class="when-open">${ICONS.down}</span>
      </button>
    </div>`;

  const wrap = root.querySelector(".wrap");
  const panel = root.querySelector(".panel");
  const launcher = root.querySelector(".launcher");
  const list = root.querySelector(".messages");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const sendBtn = root.querySelector(".send");
  const mobile = window.matchMedia(MOBILE_QUERY);

  let history = loadHistory(); // [{role: "user"|"bot", text}]
  let busy = false;
  let savedOverflow = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }

  // Tiny, safe markdown: escape first, then format code, headings, bold, italics, lists, links.
  function renderMarkdown(text) {
    let html = escapeHtml(text.trim());
    html = html.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    html = html.replace(/^#{1,6} (.+)$/gm, "<strong>$1</strong>");
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/^\s*[-*] /gm, "• ");
    html = html.replace(/^\s*(-{3,}|\*{3,})\s*$/gm, "");
    html = html.replace(/\n{3,}/g, "\n\n");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return html;
  }

  function loadHistory() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }
  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40)));
    } catch {}
  }

  function scrollDown() {
    list.scrollTop = list.scrollHeight;
  }

  function addRow(role, html) {
    const row = document.createElement("div");
    row.className = `row ${role}`;
    if (role === "bot") row.innerHTML = `<div class="mini">${ROBOT_SVG}</div>`;
    const col = document.createElement("div");
    col.className = "col";
    const msg = document.createElement("div");
    msg.className = "msg";
    msg.innerHTML = html;
    col.appendChild(msg);
    row.appendChild(col);
    list.appendChild(row);
    scrollDown();
    return row;
  }

  function addBubble(role, text, isError, sources) {
    const row = addRow(role, role === "bot" ? renderMarkdown(text) : escapeHtml(text));
    if (isError) row.querySelector(".msg").classList.add("error");
    if (cfg.showSources && sources?.length) {
      // Documents the answer was based on (from the knowledge base / RAG).
      const list = document.createElement("div");
      list.className = "sources";
      list.innerHTML = sources.map((s) => `<span class="source">${escapeHtml(s)}</span>`).join("");
      row.querySelector(".msg").appendChild(list);
    }
    if (role === "bot" && !isError) addCopyButton(row, text);
    return row;
  }

  function addCopyButton(row, text) {
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.innerHTML = `<button class="copy" type="button" aria-label="Copy reply">${ICONS.copy}<span>Copy</span></button>`;
    const btn = actions.querySelector(".copy");
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return;
      }
      btn.classList.add("done");
      btn.innerHTML = `${ICONS.check}<span>Copied</span>`;
      setTimeout(() => {
        btn.classList.remove("done");
        btn.innerHTML = `${ICONS.copy}<span>Copy</span>`;
      }, 1600);
    });
    row.classList.add("has-actions");
    row.querySelector(".col").appendChild(actions);
  }

  function renderIntro() {
    const intro = document.createElement("div");
    intro.className = "intro";
    intro.innerHTML = `
      <div class="big">${ROBOT_SVG}</div>
      <h4>Hi there 👋<span>How can I help?</span></h4>
      <p>${escapeHtml(cfg.welcome)}</p>`;
    list.appendChild(intro);
  }

  function renderChips() {
    if (!cfg.suggestions.length) return;
    const chips = document.createElement("div");
    chips.className = "chips";
    chips.innerHTML = `<div class="chips-label">Suggested</div>`;
    cfg.suggestions.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.innerHTML = `<span>${escapeHtml(s)}</span>${ICONS.arrow}`;
      b.addEventListener("click", () => send(s));
      chips.appendChild(b);
    });
    list.appendChild(chips);
  }

  function renderAll() {
    list.innerHTML = "";
    renderIntro();
    if (history.length === 0) renderChips();
    history.forEach((m) => addBubble(m.role, m.text, false, m.sources));
  }

  function showTyping() {
    const row = addRow("bot", "<span></span><span></span><span></span>");
    row.querySelector(".msg").classList.add("typing");
    return row;
  }

  function updateSendState() {
    sendBtn.disabled = busy || !input.value.trim();
  }

  async function send(text) {
    if (busy || !text.trim()) return;
    busy = true;
    updateSendState();
    list.querySelector(".chips")?.remove();
    history.push({ role: "user", text });
    saveHistory();
    addBubble("user", text);
    const typing = showTyping();

    try {
      const res = await fetch(`${cfg.api}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      // FastAPI sends errors as {detail: "..."}.
      const message = data.error || (typeof data.detail === "string" ? data.detail : "");
      if (!res.ok) throw new Error(message || `Request failed (${res.status})`);
      history.push({ role: "bot", text: data.reply, sources: data.sources || [] });
      saveHistory();
      // Scroll to the start of the reply so long answers are read from the top.
      const row = addBubble("bot", data.reply, false, data.sources);
      list.scrollTop = Math.min(list.scrollHeight, row.offsetTop - 16);
    } catch (err) {
      typing.remove();
      // Drop the failed user turn so the conversation stays valid for the next try.
      history.pop();
      saveHistory();
      addBubble("bot", err.message || "Something went wrong. Please try again.", true);
    } finally {
      busy = false;
      updateSendState();
      if (!mobile.matches) input.focus();
    }
  }

  // On phones, size the sheet to the visible viewport so the on-screen keyboard never hides the input.
  function fitToViewport() {
    const vv = window.visualViewport;
    if (!mobile.matches || !wrap.classList.contains("open") || !vv) {
      panel.style.height = "";
      panel.style.top = "";
      return;
    }
    panel.style.height = `${vv.height}px`;
    panel.style.top = `${vv.offsetTop}px`;
    scrollDown();
  }

  // Stop the page behind the full-screen sheet from scrolling on phones.
  function lockPageScroll(lock) {
    const el = document.documentElement;
    if (lock && savedOverflow === null) {
      savedOverflow = el.style.overflow;
      el.style.overflow = "hidden";
    } else if (!lock && savedOverflow !== null) {
      el.style.overflow = savedOverflow;
      savedOverflow = null;
    }
  }

  function toggle(open) {
    const isOpen = open ?? !wrap.classList.contains("open");
    wrap.classList.toggle("open", isOpen);
    wrap.classList.add("seen");
    launcher.setAttribute("aria-label", isOpen ? "Close chat" : "Open chat");
    lockPageScroll(isOpen && mobile.matches);
    fitToViewport();
    if (isOpen) {
      scrollDown();
      // Don't pop the keyboard up automatically on phones.
      if (!mobile.matches) setTimeout(() => input.focus(), 200);
    } else {
      input.blur();
    }
  }

  launcher.addEventListener("click", () => toggle());
  root.querySelector(".close").addEventListener("click", () => toggle(false));
  root.querySelector(".reset").addEventListener("click", () => {
    history = [];
    saveHistory();
    renderAll();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = "";
    input.style.height = "auto";
    send(text);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !mobile.matches) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    updateSendState();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wrap.classList.contains("open")) toggle(false);
  });
  // Shadow under the header once the welcome band scrolls away.
  list.addEventListener("scroll", () => wrap.classList.toggle("scrolled", list.scrollTop > 8), { passive: true });
  window.visualViewport?.addEventListener("resize", fitToViewport);
  window.visualViewport?.addEventListener("scroll", fitToViewport);
  mobile.addEventListener?.("change", () => {
    lockPageScroll(wrap.classList.contains("open") && mobile.matches);
    fitToViewport();
  });

  // Small public API: window.GeminiChat.open() / .close()
  window.GeminiChat = { open: () => toggle(true), close: () => toggle(false) };

  renderAll();
  const mount = () => document.body.appendChild(host);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
