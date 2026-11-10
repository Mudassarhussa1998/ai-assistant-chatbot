/*
 * AI Chat Widget — drop into any website with one line:
 *   <script src="https://YOUR-SERVER/widget.js" defer></script>
 *
 * Optional attributes on the script tag:
 *   data-title="Support Bot"            header title
 *   data-color="#556b2f"                accent color (olive green by default)
 *   data-welcome="Hi! How can I help?"  intro text
 *   data-suggestions="A|B|C"            quick-reply chips, separated by |
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
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
    button { font: inherit; -webkit-tap-highlight-color: transparent; }
    .wrap {
      --ink: #2b2d29; --muted: #6b6f68; --line: #e2e3df; --soft: #f1f2ef;
      --robot-face: var(--accent);
      --safe-b: env(safe-area-inset-bottom, 0px); --safe-t: env(safe-area-inset-top, 0px);
    }
    .robot { width: 28px; height: 28px; display: block; }

    /* ---------- Launcher ---------- */
    .launcher {
      position: fixed; right: 24px; bottom: 24px; z-index: 2147483646;
      width: 60px; height: 60px; border-radius: 50%; border: none; cursor: pointer;
      background: var(--accent); color: #fff; display: grid; place-items: center;
      box-shadow: 0 1px 2px rgba(0,0,0,.2), 0 10px 30px -4px rgba(0,0,0,.35);
      transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
    }
    .launcher:hover { transform: scale(1.07); }
    .launcher:active { transform: scale(.95); }
    .launcher::after {
      content: ""; position: absolute; inset: 0; border-radius: 50%;
      box-shadow: 0 0 0 0 var(--accent); opacity: .35; animation: pulse 2.6s ease-out infinite;
    }
    .launcher > span { grid-area: 1 / 1; display: grid; place-items: center; transition: transform .3s, opacity .2s; }
    .launcher .when-open { opacity: 0; transform: rotate(-90deg) scale(.6); }
    .open .launcher .when-closed { opacity: 0; transform: rotate(90deg) scale(.6); }
    .open .launcher .when-open { opacity: 1; transform: none; }
    .open .launcher::after, .seen .launcher::after { animation: none; }
    .launcher .eye { animation: blink 4.5s infinite; transform-origin: center; transform-box: fill-box; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 var(--accent); opacity: .35; } 100% { box-shadow: 0 0 0 16px var(--accent); opacity: 0; } }
    @keyframes blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }

    .tooltip {
      position: fixed; right: 96px; bottom: 37px; z-index: 2147483646;
      background: #fff; color: var(--ink); font-size: 13.5px; font-weight: 500; padding: 9px 14px;
      border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.12);
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
      position: fixed; right: 24px; bottom: 98px; z-index: 2147483647;
      width: 400px; height: 640px; max-height: calc(100vh - 122px);
      background: #fff; color: var(--ink); border-radius: 24px; overflow: hidden;
      box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 4px 12px rgba(0,0,0,.06), 0 30px 80px -10px rgba(0,0,0,.3);
      display: flex; flex-direction: column;
      opacity: 0; visibility: hidden; transform: translateY(16px) scale(.96); transform-origin: bottom right;
      transition: opacity .2s ease, transform .3s cubic-bezier(.2,.9,.3,1), visibility 0s .3s;
    }
    .open .panel { opacity: 1; visibility: visible; transform: none; transition: opacity .2s ease, transform .3s cubic-bezier(.2,.9,.3,1); }

    .header {
      display: flex; align-items: center; gap: 12px; padding: 16px 14px 16px 18px;
      background: var(--accent); color: #fff;
      background-image: linear-gradient(135deg, rgba(255,255,255,.1), rgba(255,255,255,0) 60%);
    }
    .avatar {
      position: relative; width: 40px; height: 40px; border-radius: 13px; background: #fff; color: var(--accent);
      display: grid; place-items: center; flex-shrink: 0; --robot-face: #fff;
    }
    .avatar .robot { width: 25px; height: 25px; }
    .avatar .dot {
      position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px; border-radius: 50%;
      background: #22c55e; border: 2.5px solid var(--accent);
    }
    .title { min-width: 0; flex: 1; }
    .title h3 { font-size: 15.5px; font-weight: 650; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title p { margin-top: 2px; font-size: 12.5px; color: rgba(255,255,255,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .icon-btn {
      width: 36px; height: 36px; border-radius: 11px; border: none; flex-shrink: 0;
      background: transparent; color: rgba(255,255,255,.85); cursor: pointer; display: grid; place-items: center;
      transition: background .15s, color .15s;
    }
    .icon-btn:hover { background: rgba(255,255,255,.12); color: #fff; }

    /* ---------- Messages ---------- */
    .messages {
      position: relative; flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 22px 18px 12px;
      display: flex; flex-direction: column; gap: 14px; background: #fff;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 3px; }

    .intro { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 10px 8px 6px; }
    .intro .big {
      width: 64px; height: 64px; border-radius: 20px; background: var(--accent); color: #fff;
      display: grid; place-items: center; margin-bottom: 14px; --robot-face: var(--accent);
      box-shadow: 0 10px 24px -8px rgba(0,0,0,.4);
    }
    .intro .big .robot { width: 38px; height: 38px; }
    .intro h4 { font-size: 18px; font-weight: 700; letter-spacing: -.02em; }
    .intro p { margin-top: 6px; font-size: 14px; color: var(--muted); line-height: 1.5; max-width: 260px; }

    .chips { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
    .chip {
      display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
      text-align: left; border: 1px solid var(--line); background: #fff; color: var(--ink);
      border-radius: 14px; padding: 12px 14px; font-size: 14px; font-weight: 500; cursor: pointer;
      transition: border-color .15s, background .15s, transform .15s;
    }
    .chip svg { color: var(--muted); flex-shrink: 0; transition: transform .15s, color .15s; }
    .chip:hover { border-color: var(--accent); background: #f3f5ee; }
    .chip:hover svg { color: var(--accent); transform: translateX(3px); }
    .chip:active { transform: scale(.99); }

    .row { display: flex; gap: 8px; align-items: flex-end; animation: pop .28s cubic-bezier(.2,.9,.3,1) both; }
    .row.user { justify-content: flex-end; }
    .mini {
      width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: #fff;
      display: grid; place-items: center; flex-shrink: 0; --robot-face: var(--accent);
    }
    .mini .robot { width: 18px; height: 18px; }
    @keyframes pop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

    .msg {
      max-width: 80%; padding: 10px 14px; border-radius: 18px; font-size: 14.5px; line-height: 1.55;
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .bot .msg { background: var(--soft); color: var(--ink); border-bottom-left-radius: 6px; }
    .messages { background: #fafaf8; }
    .footer, form { background: #fafaf8; }
    .user .msg { background: var(--accent); color: #fff; border-bottom-right-radius: 6px; }
    .msg.error { background: #fff; box-shadow: inset 0 0 0 1px #fca5a5; color: #b91c1c; }
    .msg strong { font-weight: 650; }
    .msg code { background: rgba(0,0,0,.07); padding: 1px 5px; border-radius: 5px; font-family: ui-monospace, Menlo, monospace; font-size: 13px; }
    .msg pre { background: #3a3d37; color: #f5f5f5; padding: 10px 12px; border-radius: 10px; overflow-x: auto; white-space: pre; margin: 6px 0; }
    .msg pre code { background: none; padding: 0; color: inherit; }
    .msg a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .typing { display: flex; gap: 4px; padding: 15px 16px; }
    .typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: bounce 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: .15s; }
    .typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes bounce { 0%,60%,100% { transform: translateY(0); opacity: .2; } 30% { transform: translateY(-4px); opacity: .8; } }

    /* ---------- Composer ---------- */
    form { padding: 10px 14px 6px; background: #fff; }
    .composer {
      display: flex; align-items: flex-end; gap: 8px; background: var(--soft);
      border: 1px solid transparent; border-radius: 24px; padding: 5px 5px 5px 16px;
      transition: border-color .15s, background .15s, box-shadow .15s;
    }
    .composer:focus-within { background: #fff; border-color: var(--accent); box-shadow: 0 0 0 4px rgba(85,107,47,.12); }
    textarea {
      flex: 1; resize: none; border: none; outline: none; padding: 9px 0; background: transparent;
      font-size: 14.5px; line-height: 1.4; max-height: 120px; color: var(--ink);
    }
    textarea::placeholder { color: #a1a1aa; }
    .send {
      width: 38px; height: 38px; flex-shrink: 0; border: none; border-radius: 50%;
      background: var(--accent); color: #fff; cursor: pointer; display: grid; place-items: center;
      transition: opacity .15s, transform .15s;
    }
    .send:hover:not(:disabled) { transform: scale(1.06); }
    .send:disabled { opacity: .2; cursor: default; }
    .footer { text-align: center; font-size: 11px; color: #a1a1aa; padding: 4px 0 12px; background: #fff; }

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
      .header { padding: calc(12px + var(--safe-t)) 10px 12px 16px; }
      .icon-btn { width: 42px; height: 42px; }
      .messages { padding: 18px 14px 10px; }
      .msg { max-width: 85%; font-size: 15px; }
      textarea { font-size: 16px; } /* 16px stops iOS from zooming on focus */
      .send { width: 40px; height: 40px; }
      form { padding: 8px 12px calc(8px + var(--safe-b)); border-top: 1px solid var(--line); }
      .footer { display: none; }
      .chip { padding: 14px 16px; font-size: 15px; }
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
    const msg = document.createElement("div");
    msg.className = "msg";
    msg.innerHTML = html;
    row.appendChild(msg);
    list.appendChild(row);
    scrollDown();
    return row;
  }

  function addBubble(role, text, isError) {
    const row = addRow(role, role === "bot" ? renderMarkdown(text) : escapeHtml(text));
    if (isError) row.querySelector(".msg").classList.add("error");
    return row;
  }

  function renderIntro() {
    const intro = document.createElement("div");
    intro.className = "intro";
    intro.innerHTML = `
      <div class="big">${ROBOT_SVG}</div>
      <h4>Hi, I'm your ${escapeHtml(cfg.title)} 👋</h4>
      <p>${escapeHtml(cfg.welcome)}</p>`;
    list.appendChild(intro);
  }

  function renderChips() {
    if (!cfg.suggestions.length) return;
    const chips = document.createElement("div");
    chips.className = "chips";
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
    history.forEach((m) => addBubble(m.role, m.text));
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
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      history.push({ role: "bot", text: data.reply });
      saveHistory();
      // Scroll to the start of the reply so long answers are read from the top.
      const row = addBubble("bot", data.reply);
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
  document.body ? mount() : document.addEventListener("DOMContentLoaded", mount);
})();
