import test from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "./retry.ts";

test("returns the result without retrying when the call succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
        calls++;
        return "ok";
    }, { retries: 3, delayMs: 0 });

    assert.equal(result, "ok");
    assert.equal(calls, 1);
});

test("retries a failing call and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
        calls++;
        if (calls < 3) throw new Error("transient");
        return "recovered";
    }, { retries: 3, delayMs: 0 });

    assert.equal(result, "recovered");
    assert.equal(calls, 3);
});

test("does not retry when shouldRetry returns false", async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(
            async () => {
                calls++;
                const err: any = new Error("not found");
                err.status = 404;
                throw err;
            },
            { retries: 5, delayMs: 0, shouldRetry: (err: any) => err?.status >= 500 },
        ),
        /not found/,
    );
    assert.equal(calls, 1, "a non-retryable error must not be retried");
});

test("throws the last error after exhausting all retries", async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(async () => {
            calls++;
            throw new Error(`boom ${calls}`);
        }, { retries: 2, delayMs: 0 }),
        /boom 3/,
    );
    // retries: 2 -> 1 initial + 2 retries = 3 attempts
    assert.equal(calls, 3);
});
