import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getAppVersion } from '../../../src/services/version.service.js';

const scratchPath = path.join(os.tmpdir(), `trampolin-version-test-${process.pid}`);

afterEach(() => {
  if (fs.existsSync(scratchPath)) fs.unlinkSync(scratchPath);
});

describe('getAppVersion', () => {
  it('returns "latest" when the VERSION file does not exist', () => {
    expect(getAppVersion(scratchPath)).toBe('latest');
  });

  it('returns the trimmed contents of the VERSION file when it exists', () => {
    fs.writeFileSync(scratchPath, '1.2.3\n');
    expect(getAppVersion(scratchPath)).toBe('1.2.3');
  });
});
