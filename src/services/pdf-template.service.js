const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const fileType = require('file-type');
const { TemplateError, compilePdf, readSampleData } = require('./pdf.service');
const { buildCertificateLabels } = require('./certificates.service');
const { createSlots } = require('./slots');

const MAX_PDF_TEMPLATE_BYTES = 5 * 1024 * 1024;
const READ_TIMEOUT_MS = 10000;
// PDFs that are read at the same time, more wait up to 30 s, like the compiles of the sandbox
const MAX_PARALLEL_READS = 2;
const QUEUE_WAIT_MS = 30000;
const readSlots = createSlots(MAX_PARALLEL_READS);
const WORKER_MEMORY_MB = 256;
const MAX_MARKERS = 100;
// markers a template can use, the values come from certificates.json
const MARKER_KEYS = ['name', 'club', 'partner', 'partnerClub', 'partnerLine', 'place', 'score', 'round', 'group', 'competition', 'date'];

exports.MAX_PDF_TEMPLATE_BYTES = MAX_PDF_TEMPLATE_BYTES;
exports.MARKER_KEYS = MARKER_KEYS;

// reads the first page of a PDF in a worker that is stopped after the timeout, pdf.js is pure JS so terminate really ends it
function readPdf(buffer, timeoutMs) {
    return new Promise((resolve) => {
        const worker = new Worker(path.join(__dirname, 'pdf-template.worker.js'), {
            workerData: { data: buffer },
            resourceLimits: { maxOldGenerationSizeMb: WORKER_MEMORY_MB },
        });
        const finish = (value) => { clearTimeout(timer); worker.terminate(); resolve(value); };
        const timer = setTimeout(() => finish({ error: 'timeout' }), timeoutMs);
        worker.on('message', finish);
        worker.on('error', (err) => finish({ error: err.message }));
        worker.on('exit', () => finish({ error: 'exited' }));
    });
}

// checks an uploaded PDF template and returns it with the page size and the positions of its markers, errors are translated for the admin
exports.readUploadedPdfTemplate = async (file, t, { timeoutMs = READ_TIMEOUT_MS, queueWaitMs = QUEUE_WAIT_MS } = {}) => {
    if (!file) throw new TemplateError(t('certificates:errors.noPdf'));
    if (file.size > MAX_PDF_TEMPLATE_BYTES) throw new TemplateError(t('certificates:errors.pdfTooLarge'));
    const type = await fileType.fileTypeFromBuffer(file.buffer);
    if (!type || type.mime !== 'application/pdf') throw new TemplateError(t('certificates:errors.notPdf'));

    await readSlots.acquire(queueWaitMs, () => new TemplateError(t('results:errors.busy')));
    let outcome;
    try {
        outcome = await readPdf(file.buffer, timeoutMs);
    } finally {
        readSlots.release();
    }
    const { result, error } = outcome;
    if (error) throw new TemplateError(t('certificates:errors.pdfUnreadable'));
    if (result.pages !== 1) throw new TemplateError(t('certificates:errors.pdfPages'));
    if (result.rotate !== 0) throw new TemplateError(t('certificates:errors.pdfRotated'));

    const unknown = [...new Set(result.markers.map(m => m.key).filter(key => !MARKER_KEYS.includes(key)))];
    if (unknown.length > 0) throw new TemplateError(t('certificates:errors.unknownMarker', { names: unknown.join(', '), interpolation: { escapeValue: false } }));
    if (!result.markers.some(m => m.key === 'name')) throw new TemplateError(t('certificates:errors.noNameMarker', { marker: '{{name}}', interpolation: { escapeValue: false } }));
    if (result.markers.length > MAX_MARKERS) throw new TemplateError(t('certificates:errors.tooManyMarkers'));

    return { pdf: { name: 'background.pdf', buffer: file.buffer }, layout: { page: result.page, markers: result.markers } };
};

const TEMPLATE_DIR = path.join(__dirname, '../templates/certificates');

// the fixed overlay template draws the data on the uploaded design, the layout travels as layout.json next to the design
exports.compileOverlay = async (data, template, t) => {
    try {
        return await compilePdf(
            fs.readFileSync(path.join(TEMPLATE_DIR, 'overlay.typ'), 'utf8'),
            data,
            t,
            { dataFile: 'certificates.json', files: [template.pdf, { name: 'layout.json', buffer: Buffer.from(JSON.stringify(template.layout)) }] },
        );
    } catch (err) {
        // a compile diagnostic here comes from the uploaded PDF (e.g. a version Typst cannot embed), its line in the internal template means nothing to the admin
        if (!(err instanceof TemplateError) || err.line === undefined) throw err;
        throw new TemplateError(t('certificates:errors.pdfNotUsable', { message: err.message, interpolation: { escapeValue: false } }));
    }
};

// a design with every marker in it, for admins to start from, texts in the language of t
exports.buildExampleTemplate = (t) => compilePdf(
    fs.readFileSync(path.join(TEMPLATE_DIR, 'example-template.typ'), 'utf8'),
    { ...readSampleData('certificates'), labels: buildCertificateLabels(t) },
    t,
    { dataFile: 'certificates.json' },
);
