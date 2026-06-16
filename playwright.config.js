const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/component',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  workers: 1,
  webServer: {
    command: 'node tests/component/server.js',
    url: 'http://localhost:3001/login',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
