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
    lineUserId: `prv01-write-${randomUUID()}`,
};

const service = createConsentService({
    pool,
    currentPolicyVersion: "v1",
});

// Explicit IDs let cleanup target only this run's sections.
const committedSectionId = randomUUID();
const rolledBackSectionId = randomUUID();

const createSection = async (client, sectionId) => {
    await client.query(
        `INSERT INTO sections (
            id, join_code, course_code, course_name,
            section_number, academic_year, semester,
            credits, grading_mode, withdrawal_deadline
        ) VALUES (
            $1, $2, 'PRV01-TEST', 'Consent test',
            '01', 2026, 1, 3, 'norm', '2026-10-31'
        )`,
        [sectionId, randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()]
    );
};

const sectionExists = async (sectionId) => {
    const result = await pool.query(
        "SELECT id FROM sections WHERE id = $1",
        [sectionId]
    );
    return result.rowCount === 1;
};

const run = async () => {
    let correctDatabase = false;

    try {
        const result = await pool.query(
            "SELECT current_database() AS name"
        );

        assert.equal(
            result.rows[0].name,
            "rord_mai_dat02_practice"
        );
        correctDatabase = true;

        // 1. Missing identity must prevent the callback from running.
        const blockedWrite = async ({ client }) => {
            await createSection(client, committedSectionId);
        };

        await assert.rejects(
            service.withStorageConsent({}, blockedWrite),
            { code: "UNAUTHENTICATED" }
        );

        assert.equal(await sectionExists(committedSectionId), false);
        console.log("PASS: missing identity blocks the write");

        // 2. An identity without a student record cannot write.
        await assert.rejects(
            service.withStorageConsent({ identity }, blockedWrite),
            { code: "STORAGE_CONSENT_REQUIRED" }
        );

        const missingStudent = await pool.query(
            "SELECT id FROM students WHERE line_user_id = $1",
            [identity.lineUserId]
        );

        assert.equal(missingStudent.rowCount, 0);
        assert.equal(await sectionExists(committedSectionId), false);
        console.log("PASS: missing student blocks the write");

        // Test fixture only: simulate a legacy student without consent.
        await pool.query(
            "INSERT INTO students (line_user_id) VALUES ($1)",
            [identity.lineUserId]
        );

        // 3. An existing student with false consent cannot write.
        await assert.rejects(
            service.withStorageConsent({ identity }, blockedWrite),
            { code: "STORAGE_CONSENT_REQUIRED" }
        );

        assert.equal(await sectionExists(committedSectionId), false);
        console.log("PASS: false consent blocks the write");

        await service.grantStorageConsent({
            identity,
            accepted: true,
            policyVersion: "v1",
        });

        // 4. A successful guarded write must persist.
        await service.withStorageConsent(
            { identity },
            async ({ client }) => {
                await createSection(client, committedSectionId);
            }
        );

        assert.equal(await sectionExists(committedSectionId), true);
        console.log("PASS: consented write commits");

        // 5. An error after INSERT must undo that INSERT.
        await assert.rejects(
            service.withStorageConsent(
                { identity },
                async ({ client }) => {
                    await createSection(client, rolledBackSectionId);
                    throw new Error("Simulated failure after insert");
                }
            ),
            { message: "Simulated failure after insert" }
        );

        assert.equal(await sectionExists(rolledBackSectionId), false);
        assert.equal(await sectionExists(committedSectionId), true);
        console.log("PASS: failed write rolls back");
    } finally {
        try {
            if (correctDatabase) {
                await pool.query(
                    "DELETE FROM sections WHERE id IN ($1, $2)",
                    [committedSectionId, rolledBackSectionId]
                );

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
