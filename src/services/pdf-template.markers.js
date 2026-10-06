const MARKER = /\{\{\s*(\w+)\s*\}\}/g;
// text runs whose baselines differ by less than this many points are one line
const SAME_LINE = 1;
// a gap wider than this share of the font size separates two words
const WORD_GAP = 0.3;

// one entry per character (code point) with its x position and width, a marker split over several text runs stays contiguous
function lineCharacters(items) {
    const characters = [];
    let previousEnd = null;
    for (const item of items) {
        if (previousEnd !== null && item.x - previousEnd > item.size * WORD_GAP) characters.push({ char: ' ', x: previousEnd, width: 0, size: item.size });
        const chars = [...item.str];
        const width = chars.length ? item.width / chars.length : 0;
        chars.forEach((char, i) => characters.push({ char, x: item.x + width * i, width, size: item.size }));
        previousEnd = item.x + item.width;
    }
    return characters;
}

function groupLines(items) {
    const lines = [];
    for (const item of [...items].sort((a, b) => b.y - a.y)) {
        const line = lines.find(l => Math.abs(l.y - item.y) <= SAME_LINE);
        if (line) line.items.push(item);
        else lines.push({ y: item.y, items: [item] });
    }
    return lines.map(line => ({ y: line.y, items: line.items.sort((a, b) => a.x - b.x) }));
}

// markers in text runs { str, x, y, width, size } (y is the baseline from the top), as { key, x, y, width, size } in points
exports.findMarkers = (items) => {
    const markers = [];
    for (const line of groupLines(items)) {
        const characters = lineCharacters(line.items);
        const text = characters.map(c => c.char).join('');
        for (const match of text.matchAll(MARKER)) {
            // match.index counts UTF-16 units, the characters are code points
            const start = [...text.slice(0, match.index)].length;
            const first = characters[start];
            const last = characters[start + [...match[0]].length - 1];
            markers.push({ key: match[1], x: first.x, y: line.y, width: last.x + last.width - first.x, size: first.size });
        }
    }
    return markers;
};
