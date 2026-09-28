import { test, expect } from '@playwright/test';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createSection, expectPoints, recordScore } from './ui-helpers.js';

test('signed chat confirmation appears in LIFF; repeated confirmation preserves a later LIFF correction', async ({ page, request }, testInfo) => {
  const token = 'browser-chat-' + testInfo.project.name;
  const lineUserId = 'U' + createHash('sha256').update(token).digest('hex').slice(0, 32);
  await page.route('**/src/line-client.js', route => route.fulfill({ contentType: 'application/javascript',
    body: 'export default {init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> ' + JSON.stringify(token) + '};' }));
  await page.goto('/');
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await createSection(page);
  await expectPoints(page,0);
  let sequence = 0;
  const send = async text => {
    const body = JSON.stringify({ events: [{ type: 'message', source: { type: 'user', userId: lineUserId },
      message: { type: 'text', text }, timestamp: Date.now() + ++sequence, webhookEventId: randomUUID(), replyToken: randomUUID() }] });
    const response = await request.post('/webhooks/line', { data: body, headers: { 'Content-Type': 'application/json',
      'x-line-signature': createHmac('sha256', 'browser-test-secret').update(body).digest('base64') } });
    expect(response.status()).toBe(200);
  };
  for (const text of ['score', '1', '1', '80', 'confirm']) await send(text);
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh course and weights' }).click();
    await expect(page.getByText('Raw marks: 80 / 100')).toBeVisible();
  }).toPass();
  await expectPoints(page,32);
  await page.screenshot({ path: testInfo.outputPath('chat-saved-in-liff.png'), fullPage: true });
  await recordScore(page,'Midterm',70);
  await expectPoints(page,28);
  // Signed provider input and fake SDK identity are local harnesses, not a live LINE claim.
  await send('confirm');
  await page.getByRole('button', { name: 'Refresh course and weights' }).click();
  await expect(page.getByText('Raw marks: 70 / 100')).toBeVisible();
});
