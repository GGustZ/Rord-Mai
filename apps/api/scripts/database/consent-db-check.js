const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const {
    createConsentService,
} = require("../../src/services/consent-service");

const pool = new Pool({
    connectionTimeoutMillis: 5000,
});

const identity = {
    // Test identity only. Real requests need verified LINE identity.
    lineUserId: `prv01-test-${randomUUID()}`,
};

const service = createConsentService({
    pool,
    currentPolicyVersion: "v1",
});

const findStudent = async () => {
    const result = await pool.query(
        "SELECT * FROM students WHERE line_user_id = $1",
        [identity.lineUserId]
    );
    return result.rows;
};

const run = async () => {
    let correctDatabase = false;

    try {
        const result = await pool.query(
            "SELECT current_database() AS name"
        );

        assert.equal(
            result.rows[0].name,
            "rord_mai_dat02_practice",
            "Use the practice database for this check."
        );
        correctDatabase = true;

        // 1. Declining must not create a student.
        await assert.rejects(
            service.grantStorageConsent({
                identity,
                accepted: false,
                policyVersion: "v1",
            }),
            { code: "EXPLICIT_CONSENT_REQUIRED" }
        );

        assert.equal((await findStudent()).length, 0);
        console.log("PASS: declining creates no student");

        // 2. An outdated policy must not create a student.
        await assert.rejects(
            service.grantStorageConsent({
                identity,
                accepted: true,
                policyVersion: "old",
            }),
            { code: "POLICY_VERSION_OUTDATED" }
        );

        assert.equal((await findStudent()).length, 0);
        console.log("PASS: outdated policy creates no student");

        // 3. Explicit acceptance persists the consent evidence.
        const first = await service.grantStorageConsent({
            identity,
            accepted: true,
            policyVersion: "v1",
        });

        const students = await findStudent();

        assert.equal(students.length, 1);
        assert.equal(students[0].id, first.id);
        assert.equal(students[0].storage_consent, true);
        assert.equal(students[0].storage_policy_version, "v1");
        assert.ok(
            students[0].storage_consented_at instanceof Date
        );
        console.log("PASS: acceptance saves student and evidence");

        // 4. Repeated acceptance preserves identity and grant time.
        const second = await service.grantStorageConsent({
            identity,
            accepted: true,
            policyVersion: "v1",
        });

        assert.equal(second.id, first.id);
        assert.equal(
            second.storage_consented_at.getTime(),
            first.storage_consented_at.getTime()
        );
        assert.equal((await findStudent()).length, 1);
        console.log("PASS: repeated acceptance reuses the student");
    } finally {
        try {
            if (correctDatabase) {
                // Delete only the unique student created by this run.
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
