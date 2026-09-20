'use strict';


const assert = require('node:assert/strict');
const { createConsentService } = require('../src/services/consent-service');

const identity = { lineUserId: 'verified-line-user' };
const fixture = ({ student, rollbackFails = false } = {}) => {
    const calls = [];
    let connections = 0;
    let released;
    const client = {
        query: async (sql, values) => {
            calls.push({ sql: sql.trim(), values });
            if (sql === 'ROLLBACK' && rollbackFails) throw new Error('rollback failed');
            return { rows: student ? [student] : [] };
        },
        release: (error) => { released = { error }; },
    };
    const pool = { connect: async () => { connections += 1; return client; } };
    const service = createConsentService({ pool, currentPolicyVersion: 'v1' });
    return { service, client, calls, connections: () => connections, released: () => released };
};

test('missing identity blocks both grant and academic writes before connecting', async () => {
    const f = fixture();
    await assert.rejects(f.service.grantStorageConsent({ accepted: true, policyVersion: 'v1' }), { status: 401 });
    await assert.rejects(f.service.withStorageConsent({}, async () => assert.fail()), { status: 401 });
    assert.equal(f.connections(), 0);
});

test('decline, missing acceptance and truthy strings do not create a student', async () => {
    const f = fixture();
    for (const accepted of [false, undefined, 'true', 1]) {
        await assert.rejects(f.service.grantStorageConsent({ identity, accepted, policyVersion: 'v1' }), {
            status: 400, code: 'EXPLICIT_CONSENT_REQUIRED',
        });
    }
    assert.equal(f.connections(), 0);
});

test('outdated policy cannot create a student', async () => {
    const f = fixture();
    await assert.rejects(f.service.grantStorageConsent({ identity, accepted: true, policyVersion: 'old' }), {
        status: 409, code: 'POLICY_VERSION_OUTDATED',
    });
    assert.equal(f.connections(), 0);
});

test('grant uses one transaction and keeps identity in query parameters', async () => {
    const f = fixture({ student: { id: 'existing-id', storage_consent: true } });
    const result = await f.service.grantStorageConsent({ identity, accepted: true, policyVersion: 'v1' });
    assert.equal(result.id, 'existing-id');
    assert.equal(f.connections(), 1);
    assert.deepEqual(f.calls[1].values, [identity.lineUserId, 'v1']);
    assert.equal(f.calls[0].sql, 'BEGIN');
    assert.equal(f.calls.at(-1).sql, 'COMMIT');
    assert.deepEqual(f.released(), { error: undefined });
});

for (const student of [undefined, { id: 's1', storage_consent: false }]) {
    test(`academic write refuses ${student ? 'declined' : 'missing'} consent`, async () => {
        const f = fixture({ student });
        await assert.rejects(f.service.withStorageConsent({ identity }, async () => assert.fail('write ran')), {
            status: 403, code: 'STORAGE_CONSENT_REQUIRED',
        });
        assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
        assert.ok(f.released());
    });
}

test('permitted callback receives the transaction client and database student ID', async () => {
    const f = fixture({ student: { id: 'database-id', storage_consent: true } });
    const result = await f.service.withStorageConsent({ identity, studentId: 'forged-id' }, async ({ client, studentId }) => {
        assert.equal(client, f.client);
        assert.equal(studentId, 'database-id');
        assert.match(f.calls[1].sql, /FOR UPDATE/);
        await client.query('example academic write');
        return 'saved';
    });
    assert.equal(result, 'saved');
    assert.equal(f.calls.at(-2).sql, 'example academic write');
    assert.equal(f.calls.at(-1).sql, 'COMMIT');
});

test('failed callback rolls back and releases connection', async () => {
    const f = fixture({ student: { id: 's1', storage_consent: true } });
    await assert.rejects(f.service.withStorageConsent({ identity }, async () => { throw new Error('write failed'); }), /write failed/);
    assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
    assert.ok(!f.calls.some(({ sql }) => sql === 'COMMIT'));
    assert.ok(f.released());
});

test('rollback failure discards the client and preserves the original error', async () => {
    const f = fixture({ student: { id: 's1', storage_consent: true }, rollbackFails: true });
    await assert.rejects(f.service.withStorageConsent({ identity }, async () => { throw new Error('write failed'); }), /write failed/);
    assert.equal(f.released().error.message, 'rollback failed');
});

