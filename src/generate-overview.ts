/**
 * generate_overview.ts
 * Erzeugt tickets/index.html inkl. Ticket-Titel aus ticket.json
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const OUTPUT_DIR = "tickets";

function escapeHtml(s: string) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

type TicketEntry = {
    id: number;
    title: string;
};

function buildOverviewHtml(tickets: TicketEntry[]) {
    const items =
        tickets.length === 0
            ? `<p class="muted">Keine exportierten Tickets gefunden.</p>`
            : `<ul class="list">
          ${tickets
                .map((t) => {
                    const href = `ticket-${t.id}/index.html`;
                    return `<li>
                <a href="${href}">
                  <strong>#${t.id}</strong> – ${escapeHtml(t.title)}
                </a>
              </li>`;
                })
                .join("\n")}
        </ul>`;

    return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ticket-Export – Übersicht</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; line-height: 1.45; }
    h1 { margin: 0 0 10px; font-size: 22px; }
    .muted { opacity: .75; }
    .list { padding-left: 18px; }
    li { margin: 8px 0; }
    a { text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Ticket-Export – Übersicht</h1>
  <p class="muted">Gefundene Tickets: ${tickets.length}</p>
  ${items}
</body>
</html>`;
}

async function main() {
    const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });

    const tickets: TicketEntry[] = [];

    for (const e of entries) {
        if (!e.isDirectory() || !e.name.startsWith("ticket-")) continue;

        const id = Number(e.name.slice("ticket-".length));
        if (!Number.isFinite(id)) continue;

        const ticketJsonPath = join(OUTPUT_DIR, e.name, "ticket.json");

        try {
            const raw = await readFile(ticketJsonPath, "utf-8");
            const ticket = JSON.parse(raw);

            const title =
                typeof ticket.title === "string" && ticket.title.trim() !== ""
                    ? ticket.title
                    : "(ohne Titel)";

            tickets.push({ id, title });
        } catch {
            // falls ticket.json fehlt oder kaputt ist
            tickets.push({ id, title: "(Titel nicht lesbar)" });
        }
    }

    // sortieren nach Ticket-ID
    tickets.sort((a, b) => a.id - b.id);

    const html = buildOverviewHtml(tickets);
    await writeFile(join(OUTPUT_DIR, "index.html"), html, "utf-8");

    console.log(
        `✅ Übersicht geschrieben: ${OUTPUT_DIR}/index.html (${tickets.length} Tickets)`
    );
}

main().catch((err) => {
    console.error("❌ Fehler:", err);
    process.exitCode = 1;
});
