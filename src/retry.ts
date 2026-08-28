/**
 * retry.ts
 *
 * Kleiner, abhängigkeitsfreier Retry-Helfer mit exponentiellem Backoff.
 * Wird vom Export genutzt, damit einzelne, transiente Fehler (Timeout,
 * Rate-Limit, 5xx) ein Ticket nicht still verschlucken.
 */

export type RetryOptions = {
    /** Zusätzliche Versuche nach dem ersten (Default: 2 -> 3 Versuche gesamt). */
    retries?: number;
    /** Wartezeit vor dem ersten Retry in ms (Default: 250). */
    delayMs?: number;
    /** Multiplikator für den Backoff je Retry (Default: 2). */
    factor?: number;
    /**
     * Entscheidet, ob ein Fehler wiederholt werden soll. Default: immer.
     * Nützlich, um z.B. 404/403 nicht zu wiederholen (nur transiente Fehler).
     */
    shouldRetry?: (err: unknown) => boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
    fn: () => Promise<T>,
    opts: RetryOptions = {},
): Promise<T> {
    const retries = opts.retries ?? 2;
    const delayMs = opts.delayMs ?? 250;
    const factor = opts.factor ?? 2;
    const shouldRetry = opts.shouldRetry ?? (() => true);

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < retries && shouldRetry(err)) {
                await sleep(delayMs * Math.pow(factor, attempt));
            } else {
                break;
            }
        }
    }
    throw lastError;
}
