/**
 * generate_overview.ts
 *
 * Erzeugt:
 *  - tickets/index-YYYY.html (eine Übersichtsseite pro Jahr, basierend auf ticket.created_at)
 *  - tickets/index.html (Landing-Page mit Links zu den Jahresübersichten)
 *
 * Anzeige pro Ticket:
 *  - Ticket-ID + Titel
 *  - Erstellungsdatum
 *  - Autor (best effort)
 *  - Vorschau (max 128 Zeichen), best effort aus ticket.json (oder articles.json fallback)
 *
 * Voraussetzungen:
 *  - Export-Struktur: tickets/ticket-<id>/ticket.json, articles.json, index.html
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const OUTPUT_DIR = "tickets";
const PREVIEW_MAX = 128;

type TicketEntry = {
    id: number;
    title: string;
    createdAt?: string; // ISO
    year: number | "unknown";
    author: string;
    preview: string;
};

function escapeHtml(s: string) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function safeText(s: unknown): string {
    if (typeof s !== "string") return "";
    return s.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number) {
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function formatDate(iso?: string): string {
    if (!iso) return "(kein Datum)";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "(ungültiges Datum)";
    return d.toLocaleDateString("de-DE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
}

function yearFromCreatedAt(iso?: string): number | "unknown" {
    if (!iso) return "unknown";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "unknown";
    return d.getFullYear();
}

/**
 * Best effort: "Autor" aus ticket.json.
 * Zammad Tickets haben typischerweise customer_id / created_by_id / owner_id, aber keine Namen ohne extra API.
 * Wir zeigen daher eine sinnvolle Info an (ID), und wenn zufällig ein "customer" Objekt/String vorhanden ist,
 * nutzen wir das.
 */
function deriveAuthor(ticket: any): string {
    // Falls im Export zufällig schon Namen drin sind:
    const customerName =
        safeText(ticket?.customer?.fullname) ||
        safeText(ticket?.customer?.name) ||
        safeText(ticket?.customer?.login) ||
        safeText(ticket?.customer?.email);

    if (customerName) return customerName;

    // Fallbacks (IDs)
    if (ticket?.created_by_id != null) return `created_by_id=${ticket.created_by_id}`;
    if (ticket?.customer_id != null) return `customer_id=${ticket.customer_id}`;
    if (ticket?.owner_id != null) return `owner_id=${ticket.owner_id}`;

    return "(unbekannt)";
}

/**
 * Vorschau:
 *  1) ticket.description / ticket.note / ticket.subject / ticket.title (falls vorhanden)
 *  2) sonst erster Artikel body/body_html aus articles.json
 */
function derivePreview(ticket: any, articles: any[] | null): string {
    const direct =
        safeText(ticket?.description) ||
        safeText(ticket?.note) ||
        safeText(ticket?.subject) ||
        safeText(ticket?.title);

    if (direct) return truncate(direct, PREVIEW_MAX);

    if (Array.isArray(articles) && articles.length > 0) {
        // Nimm den ersten Artikel mit Inhalt
        for (const a of articles) {
            const body =
                safeText(a?.body) ||
                // body_html enthält ggf. HTML → einfache "strip tags" Heuristik:
                safeText(typeof a?.body_html === "string" ? a.body_html.replace(/<[^>]+>/g, " ") : "");
            if (body) return truncate(body, PREVIEW_MAX);
        }
    }

    return "(keine Vorschau)";
}

function buildYearHtml(year: number | "unknown", tickets: TicketEntry[]) {
    const title =
        year === "unknown" ? "Ticket-Export – Unbekanntes Jahr" : `Ticket-Export – ${year}`;

    const items =
        tickets.length === 0
            ? `<p class="muted">Keine Tickets gefunden.</p>`
            : `<ul class="list">
          ${tickets
                .map((t) => {
                    const href = `ticket-${t.id}/index.html`;
                    return `<li class="item">
                <div class="top">
                  <a href="${href}"><strong>#${t.id}</strong> – ${escapeHtml(t.title)}</a>
                </div>
                <div class="meta">
                  <span>Erstellt: ${escapeHtml(formatDate(t.createdAt))}</span>
                  <span>Autor: ${escapeHtml(t.author)}</span>
                </div>
                <div class="preview">${escapeHtml(t.preview)}</div>
              </li>`;
                })
                .join("\n")}
        </ul>`;

    return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; line-height: 1.45; }
    h1 { margin: 0 0 10px; font-size: 22px; }
    .muted { opacity: .75; }
    .list { list-style: none; padding: 0; margin: 14px 0 0; max-width: 1100px; }
    .item { border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 12px 14px; margin: 10px 0; }
    .top a { text-decoration: none; }
    .top a:hover { text-decoration: underline; }
    .meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; opacity: .8; margin-top: 6px; }
    .preview { margin-top: 8px; font-size: 13px; opacity: .9; }
    .nav { margin-top: 10px; }
    .nav a { margin-right: 12px; }
    a { word-break: break-word; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="nav">
    <a href="index.html">← Zur Jahresübersicht</a>
  </div>
  <p class="muted">Tickets: ${tickets.length}</p>
  ${items}
</body>
</html>`;
}

function buildLandingHtml(years: Array<number | "unknown">) {
    const yearLinks =
        years.length === 0
            ? `<p class="muted">Keine Jahresübersichten gefunden.</p>`
            : `<ul class="years">
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
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ticket-Export – Jahresübersicht</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; line-height: 1.45; }
    h1 { margin: 0 0 10px; font-size: 22px; }
    .muted { opacity: .75; }
    .years { padding-left: 18px; }
    li { margin: 8px 0; }
    a { text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Ticket-Export – Jahresübersicht</h1>
  <p class="muted">Wähle ein Jahr:</p>
  ${yearLinks}
</body>
</html>`;
}

async function readJsonIfExists(path: string): Promise<any | null> {
    try {
        const raw = await readFile(path, "utf-8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function main() {
    const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });

    const tickets: TicketEntry[] = [];

    for (const e of entries) {
        if (!e.isDirectory() || !e.name.startsWith("ticket-")) continue;

        const id = Number(e.name.slice("ticket-".length));
        if (!Number.isFinite(id)) continue;

        const ticketDir = join(OUTPUT_DIR, e.name);
        const ticketJsonPath = join(ticketDir, "ticket.json");
        const articlesJsonPath = join(ticketDir, "articles.json");

        const ticket = await readJsonIfExists(ticketJsonPath);
        const articles = (await readJsonIfExists(articlesJsonPath)) as any[] | null;

        const title =
            safeText(ticket?.title) || safeText(ticket?.subject) || "(ohne Titel)";
        const createdAt = typeof ticket?.created_at === "string" ? ticket.created_at : undefined;

        tickets.push({
            id,
            title,
            createdAt,
            year: yearFromCreatedAt(createdAt),
            author: deriveAuthor(ticket ?? {}),
            preview: derivePreview(ticket ?? {}, Array.isArray(articles) ? articles : null),
        });
    }

    // Gruppieren nach Jahr
    const byYear = new Map<number | "unknown", TicketEntry[]>();
    for (const t of tickets) {
        const arr = byYear.get(t.year) ?? [];
        arr.push(t);
        byYear.set(t.year, arr);
    }

    // Sortierung:
    // - Jahre absteigend (unknown zuletzt)
    // - Tickets innerhalb eines Jahres nach created_at (neueste zuerst), fallback id
    const years = Array.from(byYear.keys()).sort((a, b) => {
        if (a === "unknown" && b === "unknown") return 0;
        if (a === "unknown") return 1;
        if (b === "unknown") return -1;
        return b - a;
    });

    for (const y of years) {
        const list = byYear.get(y) ?? [];
        list.sort((a, b) => {
            const da = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity;
            const db = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity;
            if (da !== db) return db - da;
            return a.id - b.id;
        });

        const fileName = y === "unknown" ? "index-unknown.html" : `index-${y}.html`;
        const html = buildYearHtml(y, list);
        await writeFile(join(OUTPUT_DIR, fileName), html, "utf-8");
    }

    // Landing page
    const landing = buildLandingHtml(years);
    await writeFile(join(OUTPUT_DIR, "index.html"), landing, "utf-8");

    console.log(
        `✅ Jahresübersichten geschrieben: ${years.length} Dateien + ${OUTPUT_DIR}/index.html`
    );
}

main().catch((err) => {
    console.error("❌ Fehler:", err);
    process.exitCode = 1;
});
