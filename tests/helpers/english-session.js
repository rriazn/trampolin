const base = require('@playwright/test');

// the app defaults to German, every context selects English first (login and logout keep the choice)
const test = base.test.extend({
  context: async ({ context }, use) => {
    await context.request.post('/language/en', { form: { from: '/' } });
    await use(context);
  },
});

module.exports = { test, expect: base.expect };
