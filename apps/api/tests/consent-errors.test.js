const { errorHandler } = require('../src/http/middleware/error-handler');

test.each([
    [401, 'UNAUTHENTICATED'],
    [400, 'EXPLICIT_CONSENT_REQUIRED'],
    [409, 'POLICY_VERSION_OUTDATED'],
    [403, 'STORAGE_CONSENT_REQUIRED'],
])('consent error %s %s uses the public response', (status, code) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler({ status, code, message: 'private implementation detail' }, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: { code, message: expect.any(String) } });
    expect(res.json.mock.calls[0][0].error.message).not.toContain('private');
});

test('unknown errors and mismatched status codes remain private', () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        for (const error of [{ status: 403, code: 'UNKNOWN' }, { status: 500, code: 'STORAGE_CONSENT_REQUIRED' }]) {
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            errorHandler(error, {}, res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_SERVER_ERROR');
        }
    } finally { log.mockRestore(); }
});
