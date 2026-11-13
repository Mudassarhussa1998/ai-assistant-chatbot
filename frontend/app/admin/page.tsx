"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./admin.module.css";

type Doc = { name: string; size: number; chunks: number; updated_at: string };
type Listing = { documents: Doc[]; total_chunks: number };
type Toast = { id: number; kind: "ok" | "error"; text: string };

const TOKEN_KEY = "ai-assistant-admin-token";
const ACCEPT = ".md,.txt,.pdf,.docx";

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function saveToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

function timeAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

function extension(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}

// Calls the admin API (proxied to the FastAPI backend) with the admin password.
async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : `Request failed (${res.status})`;
    throw Object.assign(new Error(detail), { status: res.status });
  }
  return data as T;
}

function Robot({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="7" x2="32" y2="14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="6" r="3.5" fill="currentColor" />
      <rect x="12" y="14" width="40" height="32" rx="11" fill="currentColor" />
      <rect x="6" y="25" width="4.5" height="11" rx="2.25" fill="currentColor" />
      <rect x="53.5" y="25" width="4.5" height="11" rx="2.25" fill="currentColor" />
      <circle cx="24.5" cy="29" r="4" fill="var(--robot-face, #556b2f)" />
      <circle cx="39.5" cy="29" r="4" fill="var(--robot-face, #556b2f)" />
      <path d="M25 37.5 q7 4.5 14 0" stroke="var(--robot-face, #556b2f)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="21" y="49" width="22" height="9" rx="4.5" fill="currentColor" />
    </svg>
  );
}

const Icon = {
  upload: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M20 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  ),
  chat: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
    </svg>
  ),
  eye: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/health")
      .then((res) => setOnline(res.ok))
      .catch(() => setOnline(false));
  }, [token, listing]);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const logout = useCallback(() => {
    saveToken("");
    setToken("");
    setListing(null);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      const error = err as Error & { status?: number };
      if (error.status === 401) logout();
      toast("error", error.message);
    },
    [logout, toast],
  );

  const load = useCallback(
    async (t: string) => {
      try {
        setListing(await api<Listing>(t, "/documents"));
      } catch (err) {
        handleError(err);
      }
    },
    [handleError],
  );

  useEffect(() => {
    const saved = readToken();
    if (!saved) return;
    // Restore the session after a reload.
    let cancelled = false;
    api<Listing>(saved, "/documents")
      .then((data) => {
        if (cancelled) return;
        setToken(saved);
        setListing(data);
      })
      .catch(() => saveToken(""));
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(label: string, action: () => Promise<Listing>, success: string) {
    setBusy(label);
    try {
      setListing(await action());
      toast("ok", success);
      return true;
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setBusy("");
    }
  }

  const toastStack = (
    <div className={styles.toasts} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={t.kind === "ok" ? styles.toastOk : styles.toastError} role="status">
          <span className={styles.toastDot} />
          {t.text}
        </div>
      ))}
    </div>
  );

  if (!token)
    return (
      <>
        <Login
          onLogin={(t) => {
            saveToken(t);
            setToken(t);
            load(t);
          }}
        />
        {toastStack}
      </>
    );

  const docs = listing?.documents ?? [];
  const visible = docs.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()));
  const totalSize = docs.reduce((sum, d) => sum + d.size, 0);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            <span className={styles.logo}>
              <Robot />
            </span>
            <div>
              <strong>AI Assistant</strong>
              <span>Admin</span>
            </div>
          </div>
          <div className={styles.topActions}>
            {online !== null && (
              <span className={`${styles.status} ${online ? "" : styles.statusOff}`}>
                <span className={styles.statusDot} />
                {online ? "Assistant online" : "Assistant offline"}
              </span>
            )}
            <button
              className={styles.ghost}
              onClick={() => (window as { GeminiChat?: { open: () => void } }).GeminiChat?.open()}
            >
              {Icon.chat}
              <span className={styles.hideSm}>Test assistant</span>
            </button>
            <button className={styles.ghost} onClick={logout} aria-label="Log out">
              {Icon.logout}
              <span className={styles.hideSm}>Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className={styles.page}>
        <div className={styles.pageHead}>
          <h1>Knowledge base</h1>
          <p>Everything the assistant knows about your business. Changes are live immediately.</p>
        </div>

        <div className={styles.stats}>
          <Stat label="Documents" value={listing ? String(docs.length) : "—"} />
          <Stat label="Indexed sections" value={listing ? String(listing.total_chunks) : "—"} />
          <Stat label="Total size" value={listing ? formatSize(totalSize) : "—"} />
        </div>

        <div className={styles.grid}>
          <Uploader
            busy={busy === "upload"}
            onUpload={(files) => {
              const form = new FormData();
              files.forEach((f) => form.append("files", f));
              return run(
                "upload",
                () => api<Listing>(token, "/documents", { method: "POST", body: form }),
                `Added ${files.length} file${files.length > 1 ? "s" : ""}. The assistant can use ${files.length > 1 ? "them" : "it"} now.`,
              );
            }}
          />
          <TextEditor
            busy={busy === "text"}
            onSave={(title, content) =>
              run(
                "text",
                () =>
                  api<Listing>(token, "/documents/text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, content }),
                  }),
                `Saved "${title}". The assistant can use it now.`,
              )
            }
          />
        </div>

        <section className={styles.card}>
          <div className={styles.listHead}>
            <div>
              <h2>Documents</h2>
              <p className={styles.muted}>Files the assistant answers from</p>
            </div>
            {docs.length > 0 && (
              <label className={styles.search}>
                {Icon.search}
                <input
                  type="search"
                  placeholder="Search documents"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}
          </div>

          {!listing ? (
            <div className={styles.skeletons}>
              <span />
              <span />
            </div>
          ) : docs.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>{Icon.upload}</span>
              <strong>No documents yet</strong>
              <p className={styles.muted}>Upload a file or write a document above to teach the assistant.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className={styles.noMatch}>No documents match &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className={styles.docs}>
              {visible.map((doc) => {
                const deleting = busy === `delete:${doc.name}`;
                const ext = extension(doc.name);
                return (
                  <li key={doc.name} className={styles.doc}>
                    <span className={`${styles.ext} ${styles[`ext_${ext}`] || ""}`}>{ext}</span>
                    <div className={styles.docInfo}>
                      <strong title={doc.name}>{doc.name}</strong>
                      <span className={styles.muted}>
                        {formatSize(doc.size)} · {doc.chunks} section{doc.chunks === 1 ? "" : "s"} · updated{" "}
                        <time dateTime={doc.updated_at} title={new Date(doc.updated_at).toLocaleString()}>
                          {timeAgo(doc.updated_at)}
                        </time>
                      </span>
                    </div>
                    {confirming === doc.name ? (
                      <div className={styles.confirm}>
                        <button className={styles.ghostSm} onClick={() => setConfirming("")} disabled={deleting}>
                          Cancel
                        </button>
                        <button
                          className={styles.dangerSm}
                          disabled={deleting}
                          onClick={async () => {
                            await run(
                              `delete:${doc.name}`,
                              () =>
                                api<Listing>(token, `/documents/${doc.name.split("/").map(encodeURIComponent).join("/")}`, {
                                  method: "DELETE",
                                }),
                              `Deleted "${doc.name}".`,
                            );
                            setConfirming("");
                          }}
                        >
                          {deleting ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.iconBtn}
                        onClick={() => setConfirming(doc.name)}
                        aria-label={`Delete ${doc.name}`}
                        title="Delete"
                      >
                        {Icon.trash}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      {toastStack}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [show, setShow] = useState(false);

  return (
    <div className={styles.loginWrap}>
      <form
        className={styles.login}
        onSubmit={async (e) => {
          e.preventDefault();
          setChecking(true);
          setError("");
          try {
            await api(value, "/verify");
            onLogin(value);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setChecking(false);
          }
        }}
      >
        <span className={styles.loginLogo}>
          <Robot size={30} />
        </span>
        <h1>Welcome back</h1>
        <p className={styles.muted}>Sign in to manage what your AI assistant knows.</p>
        <label className={styles.field}>
          <span>Admin password</span>
          <span className={styles.passwordWrap}>
            <input
              type={show ? "text" : "password"}
              placeholder="Enter your admin password"
              autoComplete="current-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
            >
              {Icon.eye}
            </button>
          </span>
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.primary} disabled={!value || checking}>
          {checking ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function Uploader({ busy, onUpload }: { busy: boolean; onUpload: (files: File[]) => Promise<boolean> }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const send = (list: FileList | null) => {
    const files = Array.from(list || []);
    if (files.length && !busy) onUpload(files);
    if (input.current) input.current.value = "";
  };

  return (
    <section className={styles.card}>
      <h2>Upload files</h2>
      <p className={styles.muted}>Price lists, FAQs, policies, product guides…</p>
      <div
        role="button"
        tabIndex={0}
        className={`${styles.drop} ${dragging ? styles.dropActive : ""} ${busy ? styles.dropBusy : ""}`}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!busy) input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          send(e.dataTransfer.files);
        }}
      >
        <span className={styles.dropIcon}>{busy ? <span className={styles.spinner} /> : Icon.upload}</span>
        <strong>{busy ? "Uploading and indexing…" : "Drop files here or click to browse"}</strong>
        <span className={styles.muted}>Up to 10 MB each</span>
        <span className={styles.types}>
          {["pdf", "docx", "md", "txt"].map((t) => (
            <span key={t} className={`${styles.typePill} ${styles[`ext_${t}`] || ""}`}>
              {t}
            </span>
          ))}
        </span>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => send(e.target.files)} />
      </div>
    </section>
  );
}

function TextEditor({ busy, onSave }: { busy: boolean; onSave: (title: string, content: string) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  return (
    <section className={styles.card}>
      <h2>Write a document</h2>
      <p className={styles.muted}>Type or paste text, like your return policy or opening hours.</p>
      <form
        className={styles.editor}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onSave(title.trim(), content)) {
            setTitle("");
            setContent("");
          }
        }}
      >
        <input placeholder="Title, e.g. Return policy" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <textarea
          placeholder="Paste your policy, FAQ, terms or any information the assistant should know…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
        />
        <div className={styles.editorFoot}>
          <span className={styles.muted}>{content.length.toLocaleString()} characters</span>
          <button className={styles.primary} disabled={busy || !title.trim() || !content.trim()}>
            {busy ? "Saving…" : "Save document"}
          </button>
        </div>
      </form>
    </section>
  );
}
