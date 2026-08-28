import test from "node:test";
import assert from "node:assert/strict";
import {
    buildYearHtml,
    derivePreview,
    buildMappingCsv,
} from "./generate-overview.ts";

test("buildYearHtml escapes HTML in the preview so the list structure cannot break", () => {
    const html = buildYearHtml(2024, [
        {
            id: 55752,
            ticketNumber: "7855142",
            title: "Abordnung",
            createdAt: "2024-03-01T08:00:00.000Z",
            year: 2024,
            author: "Max Mustermann",
            preview: "</pre></div></li><script>evil()</script>",
            status: "open",
        },
    ]);

    // The raw markup must NOT appear verbatim (that is what corrupts the DOM,
    // so the item is counted "1 / 57" but not rendered).
    assert.ok(
        !html.includes("</pre></div></li><script>"),
        "raw preview HTML leaked into the page and can break the list",
    );
    // It must be present, but escaped as text.
    assert.ok(
        html.includes("&lt;script&gt;evil()&lt;/script&gt;"),
        "preview should be shown as escaped text",
    );
});

test("derivePreview strips tags from a plain HTML body", () => {
    const preview = derivePreview([{ body: "<p>Hallo <b>Welt</b></p>" }]);
    assert.ok(!preview.includes("<"), `preview still contains tags: ${preview}`);
    assert.ok(preview.includes("Hallo"), "text content should survive");
});

test("buildMappingCsv maps ticket number -> internal id/folder path", () => {
    const csv = buildMappingCsv([
        {
            id: 55752,
            ticketNumber: "7855142",
            title: "Abordnung Musterschule",
            year: 2024,
            author: "A",
            preview: "p",
            status: "open",
        },
    ]);

    const lines = csv.trim().split("\n");
    assert.equal(lines[0], "number,id,year,path,title", "header row");
    assert.equal(
        lines[1],
        "7855142,55752,2024,tickets/ticket-55752/index.html,Abordnung Musterschule",
        "data row maps number to the internal-id folder",
    );
});

test("buildMappingCsv quotes fields containing commas or quotes (RFC4180)", () => {
    const csv = buildMappingCsv([
        {
            id: 1,
            ticketNumber: "7000000",
            title: 'Re: Antrag, "dringend"',
            year: 2023,
            author: "A",
            preview: "p",
            status: "closed",
        },
    ]);

    assert.ok(
        csv.includes('"Re: Antrag, ""dringend"""'),
        `title with comma/quotes not escaped correctly: ${csv}`,
    );
});

test("buildMappingCsv is sorted by ticket number ascending", () => {
    const csv = buildMappingCsv([
        { id: 2, ticketNumber: "7855142", title: "b", year: 2024, author: "", preview: "", status: "" },
        { id: 1, ticketNumber: "7000000", title: "a", year: 2023, author: "", preview: "", status: "" },
    ]);
    const numbers = csv.trim().split("\n").slice(1).map((l) => l.split(",")[0]);
    assert.deepEqual(numbers, ["7000000", "7855142"]);
});
