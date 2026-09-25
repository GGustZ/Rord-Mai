const { request, createApp } = require('./helpers/authenticated-app');
const { validateCreateSection } = require('../src/lib/validate-create-section');

const fixture = () => ({ courseCode: ' EN123 ', courseName: 'Example', sectionNumber: '1', academicYear: 2026, semester: 1, credits: 3, gradingMode: 'criterion', withdrawalDeadline: '2026-10-30', gradeThresholds: { A: 80, 'B+': 75, B: 70, 'C+': 65, C: 60, 'D+': 55, D: 50 }, components: [{ name: 'Work', weightPercent: 60, maximumScore: 120 }, { name: 'Final', weightPercent: 40, maximumScore: 80 }] });

test('normalizes without mutating input', () => {
  const input = fixture();
  const result = validateCreateSection(input);
  expect(result.success).toBe(true);
  expect(result.data.courseCode).toBe('EN123');
  expect(input.courseCode).toBe(' EN123 ');
});

test.each([
  ['invalid date', (x) => { x.withdrawalDeadline = '2026-02-30'; }],
  ['missing thresholds', (x) => { delete x.gradeThresholds; }],
  ['unordered thresholds', (x) => { x.gradeThresholds.B = 80; }],
  ['extra nested field', (x) => { x.components[0].studentId = 'x'; }],
  ['short total', (x) => { x.components[0].weightPercent = 55; }],
  ['too much precision', (x) => { x.components[0].weightPercent = 60.001; }],
  ['numeric string', (x) => { x.credits = '3'; }],
  ['nonfinite maximum', (x) => { x.components[0].maximumScore = Infinity; }],
  ['null component', (x) => { x.components[0] = null; }],
  ['norm thresholds', (x) => { x.gradingMode = 'norm'; }],
])('rejects %s', (_name, mutate) => {
  const input = fixture(); mutate(input);
  expect(validateCreateSection(input).success).toBe(false);
});

test.each([null, [], 5, 'hello', {}])('rejects malformed section shape %p', (input) => {
  expect(validateCreateSection(input).success).toBe(false);
});

test('accepts norm without thresholds and exact decimal weights', () => {
  const input = fixture(); input.gradingMode = 'norm'; input.gradeThresholds = null;
  input.components = [33.33, 33.33, 33.34].map((weightPercent) => ({ name: 'Work', weightPercent, maximumScore: 100 }));
  expect(validateCreateSection(input).success).toBe(true);
});

test('create route validates then invokes the section service', async () => {
  const app = createApp();
  expect((await request(app).post('/api/v1/sections').send(fixture())).status).toBe(201);
  const response = await request(app).post('/api/v1/sections').send({});
  expect(response.status).toBe(400);
  expect(response.body.error.details.length).toBeGreaterThan(0);
  expect((await request(app).post('/api/v1/sections').type('text').send('x')).status).toBe(415);
});

test('health and unknown routes remain available', async () => {
  const app = createApp();
  expect((await request(app).get('/health')).body.data.status).toBe('ok');
  expect((await request(app).get('/missing')).body.error.code).toBe('ROUTE_NOT_FOUND');
});

test('unexpected errors hide internal details', async () => {
  const express = require('express');
  const { errorHandler } = require('../src/http/middleware/error-handler');
  const app = express();
  app.get('/fail', async () => { throw new Error('private database detail'); });
  app.use(errorHandler);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await request(app).get('/fail');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('private database detail');
  } finally { log.mockRestore(); }
});
