'use strict';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

// Only authentication middleware may construct this identity object.
// Never pass req.body or an unverified token's decoded claims here.
const requireIdentity = (identity) => {
    if (typeof identity?.lineUserId !== 'string' || !identity.lineUserId.trim()) {
        throw fail(401, 'UNAUTHENTICATED', 'Verified LINE identity is required.');
    }
    return identity.lineUserId;
};

const withTransaction = async (pool, work) => {
    const client = await pool.connect();
    let transactionStarted = false;
    let releaseError;
    try {
        await client.query('BEGIN');
        transactionStarted = true;
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        if (transactionStarted) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                releaseError = rollbackError;
            }
        } else {
            releaseError = error;
        }
        throw error;
    } finally {
        // node-postgres discards a client when release receives an error.
        client.release(releaseError);
    }
};

const createConsentService = ({ pool, currentPolicyVersion }) => {
    if (typeof currentPolicyVersion !== 'string' || !currentPolicyVersion.trim()) {
        throw new TypeError('A current storage policy version must be configured.');
    }

    const grantStorageConsent = async ({ identity, accepted, policyVersion, crossBorderExplanation }) => {
        const lineUserId = requireIdentity(identity);
        // A decline must not create a student. Withdrawal is a separate operation.
        if (accepted !== true) {
            throw fail(400, 'EXPLICIT_CONSENT_REQUIRED', 'Explicit storage consent is required.');
        }
        if (policyVersion !== currentPolicyVersion) {
            throw fail(409, 'POLICY_VERSION_OUTDATED', 'Accept the current storage policy.');
        }
        if (crossBorderExplanation !== undefined && typeof crossBorderExplanation !== 'boolean') throw fail(400, 'VALIDATION_ERROR', 'Invalid consent choice.');

        return withTransaction(pool, async (client) => {
            const { rows } = await client.query(`
                INSERT INTO students (
                    line_user_id, storage_consent, storage_policy_version, storage_consented_at,
                    cross_border_explanation, explanation_consented_at
                ) VALUES ($1, TRUE, $2, CURRENT_TIMESTAMP, COALESCE($3::boolean,FALSE), CASE WHEN $3 THEN CURRENT_TIMESTAMP END)
                ON CONFLICT (line_user_id) DO UPDATE SET
                    storage_consent = TRUE,
                    storage_policy_version = EXCLUDED.storage_policy_version,
                    cross_border_explanation = CASE WHEN $3::boolean IS NULL AND students.storage_policy_version = $2
                        THEN students.cross_border_explanation ELSE EXCLUDED.cross_border_explanation END,
                    explanation_consented_at = CASE WHEN $3::boolean IS NULL AND students.storage_policy_version = $2
                        THEN students.explanation_consented_at
                        WHEN NOT EXCLUDED.cross_border_explanation THEN NULL
                        WHEN students.cross_border_explanation AND students.storage_policy_version = EXCLUDED.storage_policy_version
                        THEN students.explanation_consented_at ELSE CURRENT_TIMESTAMP END,
                    storage_consented_at = CASE
                        WHEN students.storage_consent = TRUE
                            AND students.storage_policy_version = EXCLUDED.storage_policy_version
                        THEN students.storage_consented_at
                        ELSE EXCLUDED.storage_consented_at
                    END,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id, storage_consent, storage_policy_version, storage_consented_at
            `, [lineUserId, policyVersion, crossBorderExplanation ?? null]);
            return rows[0];
        });
    };

    const withStorageConsent = async ({ identity }, write) => {
        const lineUserId = requireIdentity(identity);
        if (typeof write !== 'function') throw new TypeError('A write callback is required.');

        return withTransaction(pool, async (client) => {
            const { rows } = await client.query(`
                SELECT id, storage_consent, cross_border_explanation, storage_policy_version, explanation_consented_at
                FROM students
                WHERE line_user_id = $1
                FOR UPDATE
            `, [lineUserId]);
            const student = rows[0];
            if (!student || student.storage_consent !== true) {
                throw fail(403, 'STORAGE_CONSENT_REQUIRED', 'Storage consent is required.');
            }
            // All writes must use this client, and all promises must be awaited.
            // The caller must also enforce ownership of the target resource.
            return write({ client, studentId: student.id, crossBorderExplanation:student.cross_border_explanation === true &&
                student.storage_policy_version === currentPolicyVersion && student.explanation_consented_at != null });
        });
    };

    const setExplanationConsent = async ({ identity, accepted, policyVersion }) => {
        const lineUserId = requireIdentity(identity);
        if (typeof accepted !== 'boolean') throw fail(400, 'VALIDATION_ERROR', 'Invalid consent choice.');
        if (policyVersion !== currentPolicyVersion) throw fail(409, 'POLICY_VERSION_OUTDATED', 'Accept the current storage policy.');
        return withTransaction(pool, async (client) => {
            const student = (await client.query('SELECT id,storage_consent,storage_policy_version FROM students WHERE line_user_id=$1 FOR UPDATE', [lineUserId])).rows[0];
            if (!student?.storage_consent) throw fail(403, 'STORAGE_CONSENT_REQUIRED', 'Storage consent is required.');
            if (student.storage_policy_version !== currentPolicyVersion) throw fail(409, 'POLICY_VERSION_OUTDATED', 'Accept the current storage policy.');
            await client.query(`UPDATE students SET cross_border_explanation=$2,
                explanation_consented_at=CASE WHEN NOT $2 THEN NULL ELSE COALESCE(explanation_consented_at,CURRENT_TIMESTAMP) END,
                updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [student.id, accepted]);
        });
    };

    const getConsent = async ({ identity }) => {
        const lineUserId = requireIdentity(identity);
        const { rows } = await pool.query(
            'SELECT storage_consent, storage_policy_version, storage_consented_at, cross_border_explanation, explanation_consented_at FROM students WHERE line_user_id = $1',
            [lineUserId]);
        const row = rows[0];
        return { storage: row?.storage_consent === true, crossBorderExplanation: row?.cross_border_explanation === true &&
            row.storage_policy_version === currentPolicyVersion && row.explanation_consented_at != null,
            policyVersion: currentPolicyVersion, acceptedPolicyVersion: row?.storage_policy_version ?? null,
            updatedAt: row?.storage_consented_at ?? null };
    };

    const deleteData = async ({ identity }) => {
        const lineUserId = requireIdentity(identity);
        return withTransaction(pool, async (client) => {
            const { rows } = await client.query(
                'SELECT id FROM students WHERE line_user_id = $1 FOR UPDATE', [lineUserId]);
            if (!rows[0]) return;
            // Foreign keys cascade private records and clear shared creator/revision attribution.
            // Shared structures remain available to classmates. No identity audit survives deletion.
            await client.query('DELETE FROM students WHERE id = $1', [rows[0].id]);
        });
    };

    return { grantStorageConsent, setExplanationConsent, withStorageConsent, getConsent, deleteData };
};

module.exports = { createConsentService, withTransaction };
