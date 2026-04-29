# Zammad-Export

Let's you export tickets and generate year-based overview over your exported tickets.

## Setup

Run ```npm i``` in order to install dependencies.

Use bun, deno or your favourite runtime.

## Usage / CLI

### Export Tickets to ./out

```bun src/export-tickets.ts --start START_TICKETID --end END_TICKETID --group GROUPID --sleep SLEEPTIME```

Example:

```bun src/export-tickets.ts --start 150 --end 200 --group 2 --sleep 50```

### Generate Searchable Ticket Overview

```bun src/generate-overview.ts [--tickets <dir>]```

Generates `index.html` and `index-<year>.html` files in the parent directory of the tickets folder.

| Argument | Default | Description |
|---|---|---|
| `--tickets <dir>` | `out/tickets` | Path to the folder containing the exported tickets |

Examples:

```bash
# Default: reads from out/tickets, writes to out/
bun src/generate-overview.ts

# Custom folder: reads from /data/tickets, writes to /data/
bun src/generate-overview.ts --tickets /data/tickets
```

The overview pages feature:
- **Live search** by ticket number (Zammad), title, author, and content
- **Status badges** (merged, closed, pending …)
- Year-based navigation
