/**
 * zammad_export_group_tickets_with_html.ts
 * Node.js >= 18
 *
 * Env:
 *   ZAMMAD_API_TOKEN=...
 *
 * CLI:
 *   --start <number>   (default: 1)
 *   --end <number>     (default: 1000)
 *   --group <number>   (required)
 *   --out <dir>        (default: tickets)
 *   --sleep <ms>       (default: 100)
 */

import {environment} from "./environment";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

/* ---------------- CLI parsing ---------------- */

function parseArgs(argv: string[]) {
    const args: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) {
            args[a.slice(2)] = argv[i + 1];
            i++;
        }
    }
    return args;
}

const argv = parseArgs(process.argv.slice(2));

const START_ID = Number(argv.start ?? 1);
const END_ID = Number(argv.end ?? 1000);
const ONLY_GROUP_ID = Number(argv.group);
const OUTPUT_DIR = argv.out ?? "out/tickets";
const SLEEP_MS_PER_TICKET = Number(argv.sleep ?? 100);

if (!Number.isFinite(ONLY_GROUP_ID)) {
    console.error("❌ --group <number> ist erforderlich");
    process.exit(1);
}

if (START_ID > END_ID) {
    console.error("❌ --start darf nicht größer als --end sein");
    process.exit(1);
}

/* ---------------- Zammad config ---------------- */

const BASE_URL = environment.BASE_URL;

/* ---------------- Types ---------------- */

type ZammadAttachment = {
    id: number;
    filename: string;
};

type ZammadArticle = {
    id: number;
    subject?: string;
    from?: string;
    to?: string;
    created_at?: string;
    body?: string;
    body_html?: string;
    attachments?: ZammadAttachment[];
    [k: string]: unknown;
};

/* ---------------- Helpers ---------------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function safeFilename(name: string) {
    return (name || "attachment")
        .replaceAll("/", "_")
        .replaceAll("\\", "_")
        .replaceAll("\0", "")
        .trim();
}

function escapeHtml(s: string) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderBody(a: ZammadArticle) {
    if (typeof a.body_html === "string" && a.body_html.trim()) {
        return `<div class="body">${a.body_html}</div>`;
    }
    return `<pre class="pre">${String(a.body ?? "")}</pre>`;
}

/* ---------------- HTTP ---------------- */

async function fetchJson(url: string, token: string) {
    const res = await fetch(url, {
        headers: {
            Accept: "application/json",
            Authorization: `Token token=${token}`,
        },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

async function downloadAttachment(
    ticketId: number,
    articleId: number,
    attachmentId: number,
    targetPath: string,
    token: string
) {
    const url = `${BASE_URL}/ticket_attachment/${ticketId}/${articleId}/${attachmentId}`;
    const res = await fetch(url, {
        headers: { Authorization: `Token token=${token}` },
    });
    if (!res.ok) {
        throw new Error(`Attachment ${attachmentId} failed: ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(targetPath, buf);
}

/* ---------------- HTML builder ---------------- */

function buildHtml(
    ticket: any,
    ticketId: number,
    articles: ZammadArticle[],
    attachmentIndex: Array<{
        articleId: number;
        attachmentId: number;
        originalFilename: string;
        savedFilename: string;
    }>
) {
    const title = ticket?.title || `Ticket ${ticketId}`;

    const rows: Array<[string, string]> = [
        ["Ticket ID", String(ticketId)],
        ["Titel", ticket?.title ?? ""],
        ["Status", ticket?.state ?? ticket?.state_id ?? ""],
        ["Gruppe", String(ticket?.group_id ?? "")],
        ["Owner", String(ticket?.owner_id ?? "")],
        ["Customer", String(ticket?.customer_id ?? "")],
        ["Erstellt", ticket?.created_at ?? ""],
    ];

    const meta = rows
        .filter(([, v]) => v !== "")
        .map(
            ([k, v]) =>
                `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`
        )
        .join("");

    const attachments =
        attachmentIndex.length === 0
            ? `<p class="muted">Keine Anhänge</p>`
            : `<ul>
          ${attachmentIndex
                .map(
                    (a) =>
                        `<li><a href="attachments/${encodeURIComponent(
                            a.savedFilename
                        )}">${escapeHtml(a.originalFilename)}</a></li>`
                )
                .join("")}
        </ul>`;

    const articlesHtml = articles
        .map(
            (a) => `<section class="card">
        <div class="subject">${escapeHtml(String(a.subject ?? ""))}</div>
        <div class="meta">
          <span>Artikel ${a.id}</span>
          ${a.from ? `<span>Von: ${escapeHtml(a.from)}</span>` : ""}
          ${a.created_at ? `<span>${escapeHtml(a.created_at)}</span>` : ""}
        </div>
        ${renderBody(a)}
      </section>`
        )
        .join("");

    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)} (#${ticketId})</title>
<style>
body{font-family:system-ui,Arial;margin:24px}
.meta-table{border-collapse:collapse}
.meta-table th,.meta-table td{border-bottom:1px solid #ccc;padding:6px}
.card{border:1px solid #ccc;border-radius:8px;padding:10px;margin:10px 0}
.subject{font-weight:700}
.meta{font-size:12px;opacity:.8}
.pre{white-space:pre-wrap}
</style>
</head>
<body>
<h1>${escapeHtml(title)} <small>#${ticketId}</small></h1>

<h2>Ticket</h2>
<table class="meta-table">${meta}</table>

<h2>Anhänge</h2>
${attachments}

<h2>Artikel</h2>
${articlesHtml}
</body>
</html>`;
}

/* ---------------- Main logic ---------------- */

async function processTicket(ticketId: number, token: string) {
    try {
        const ticket = await fetchJson(`${BASE_URL}/tickets/${ticketId}`, token);
        if (ticket.group_id !== ONLY_GROUP_ID) return;

        const dir = join(OUTPUT_DIR, `ticket-${ticketId}`);
        const attachmentsDir = join(dir, "attachments");
        await mkdir(attachmentsDir, { recursive: true });

        await writeFile(join(dir, "ticket.json"), JSON.stringify(ticket, null, 2));

        const articles = (await fetchJson(
            `${BASE_URL}/ticket_articles/by_ticket/${ticketId}`,
            token
        )) as ZammadArticle[];

        await writeFile(
            join(dir, "articles.json"),
            JSON.stringify(articles, null, 2)
        );

        const attachmentIndex: any[] = [];

        for (const a of articles) {
            for (const att of a.attachments ?? []) {
                const name = `${a.id}__${att.id}__${safeFilename(att.filename)}`;
                await downloadAttachment(
                    ticketId,
                    a.id,
                    att.id,
                    join(attachmentsDir, name),
                    token
                );
                attachmentIndex.push({
                    articleId: a.id,
                    attachmentId: att.id,
                    originalFilename: att.filename,
                    savedFilename: name,
                });
            }
        }

        const html = buildHtml(ticket, ticketId, articles, attachmentIndex);
        await writeFile(join(dir, "index.html"), html);

        console.log(`✅ Ticket ${ticketId} exportiert`);
    } catch (err: any) {
        console.warn(`⚠️ Ticket ${ticketId} übersprungen (${err.message})`);
    }
}

async function main() {
    const token = environment.ZAMMAD_API_TOKEN;
    if (!token) {
        console.error("❌ ZAMMAD_API_TOKEN fehlt");
        process.exit(1);
    }

    await mkdir(OUTPUT_DIR, { recursive: true });

    console.log(
        `▶ Export: Tickets ${START_ID}–${END_ID}, group=${ONLY_GROUP_ID}, out=${OUTPUT_DIR}`
    );

    for (let id = START_ID; id <= END_ID; id++) {
        await processTicket(id, token);
        if (SLEEP_MS_PER_TICKET > 0) await sleep(SLEEP_MS_PER_TICKET);
    }

    console.log("🎉 Export abgeschlossen");
}

main();
