const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/integration',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    launchOptions: {
      args: [
        '--disable-features=AutoupgradeHTTP,HttpsUpgrades',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-background-networking',
      ],
    },
  },
  workers: 1,
});
