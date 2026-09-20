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

    const grantStorageConsent = async ({ identity, accepted, policyVersion }) => {
        const lineUserId = requireIdentity(identity);
        // A decline must not create a student. Withdrawal is a separate operation.
        if (accepted !== true) {
            throw fail(400, 'EXPLICIT_CONSENT_REQUIRED', 'Explicit storage consent is required.');
        }
        if (policyVersion !== currentPolicyVersion) {
            throw fail(409, 'POLICY_VERSION_OUTDATED', 'Accept the current storage policy.');
        }

        return withTransaction(pool, async (client) => {
            const { rows } = await client.query(`
                INSERT INTO students (
                    line_user_id, storage_consent, storage_policy_version, storage_consented_at
                ) VALUES ($1, TRUE, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (line_user_id) DO UPDATE SET
                    storage_consent = TRUE,
                    storage_policy_version = EXCLUDED.storage_policy_version,
                    storage_consented_at = CASE
                        WHEN students.storage_consent = TRUE
                            AND students.storage_policy_version = EXCLUDED.storage_policy_version
                        THEN students.storage_consented_at
                        ELSE EXCLUDED.storage_consented_at
                    END,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id, storage_consent, storage_policy_version, storage_consented_at
            `, [lineUserId, policyVersion]);
            return rows[0];
        });
    };

    const withStorageConsent = async ({ identity }, write) => {
        const lineUserId = requireIdentity(identity);
        if (typeof write !== 'function') throw new TypeError('A write callback is required.');

        return withTransaction(pool, async (client) => {
            const { rows } = await client.query(`
                SELECT id, storage_consent
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
            return write({ client, studentId: student.id });
        });
    };

    return { grantStorageConsent, withStorageConsent };
};

module.exports = { createConsentService };
