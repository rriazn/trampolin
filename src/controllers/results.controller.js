const multer = require('multer');
const { getCompetitionById } = require('../services/db/competitions.crud');
const { renderNotFound } = require('../services/errors.service');
const { fileNameSlug } = require('../services/helpers/admin.helpers');
const { buildResultsData, buildLabels } = require('../services/results.service');
const {
    compileResultsPdf, readUploadedTemplate, readDefaultTemplate, readSampleData, TemplateError, MAX_TEMPLATE_BYTES,
} = require('../services/pdf.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_TEMPLATE_BYTES } }).single('template');

const flashAndReturn = (req, res, message) => {
    req.session.flash = { error: message };
    res.redirect('/admin/competitions');
};

// a broken template is shown to the admin, any other error is a real failure
const flashTemplateError = (req, res, err) => {
    if (!(err instanceof TemplateError)) throw err;
    const message = err.line
        ? req.t('results:errors.compileError', { line: err.line, column: err.column, message: err.message, interpolation: { escapeValue: false } })
        : err.message;
    flashAndReturn(req, res, message);
};

const sendPdf = (res, pdf, disposition) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', disposition);
    res.send(pdf);
};

// sample data with the labels of the requesting admin's language
const sampleDataFor = (req) => ({ ...readSampleData(), labels: buildLabels(req.t) });

// reads the optional template upload, a too large file becomes a flash instead of a server error
exports.receiveTemplate = (req, res, next) => {
    upload(req, res, (err) => {
        if (!err) return next();
        flashAndReturn(req, res, req.t(err.code === 'LIMIT_FILE_SIZE' ? 'results:errors.tooLarge' : 'results:errors.uploadFailed'));
    });
};

exports.downloadResults = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition)
        return renderNotFound(res, req.t('errors:notFound.competition'));
    if (competition.status !== 'closed')
        return flashAndReturn(req, res, req.t('results:errors.notClosed'));

    try {
        const source = req.file ? readUploadedTemplate(req.file, req.t) : readDefaultTemplate();
        const pdf = await compileResultsPdf(source, buildResultsData(competition, req.t, req.language), req.t);
        sendPdf(res, pdf, `attachment; filename="results-${fileNameSlug(competition.name)}.pdf"`);
    } catch (err) {
        flashTemplateError(req, res, err);
    }
};

exports.previewTemplate = async (req, res) => {
    try {
        const source = readUploadedTemplate(req.file, req.t);
        const pdf = await compileResultsPdf(source, sampleDataFor(req), req.t);
        sendPdf(res, pdf, 'inline; filename="template-preview.pdf"');
    } catch (err) {
        flashTemplateError(req, res, err);
    }
};

exports.downloadDefaultTemplate = (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="default-template.typ"');
    res.send(readDefaultTemplate());
};

// named results.json because that is the file name a template reads
exports.downloadSampleData = (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="results.json"');
    res.send(JSON.stringify(sampleDataFor(req), null, 2));
};
