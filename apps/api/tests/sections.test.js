const { request, createApp } = require('./helpers/authenticated-app');

describe('POST /api/v1/sections/join', () => {
    let app;

    beforeEach(() => {
        app = createApp();
    });

    test.each([
    ['uppercase code', { joinCode: 'ABC123' }],
    ['lowercase code with whitespace', { joinCode: ' abc123 ' }],
  ])('accepts %s and reaches the placeholder', async (_label, body) => {
    const response = await request(app)
      .post('/api/v1/sections/join')
      .send(body);

    expect(response.status).toBe(501);
    expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  test.each([
    ['missing code', {}],
    ['numeric code', { joinCode: 123456}],
    ['short code', { joinCode: 'AB'}],
    ['long code', { joinCode: 'ABCDEFG'}],
    ['invalid characters', {joinCode: 'ABC!23'}],
    ['array body', []],
    [
      'unsupported field',
      { joinCode: 'ABC123', studentId: 'someone-else' },
    ],
  ])('rejects %s', async(_label, body) => {
    const response = await request(app)
        .post('/api/v1/sections/join')
        .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects malformed JSON', async () => {
    const response = await request(app)
      .post('/api/v1/sections/join')
      .set('Content-Type', 'application/json')
      .send('{"joinCode":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

    test('rejects an unsupported content type', async () => {
    const response = await request(app)
      .post('/api/v1/sections/join')
      .set('Content-Type', 'text/plain')
      .send('ABC123');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  test('rejects a JSON body larger than the configured limit', async () => {
    const response = await request(app)
        .post('/api/v1/sections/join')
        .send({
        joinCode: 'ABC123',
        padding: 'x'.repeat(110 * 1024),
        });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

});
