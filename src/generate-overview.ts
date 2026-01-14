/**
 * generate_overview.ts
 *
 * Erzeugt:
 *  - ./index.html              (Landing-Page mit Jahreslinks)
 *  - ./index-YYYY.html         (eine Übersicht pro Jahr)
 *
 * Liest Daten aus:
 *  - tickets/ticket-<id>/ticket.json
 *  - tickets/ticket-<id>/articles.json
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
 * Autor:
 *  - bevorzugt: erster Artikel → `from`
 *  - fallback: created_by.fullname
 */
function deriveAuthor(ticket: any, articles: any[] | null): string {
    if (Array.isArray(articles) && articles.length > 0) {
        const from = cleanText(articles[0]?.from);
        if (from) return from;
    }

    const name =
        cleanText(ticket?.created_by?.fullname) ||
        cleanText(ticket?.created_by?.name);

    return name || "(unbekannt)";
}

/**
 * Vorschau:
 *  - erster Artikel body/body_html
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

/* ---------------- Types ---------------- */

type TicketEntry = {
    id: number;
    title: string;
    createdAt?: string;
    year: number | "unknown";
    author: string;
    preview: string;
};

/* ---------------- HTML builders ---------------- */

function buildYearHtml(year: number | "unknown", tickets: TicketEntry[]) {
    const title =
        year === "unknown"
            ? "Ticket-Export – Unbekanntes Jahr"
            : `Ticket-Export – ${year}`;

    const items = tickets
        .map(
            (t) => `<li class="item">
        <div class="top">
          <a href="tickets/ticket-${t.id}/index.html">
            <strong>#${t.id}</strong> – ${escapeHtml(t.title)}
          </a>
        </div>
        <div class="meta">
          <span>Erstellt: ${escapeHtml(formatDate(t.createdAt))}</span>
          <span>Autor: ${escapeHtml(t.author)}</span>
        </div>
        <div class="preview">${escapeHtml(t.preview)}</div>
      </li>`
        )
        .join("\n");

    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,Arial;margin:24px}
.item{border:1px solid #ccc;border-radius:8px;padding:12px;margin:10px 0}
.top a{text-decoration:none}
.top a:hover{text-decoration:underline}
.meta{font-size:12px;opacity:.8;display:flex;gap:14px;margin-top:4px}
.preview{margin-top:6px}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>Tickets: ${tickets.length}</p>
<ul style="list-style:none;padding:0">${items}</ul>
<p><a href="index.html">← Jahresübersicht</a></p>
</body>
</html>`;
}

function buildLandingHtml(years: Array<number | "unknown">) {
    const links = years
        .map((y) => {
            const file = y === "unknown" ? "index-unknown.html" : `index-${y}.html`;
            const label = y === "unknown" ? "Unbekanntes Jahr" : String(y);
            return `<li><a href="${file}">${escapeHtml(label)}</a></li>`;
        })
        .join("\n");

    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ticket-Export – Übersicht</title>
<style>
body{font-family:system-ui,Arial;margin:24px}
</style>
</head>
<body>
<h1>Ticket-Export – Jahresübersicht</h1>
<ul>${links}</ul>
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

        const title = cleanText(ticket?.title) || "(ohne Titel)";
        const createdAt =
            typeof ticket?.created_at === "string" ? ticket.created_at : undefined;

        tickets.push({
            id,
            title,
            createdAt,
            year: yearFromDate(createdAt),
            author: deriveAuthor(ticket, articles),
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

    // Jahresseiten
    for (const y of years) {
        const list = byYear.get(y)!;
        list.sort(
            (a, b) =>
                (b.createdAt ? Date.parse(b.createdAt) : 0) -
                (a.createdAt ? Date.parse(a.createdAt) : 0)
        );

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
