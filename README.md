# Zammad-Export

Let's you export tickets and generate year-based overview over your exported tickets.

## Usage / CLI

### Export Tickets to ./out

```bun src/export-tickets.ts --start START_TICKETID --end END_TICKETID --group GROUPID --sleep SLEEPTIME```

Example:

```bun src/export-tickets.ts --start 150 --end 200 --group 2 --sleep 50```

### Generate Searchable Ticket Overview

```bun src/generate-overview.ts```

Generates index.* files in ./out which let's you easily explore your ticket archive.
