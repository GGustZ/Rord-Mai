const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const {
    createConsentService,
} = require("../../src/services/consent-service");

const pool = new Pool({
    max: 3,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
});

const identity = {
    lineUserId: `prv01-race-${randomUUID()}`,
};

const service = createConsentService({
    pool,
    currentPolicyVersion: "v1",
});

const delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

// Observe a real blocked transaction instead of assuming a delay proves it.
const waitForBlockedWriter = async (blockingPid) => {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
        const result = await pool.query(
            `SELECT EXISTS (
                SELECT 1
                FROM pg_stat_activity
                WHERE datname = current_database()
                  AND $1::integer = ANY(pg_blocking_pids(pid))
            ) AS blocked`,
            [blockingPid]
        );

        if (result.rows[0].blocked) return;

        await delay(50);
    }

    throw new Error("No blocked writer observed within 5 seconds");
};

const run = async () => {
    let correctDatabase = false;
    let withdrawalClient;
    let withdrawalOpen = false;
    let pendingWrite;
    let callbackRan = false;

    try {
        const result = await pool.query(
            "SELECT current_database() AS name"
        );

        assert.equal(
            result.rows[0].name,
            "rord_mai_dat02_practice"
        );
        correctDatabase = true;

        await service.grantStorageConsent({
            identity,
            accepted: true,
            policyVersion: "v1",
        });

        withdrawalClient = await pool.connect();

        const pidResult = await withdrawalClient.query(
            "SELECT pg_backend_pid() AS pid"
        );
        const blockingPid = pidResult.rows[0].pid;

        await withdrawalClient.query("BEGIN");
        withdrawalOpen = true;

        await withdrawalClient.query(
            `SELECT id FROM students
             WHERE line_user_id = $1
             FOR UPDATE`,
            [identity.lineUserId]
        );

        // Simulate only the consent-state part of withdrawal.
        await withdrawalClient.query(
            `UPDATE students
             SET storage_consent = FALSE,
                 storage_policy_version = NULL,
                 storage_consented_at = NULL
             WHERE line_user_id = $1`,
            [identity.lineUserId]
        );

        // Attach both handlers immediately to capture any rejection.
        pendingWrite = service.withStorageConsent(
            { identity },
            async () => {
                callbackRan = true;
            }
        ).then(
            () => ({ succeeded: true }),
            (error) => ({ succeeded: false, error })
        );

        await waitForBlockedWriter(blockingPid);
        assert.equal(callbackRan, false);
        console.log("PASS: writer waits for the student-row lock");

        await withdrawalClient.query("COMMIT");
        withdrawalOpen = false;

        const outcome = await pendingWrite;

        assert.equal(outcome.succeeded, false);
        assert.equal(
            outcome.error.code,
            "STORAGE_CONSENT_REQUIRED"
        );
        assert.equal(callbackRan, false);
        console.log("PASS: writer rejects consent withdrawn while waiting");
    } finally {
        try {
            // Release the lock before waiting for a pending writer.
            if (withdrawalClient) {
                try {
                    if (withdrawalOpen) {
                        await withdrawalClient.query("ROLLBACK");
                    }
                } finally {
                    withdrawalClient.release();
                }
            }

            if (pendingWrite) await pendingWrite;

            if (correctDatabase) {
                await pool.query(
                    "DELETE FROM students WHERE line_user_id = $1",
                    [identity.lineUserId]
                );
            }
        } finally {
            await pool.end();
        }
    }
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
