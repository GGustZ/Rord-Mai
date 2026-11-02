const { richMenu } = require('../../../scripts/line-rich-menu.cjs');
test('Rich Menu covers the whole image once and opens only intended actions', () => {
  const menu = richMenu('123-test');
  expect(menu.areas.map(a => a.bounds.x)).toEqual([0, 834, 1667]);
  expect(menu.areas.reduce((sum, a) => sum + a.bounds.width, 0)).toBe(menu.size.width);
  expect(menu.areas.every(a => a.bounds.height === menu.size.height)).toBe(true);
  expect(menu.areas.map(a => a.action.type)).toEqual(['uri', 'message', 'message']);
  expect(menu.areas[0].action.uri).toBe('https://liff.line.me/123-test');
  expect(menu.areas.slice(1).map(a => a.action.text)).toEqual(['score', 'summary']);
  expect(() => richMenu('https://wrong.example')).toThrow();
});
