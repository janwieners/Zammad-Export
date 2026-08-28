/**
 * globals.d.ts
 *
 * Typseitige Nachbildung der Bun-Laufzeit-Erweiterungen, die dieses Projekt
 * nutzt (die Skripte werden mit `bun` ausgeführt, nicht über den tsc-Emit).
 */

declare global {
    // Bun erlaubt eine tls-Option in fetch(), um z.B. self-signed Zertifikate
    // zu akzeptieren (rejectUnauthorized: false).
    interface RequestInit {
        tls?: { rejectUnauthorized?: boolean };
    }

    // Bun/Node setzen import.meta.main = true, wenn das Modul direkt
    // ausgeführt wird (Entry Point).
    interface ImportMeta {
        main?: boolean;
    }
}

export {};
