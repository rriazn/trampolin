const { test, expect } = require('@playwright/test');
const { confirmModal, acceptConfirm } = require('../helpers/confirm-modal');

let seed;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/test/seed');
  seed = await res.json();
});

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill('admin@test.com');
  await page.locator('input[name=password]').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('/admin');
}

test.describe('self-hosted front-end assets', () => {
  test('no page request leaves the app host', async ({ page }) => {
    const external = [];
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.protocol.startsWith('http') && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') external.push(req.url());
    });
    await loginAsAdmin(page);
    await page.goto('/admin/competitions');
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
  });

  test('every vendor file the shell links to is served', async ({ request }) => {
    for (const url of [
      '/vendor/bootstrap/css/bootstrap.min.css',
      '/vendor/bootstrap/js/bootstrap.bundle.min.js',
      '/vendor/bootstrap-icons/bootstrap-icons.min.css',
      '/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
      '/vendor/inter/inter-latin-wght-normal.woff2',
    ]) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
    }
  });

  test('Inter is applied to the page text', async ({ page }) => {
    await loginAsAdmin(page);
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px Inter', 'Abc');
    });
    expect(loaded).toBe(true);
  });
});

test.describe('heading structure', () => {
  const headingLevels = (page) => page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h => Number(h.tagName[1])));

  const expectNoSkippedLevel = (levels) => {
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level).toBeLessThanOrEqual(levels[i - 1] + 1);
    });
  };

  for (const [name, url] of [
    ['the admin dashboard', () => '/admin'],
    ['the judges page', () => `/admin/competitions/${seed.panelCompetitionId}/judges`],
    ['the sportsmen page', () => `/admin/competitions/${seed.competitionId}/sportsmen`],
    ['the users page', () => '/admin/users'],
  ]) {
    test(`${name} never skips a heading level`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(url());
      const levels = await headingLevels(page);
      expectNoSkippedLevel(levels);
      expect(levels).not.toContain(5);
    });
  }
});

test.describe('forms and tables', () => {
  test('the competition form selects are reachable by their label', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/competitions/new');
    await expect(page.getByLabel('Type')).toHaveAttribute('name', 'type');
    await expect(page.getByLabel(/Judge panel/i)).toHaveAttribute('name', 'panel_template_id');
  });

  test('every admin table header declares a column scope and has a name', async ({ page }) => {
    await loginAsAdmin(page);
    for (const url of ['/admin', '/admin/competitions', '/admin/users', `/admin/competitions/${seed.competitionId}/sportsmen`, `/admin/competitions/${seed.competitionId}/groups`]) {
      await page.goto(url);
      const headers = await page.locator('th').evaluateAll(ths => ths.map(th => ({ scope: th.getAttribute('scope'), name: th.textContent.trim() })));
      expect(headers.length).toBeGreaterThan(0);
      headers.forEach(h => {
        expect(h.scope).toBe('col');
        expect(h.name).not.toBe('');
      });
    }
  });
});

test.describe('wide tables', () => {
  test('scroll cue shows only while a table has more content to the right', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await loginAsAdmin(page);
    await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen`);
    const card = page.locator('.table-card').first();
    await expect(card).toHaveClass(/can-scroll-right/);
    await expect(card).not.toHaveClass(/can-scroll-left/);
    await card.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(card).toHaveClass(/can-scroll-left/);
    await expect(card).not.toHaveClass(/can-scroll-right/);
  });

  test('the cue is a solid edge, not a gradient fade', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await loginAsAdmin(page);
    await page.goto(`/admin/competitions/${seed.competitionId}/sportsmen`);
    const card = page.locator('.table-card').first();
    await expect(card).toHaveClass(/can-scroll-right/);
    const style = await card.evaluate(el => {
      const cs = getComputedStyle(el);
      return { mask: cs.maskImage, right: cs.borderRightColor, left: cs.borderLeftColor, width: cs.borderRightWidth };
    });
    expect(style.mask).toBe('none');
    expect(style.right).toBe('rgb(26, 28, 30)');
    expect(style.left).not.toBe(style.right);
    await card.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(card).not.toHaveClass(/can-scroll-right/);
    expect(await card.evaluate(el => getComputedStyle(el).borderRightWidth)).toBe(style.width);
  });

  test('no cue when the table fits', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await loginAsAdmin(page);
    await page.goto('/admin/competitions');
    await expect(page.locator('.table-card').first()).not.toHaveClass(/can-scroll/);
  });
});

test.describe('touch targets', () => {
  test('navigation controls are at least 44px on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);
    await page.locator('.navbar-toggler').click();
    for (const locator of [
      page.locator('.navbar-brand'),
      page.locator('.navbar-toggler'),
      page.locator('.navbar-main .nav-link').first(),
      page.locator('.navbar-main .lang-switcher-btn').first(),
      page.getByRole('button', { name: /Logout/ }),
    ]) {
      const box = await locator.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the dialog close button is at least 44px', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/competitions');
    await page.getByRole('row').filter({ hasText: 'Winter Cup' }).locator('button.btn-outline-danger').click();
    await expect(confirmModal(page)).toBeVisible();
    const box = await confirmModal(page).locator('.btn-close').boundingBox();
    // the dialog is still sliding in, so allow sub-pixel rounding
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  });
});

test.describe('focus and wrapping', () => {
  test('the dialog close button shows only the turquoise outline when focused by keyboard', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/competitions');
    await page.getByRole('row').filter({ hasText: 'Winter Cup' }).locator('button.btn-outline-danger').click();
    await expect(confirmModal(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    const style = await confirmModal(page).locator('.btn-close').evaluate(el => {
      const cs = getComputedStyle(el);
      return { shadow: cs.boxShadow, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` };
    });
    expect(style.shadow).toBe('none');
    expect(style.outline).toBe('solid 2px rgb(0, 124, 128)');
  });

  test('a long page title wraps instead of widening the page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await loginAsAdmin(page);
    await page.goto('/admin');
    await page.locator('.page-hero h1').evaluate(el => { el.textContent = 'Wettkampfleiterdashboardübersichtsseite'; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});

test.describe('confirm modal', () => {
  test('replaces window.confirm and focuses Cancel first', async ({ page }) => {
    let nativeDialog = false;
    page.on('dialog', d => { nativeDialog = true; d.dismiss(); });
    await loginAsAdmin(page);
    await page.goto('/admin/competitions');
    await page.getByRole('row').filter({ hasText: 'Winter Cup' }).locator('button.btn-outline-danger').click();
    await expect(confirmModal(page)).toBeVisible();
    await expect(confirmModal(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    expect(nativeDialog).toBe(false);
  });

  test('Escape closes it without submitting the form', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/competitions');
    const row = page.getByRole('row').filter({ hasText: 'Winter Cup' });
    await row.locator('button.btn-outline-danger').click();
    await expect(confirmModal(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmModal(page)).toBeHidden();
    await expect(row).toBeVisible();
  });

  test('Confirm submits the original form', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/competitions');
    const row = page.getByRole('row').filter({ hasText: 'Winter Cup' });
    await row.locator('button.btn-outline-danger').click();
    await acceptConfirm(page);
    await expect(row).toHaveCount(0);
  });
});
