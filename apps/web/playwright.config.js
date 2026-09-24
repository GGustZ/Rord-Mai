import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:4173', headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) },
  globalSetup: './tests/global-setup.js',
  projects: [
    { name:'phone',use:{viewport:{width:390,height:844}} },
    { name:'desktop',use:{viewport:{width:1280,height:900}} },
  ],
});
