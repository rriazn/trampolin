import { describe, it, expect } from 'vitest';
import { require } from './testHelpers.js';
const { findMarkers } = require('../../../src/services/pdf-template.markers.js');

// a text run as pdf.js reports it, x and y in points, y is the baseline from the top
const run = (str, x, width, y = 100, size = 12) => ({ str, x, y, width, size });

describe('findMarkers', () => {
  it('finds a marker in one run with its position and size', () => {
    const [marker] = findMarkers([run('{{name}}', 20, 40)]);
    expect(marker).toEqual({ key: 'name', x: 20, y: 100, width: 40, size: 12 });
  });

  it('finds a marker that is split over several runs on the same baseline', () => {
    const markers = findMarkers([run('{{na', 10, 20), run('me}}', 30, 20)]);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ key: 'name', x: 10, width: 40 });
  });

  it('does not join two words that are far apart into one marker', () => {
    expect(findMarkers([run('{{na', 10, 20), run('me}}', 200, 20)])).toEqual([]);
  });

  it('keeps the position right after characters outside the basic plane', () => {
    // the emoji is two UTF-16 units but one character, so the marker starts after 2 characters of 10 points each
    const [marker] = findMarkers([run('\u{1F389} {{name}}', 0, 100)]);
    expect(marker.key).toBe('name');
    expect(marker.x).toBeCloseTo(20, 5);
    expect(marker.width).toBeCloseTo(80, 5);
  });

  it('ignores lines without markers and reads markers on several lines', () => {
    const markers = findMarkers([run('Hello', 0, 30, 50), run('{{club}}', 5, 40, 80), run('{{ name }}', 5, 50, 120)]);
    expect(markers.map(m => [m.key, m.y])).toEqual([['name', 120], ['club', 80]]);
  });
});
