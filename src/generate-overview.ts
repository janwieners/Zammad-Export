/**
 * generate-overview.ts
 *
 * Erzeugt:
 *  - out/index.html              (Landing-Page mit Jahreslinks)
 *  - out/index-YYYY.html         (eine Übersicht pro Jahr)
 *
 * Liest Daten aus:
 *  - out/tickets/ticket-<id>/ticket.json
 *  - out/tickets/ticket-<id>/articles.json
 *
 * Features:
 *  - Live-Suche (Client-side) in den Jahresübersichten
 *  - Anzeige: Ticket-Nr. (Zammad), Titel, Erstellungsdatum, Autor (Name), Vorschau (max 128)
 *
 * Hinweis:
 *  - Vorschau wird bewusst NICHT escaped in <pre>${t.preview}</pre>.
 *    Stelle sicher, dass t.preview kein unsicheres HTML/JS enthält.
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const TICKETS_DIR = "out/tickets";
const OUT_DIR = "out";
const PREVIEW_MAX = 128;

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
 * Autorname (best effort, ohne API):
 *  - bevorzugt: erster Artikel -> from (meist Name oder "Name <mail@...>")
 *  - fallback: ticket.created_by.fullname/name/login/email (falls im Export enthalten)
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

// Zammad default state IDs (standard defaults; may vary per installation)
const STATE_ID_MAP: Record<number, string> = {
    1: "new",
    2: "open",
    3: "pending reminder",
    4: "closed",
    5: "merged",
    6: "pending close",
    7: "removed",
};

function deriveStatus(ticket: any): string | undefined {
    if (typeof ticket?.state === "string" && ticket.state) return ticket.state;
    const sid = ticket?.state_id;
    if (typeof sid === "number") return STATE_ID_MAP[sid] ?? `state_id:${sid}`;
    return undefined;
}

/* ---------------- Types ---------------- */

type TicketEntry = {
    id: number;
    ticketNumber?: string;
    title: string;
    createdAt?: string;
    year: number | "unknown";
    author: string;
    preview: string;
    status?: string;
};

/* ---------------- HTML builders ---------------- */

function buildYearHtml(year: number | "unknown", tickets: TicketEntry[]) {
    const title =
        year === "unknown"
            ? "Ticket-Export – Unbekanntes Jahr"
            : `Ticket-Export – ${year}`;

    const items = tickets
        .map((t) => {
            const displayNumber = t.ticketNumber
                ? `#${t.ticketNumber}`
                : `ID ${t.id}`;
            const searchText =
                `${t.ticketNumber ?? ""} ${t.id} ${t.title} ${t.author} ${t.preview} ${formatDate(t.createdAt)} ${t.status ?? ""}`
                    .toLowerCase()
                    .replace(/\s+/g, " ")
                    .trim();

            const statusBadge =
                t.status && t.status !== "open"
                    ? ` <span class="badge badge-${escapeHtml(t.status.replace(/\s+/g, "-"))}">${escapeHtml(t.status)}</span>`
                    : "";

            return `<li class="item" data-search="${escapeHtml(searchText)}">
        <div class="top">
          <a href="tickets/ticket-${t.id}/index.html">
            <strong>${escapeHtml(displayNumber)}</strong> – ${escapeHtml(t.title)}
          </a>${statusBadge}
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
  .top a { text-decoration: none; }
  .top a:hover { text-decoration: underline; }
  .meta { font-size: 12px; opacity: .8; display: flex; gap: 14px; flex-wrap: wrap; margin-top: 4px; }
  .preview { margin-top: 8px; opacity: .95; }
  .preview pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 12px; }
  .nav { margin-top: 14px; }
  a { word-break: break-word; }
  .badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 99px; margin-left: 6px; vertical-align: middle; }
  .badge-merged { background: #e0cfff; color: #5b21b6; }
  .badge-closed { background: #d1fae5; color: #065f46; }
  .badge-pending-reminder, .badge-pending-close { background: #fef3c7; color: #92400e; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>

  <div class="toolbar">
    <div class="search">
      <input id="q" type="search" placeholder="Suche nach Ticket-Nr., Titel, Autor, Inhalt …" autocomplete="off" />
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

  const items = Array.from(list.getElementsByTagName('li'));
  total.textContent = String(items.length);

  function apply() {
    const needle = (q.value || '').toLowerCase().trim();
    let visible = 0;

    for (const li of items) {
      const hay = li.getAttribute('data-search') || '';
      const ok = needle === '' || hay.includes(needle);
      li.hidden = !ok;
      if (ok) visible++;
    }
    shown.textContent = String(visible);
  }

  // 'input' covers typing; 'search' covers the ×-button; 'change' covers autofill
  q.addEventListener('input', apply);
  q.addEventListener('search', apply);
  q.addEventListener('change', apply);
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

        const title =
            cleanText(ticket?.title) || cleanText(ticket?.subject) || "(ohne Titel)";
        const createdAt =
            typeof ticket?.created_at === "string" ? ticket.created_at : undefined;
        const ticketNumber =
            typeof ticket?.number === "string" || typeof ticket?.number === "number"
                ? String(ticket.number)
                : undefined;
        const status = deriveStatus(ticket);

        tickets.push({
            id,
            ticketNumber,
            title,
            createdAt,
            year: yearFromDate(createdAt),
            author: deriveAuthor(ticket, articles),
            preview: derivePreview(articles),
            status,
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
