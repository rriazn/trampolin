import { describe, it, expect } from 'vitest';

const { assetUrl } = require('../../../src/middleware/assets');

describe('assetUrl', () => {
  it('adds a version to an own file', () => {
    expect(assetUrl('/style.css')).toMatch(/^\/style\.css\?v=[0-9a-z]+$/);
  });

  it('adds a version to a vendor file', () => {
    expect(assetUrl('/vendor/bootstrap/css/bootstrap.min.css')).toMatch(/^\/vendor\/bootstrap\/css\/bootstrap\.min\.css\?v=[0-9a-z]+$/);
  });

  it('keeps the same version while the file is unchanged', () => {
    expect(assetUrl('/style.css')).toBe(assetUrl('/style.css'));
  });

  it('returns the plain url for a missing file or an unknown vendor package', () => {
    expect(assetUrl('/no-such-file.css')).toBe('/no-such-file.css');
    expect(assetUrl('/vendor/unknown/x.css')).toBe('/vendor/unknown/x.css');
  });
});
