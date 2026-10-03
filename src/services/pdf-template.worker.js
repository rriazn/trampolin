const { parentPort, workerData } = require('worker_threads');

const { findMarkers } = require('./pdf-template.markers');

async function extract(data) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
    const page = await doc.getPage(1);
    const [left, bottom, right, top] = page.view;
    const content = await page.getTextContent();
    const items = content.items.filter(item => typeof item.str === 'string' && item.str.length > 0).map(item => ({
        str: item.str,
        x: item.transform[4] - left,
        // baseline measured from the top of the page
        y: top - item.transform[5],
        width: item.width,
        size: Math.hypot(item.transform[0], item.transform[1]),
    }));

    return { pages: doc.numPages, rotate: page.rotate, page: { width: right - left, height: top - bottom }, markers: findMarkers(items) };
}

extract(workerData.data)
    .then(result => parentPort.postMessage({ result }))
    .catch(err => parentPort.postMessage({ error: String(err && err.message || err) }));
