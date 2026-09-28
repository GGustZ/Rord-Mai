'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const richMenu = (liffId) => {
  if (!/^\d+-[A-Za-z0-9]+$/.test(liffId || '')) throw Error('Set a valid LIFF_ID.');
  return { size: { width: 2500, height: 843 }, selected: true, name: 'Rord-Mai progress 2026-09', chatBarText: 'Rord-Mai menu', areas: [
    { bounds: { x: 0, y: 0, width: 834, height: 843 }, action: { type: 'uri', label: 'My courses', uri: 'https://liff.line.me/' + liffId } },
    { bounds: { x: 834, y: 0, width: 833, height: 843 }, action: { type: 'message', label: 'Enter score', text: 'score' } },
    { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: 'message', label: 'My summary', text: 'summary' } },
  ] };
};
const main = async () => {
  const definition = richMenu(process.env.LIFF_ID);
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify(definition, null, 2)); return; }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw Error('Set LINE_CHANNEL_ACCESS_TOKEN privately.');
  const png = await fs.readFile(path.resolve(__dirname, '../docs/line/rich-menu.png'));
  const call = async (url, options = {}) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + token, ...options.headers } });
    if (!response.ok) throw Error('Rich Menu operation failed (HTTP ' + response.status + '). Existing menus were not deleted.');
    return response.json();
  };
  const api = 'https://api.line.me/v2/bot';
  const { richmenus } = await call(api + '/richmenu/list');
  let menu = richmenus.find(m => m.name === definition.name && isDeepStrictEqual(m.areas, definition.areas) && isDeepStrictEqual(m.size, definition.size));
  if (!menu) menu = await call(api + '/richmenu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(definition) });
  await call('https://api-data.line.me/v2/bot/richmenu/' + menu.richMenuId + '/content', {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png,
  });
  await call(api + '/user/all/richmenu/' + menu.richMenuId, { method: 'POST' });
  const current = await call(api + '/user/all/richmenu');
  if (current.richMenuId !== menu.richMenuId) throw Error('Default Rich Menu verification failed.');
  console.log('Default Rich Menu verified: ' + current.richMenuId);
};
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { richMenu };
