/**
 * generate-overview.ts
 *
 * Output:
 *  - out/index.html
 *  - out/index-YYYY.html (pro Jahr)
 *
 * Input:
 *  - out/tickets/ticket-<id>/ticket.json
 *  - out/tickets/ticket-<id>/articles.json
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const TICKETS_DIR = "out/tickets";
const OUT_DIR = "out";
const PREVIEW_MAX = 128;

type AuthorRole = "customer" | "agent" | "unknown";

type TicketEntry = {
    id: number;
    title: string;
    createdAt?: string;
    year: number | "unknown";
    author: string;
    role: AuthorRole;
    preview: string; // (kann bei dir bewusst unescaped sein)
};

/* ---------------- Helpers ---------------- */

function escapeHtml(s: string) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function cleanText(v: unknown): string {
    if (typeof v !== "string") return "";
    return v.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number) {
    return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

function formatDate(iso?: string): string {
    if (!iso) return "(kein Datum)";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "(ungültig)";
    return d.toLocaleDateString("de-DE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
}

function yearFromDate(iso?: string): number | "unknown" {
    if (!iso) return "unknown";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "unknown" : d.getFullYear();
}

async function readJson(path: string): Promise<any | null> {
    try {
        return JSON.parse(await readFile(path, "utf-8"));
    } catch {
        return null;
    }
}

/* ---------------- Derivations ---------------- */

/**
 * Autorname (best effort):
 *  - bevorzugt: erster Artikel -> from
 *  - fallback: ticket.created_by.fullname/name (falls vorhanden)
 */
function deriveAuthor(ticket: any, articles: any[] | null): string {
    if (Array.isArray(articles) && articles.length > 0) {
        const from = cleanText(articles[0]?.from);
        if (from) return from;
    }

    const name =
        cleanText(ticket?.created_by?.fullname) ||
        cleanText(ticket?.created_by?.name) ||
        cleanText(ticket?.created_by?.login) ||
        cleanText(ticket?.created_by?.email);

    return name || "(unbekannt)";
}

/**
 * Customer vs Agent (best effort, ohne API):
 * Prüft diverse mögliche Feldnamen im ersten Artikel.
 */
function deriveRole(ticket: any, articles: any[] | null): AuthorRole {
    const first = Array.isArray(articles) && articles.length > 0 ? articles[0] : null;

    const candidates: unknown[] = [
        first?.sender,         // häufig "Customer" / "Agent"
        first?.sender_type,    // manchmal "customer"/"agent"
        first?.type,           // je nach Setup
        first?.created_by?.role,
        first?.created_by?.type,
    ];

    for (const c of candidates) {
        const s = cleanText(c).toLowerCase();
        if (!s) continue;
        if (s.includes("customer")) return "customer";
        if (s.includes("agent")) return "agent";
    }

    // kleine Heuristik: wenn ticket.customer_id vorhanden ist und owner_id != null,
    // heißt das nicht sicher "Agent", aber manchmal hilfreich. Standard: unknown.
    return "unknown";
}

/**
 * Vorschau (max 128):
 *  - nimmt den ersten Artikel body/body_html (strip tags)
 */
function derivePreview(articles: any[] | null): string {
    if (!Array.isArray(articles)) return "(keine Vorschau)";

    for (const a of articles) {
        const body =
            cleanText(a?.body) ||
            cleanText(
                typeof a?.body_html === "string"
                    ? a.body_html.replace(/<[^>]+>/g, " ")
                    : ""
            );
        if (body) return truncate(body, PREVIEW_MAX);
    }

    return "(keine Vorschau)";
}

/* ---------------- HTML builders ---------------- */

function roleLabel(role: AuthorRole) {
    if (role === "customer") return "Customer";
    if (role === "agent") return "Agent";
    return "Unbekannt";
}

function buildYearHtml(year: number | "unknown", tickets: TicketEntry[]) {
    const title =
        year === "unknown"
            ? "Ticket-Export – Unbekanntes Jahr"
            : `Ticket-Export – ${year}`;

    // data-search enthält text für Live-Suche (klein geschrieben)
    const items = tickets
        .map((t) => {
            const searchText = `${t.id} ${t.title} ${t.author} ${t.preview} ${formatDate(t.createdAt)} ${roleLabel(t.role)}`
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();

            const roleClass = `role-${t.role}`;
            return `<li class="item ${roleClass}" data-search="${escapeHtml(searchText)}">
        <div class="top">
          <a href="tickets/ticket-${t.id}/index.html">
            <strong>#${t.id}</strong> – ${escapeHtml(t.title)}
          </a>
          <span class="badge ${roleClass}">${escapeHtml(roleLabel(t.role))}</span>
        </div>
        <div class="meta">
          <span>Erstellt: ${escapeHtml(formatDate(t.createdAt))}</span>
          <span>Autor: ${escapeHtml(t.author)}</span>
        </div>
        <div class="preview"><pre>${t.preview}</pre></div>
      </li>`;
        })
        .join("\n");

    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; line-height: 1.45; }
  h1 { margin: 0 0 10px; font-size: 22px; }
  .toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 10px 0 14px; }
  .search { flex: 1; min-width: 260px; }
  input[type="search"] { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(127,127,127,.45); background: transparent; }
  .count { font-size: 12px; opacity: .8; }
  .list { list-style: none; padding: 0; margin: 0; max-width: 1100px; }
  .item { border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 12px 14px; margin: 10px 0; }
  .top { display: flex; gap: 10px; align-items: baseline; justify-content: space-between; }
  .top a { text-decoration: none; }
  .top a:hover { text-decoration: underline; }
  .meta { font-size: 12px; opacity: .8; display: flex; gap: 14px; flex-wrap: wrap; margin-top: 4px; }
  .preview { margin-top: 8px; opacity: .95; }
  .preview pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 12px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,.45); opacity: .95; }

  /* farbliche Unterscheidung */
  .role-customer { border-left: 6px solid #2e7d32; }
  .role-agent    { border-left: 6px solid #1565c0; }
  .role-unknown  { border-left: 6px solid rgba(127,127,127,.6); }

  .badge.role-customer { background: rgba(46,125,50,.12); }
  .badge.role-agent    { background: rgba(21,101,192,.12); }
  .badge.role-unknown  { background: rgba(127,127,127,.12); }

  .nav { margin-top: 14px; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>

  <div class="toolbar">
    <div class="search">
      <input id="q" type="search" placeholder="Live-Suche (Titel, Autor, Vorschau, #ID …)" autocomplete="off" />
    </div>
    <div class="count">
      <span id="shown">${tickets.length}</span> / <span id="total">${tickets.length}</span>
    </div>
  </div>

  <ul id="list" class="list">
    ${items}
  </ul>

  <div class="nav">
    <a href="index.html">← Jahresübersicht</a>
  </div>

<script>
(() => {
  const q = document.getElementById('q');
  const list = document.getElementById('list');
  const shown = document.getElementById('shown');
  const total = document.getElementById('total');

  const items = Array.from(list.querySelectorAll('li.item'));
  total.textContent = String(items.length);

  function apply() {
    const needle = (q.value || '').toLowerCase().trim();
    let visible = 0;

    for (const li of items) {
      const hay = (li.getAttribute('data-search') || '');
      const ok = needle === '' || hay.includes(needle);
      li.style.display = ok ? '' : 'none';
      if (ok) visible++;
    }
    shown.textContent = String(visible);
  }

  q.addEventListener('input', apply);
  apply();
})();
</script>
</body>
</html>`;
}

function buildLandingHtml(years: Array<number | "unknown">) {
    const links =
        years.length === 0
            ? `<p>Keine Jahresübersichten gefunden.</p>`
            : `<ul>
          ${years
                .map((y) => {
                    const file = y === "unknown" ? "index-unknown.html" : `index-${y}.html`;
                    const label = y === "unknown" ? "Unbekanntes Jahr" : String(y);
                    return `<li><a href="${file}">${escapeHtml(label)}</a></li>`;
            })
            .join("\n")}
        </ul>`;

                    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ticket-Export – Übersicht</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; line-height: 1.45; }
  h1 { margin: 0 0 10px; font-size: 22px; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <h1>Ticket-Export – Jahresübersicht</h1>
  ${links}
</body>
</html>`;
                }

                /* ---------------- Main ---------------- */

            async function main() {
            const dirs = await readdir(TICKETS_DIR, { withFileTypes: true });

            const tickets: TicketEntry[] = [];

            for (const d of dirs) {
            if (!d.isDirectory() || !d.name.startsWith("ticket-")) continue;

            const id = Number(d.name.slice(7));
            if (!Number.isFinite(id)) continue;

            const base = join(TICKETS_DIR, d.name);
            const ticket = await readJson(join(base, "ticket.json"));
            const articles = (await readJson(join(base, "articles.json"))) as any[] | null;

            const title = cleanText(ticket?.title) || cleanText(ticket?.subject) || "(ohne Titel)";
            const createdAt = typeof ticket?.created_at === "string" ? ticket.created_at : undefined;

            tickets.push({
            id,
            title,
            createdAt,
            year: yearFromDate(createdAt),
            author: deriveAuthor(ticket, articles),
            role: deriveRole(ticket, articles),
            preview: derivePreview(articles),
            });
            }

                // Gruppieren nach Jahr
            const byYear = new Map<number | "unknown", TicketEntry[]>();
            for (const t of tickets) {
            const arr = byYear.get(t.year) ?? [];
            arr.push(t);
            byYear.set(t.year, arr);
            }

            const years = Array.from(byYear.keys()).sort((a, b) => {
            if (a === "unknown") return 1;
            if (b === "unknown") return -1;
            return b - a;
            });

                // Jahresseiten schreiben
            for (const y of years) {
            const list = byYear.get(y)!;

                // neueste zuerst (created_at), fallback id
            list.sort((a, b) => {
            const da = a.createdAt ? Date.parse(a.createdAt) : -Infinity;
            const db = b.createdAt ? Date.parse(b.createdAt) : -Infinity;
            if (da !== db) return db - da;
            return a.id - b.id;
            });

            const name = y === "unknown" ? "index-unknown.html" : `index-${y}.html`;
    await writeFile(join(OUT_DIR, name), buildYearHtml(y, list), "utf-8");
    }

        // Landing page
    await writeFile(join(OUT_DIR, "index.html"), buildLandingHtml(years), "utf-8");

    console.log(`✅ Übersichten erstellt (${years.length} Jahre)`);
    }

    main().catch((e) => {
    console.error("❌ Fehler:", e);
    process.exitCode = 1;
    });
