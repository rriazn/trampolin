const { getCompetitionById } = require('../services/db/competitions.crud');
const { renderNotFound } = require('../services/errors.service');
const { fileNameSlug } = require('../services/helpers/admin.helpers');
const { buildResultsData, buildLabels } = require('../services/results.service');
const {
    compilePdf, readUploadedTemplate, readDefaultTemplate, readSampleData, TemplateError, MAX_TEMPLATE_BYTES,
} = require('../services/pdf.service');
const { receiveUpload } = require('../middleware/upload');

const documentsUrl = (req) => `/admin/competitions/${req.params.id}/documents`;

const flashAndReturn = (req, res, message) => {
    req.session.flash = { error: message };
    res.redirect(documentsUrl(req));
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

// reads the optional template upload, a too large file becomes a flash instead of a server error
exports.receiveTemplate = receiveUpload('template', MAX_TEMPLATE_BYTES, {
    redirectTo: documentsUrl, tooLargeKey: 'results:errors.tooLarge', failedKey: 'results:errors.uploadFailed',
});

exports.getDocuments = (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition)
        return renderNotFound(res, req.t('errors:notFound.competition'));
    res.render('admin/documents', { competition });
};

exports.downloadResults = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition)
        return renderNotFound(res, req.t('errors:notFound.competition'));
    if (competition.status !== 'closed')
        return flashAndReturn(req, res, req.t('results:errors.notClosed'));

    try {
        const source = req.file ? readUploadedTemplate(req.file, req.t) : readDefaultTemplate();
        const pdf = await compilePdf(source, buildResultsData(competition, req.t, req.language), req.t);
        sendPdf(res, pdf, `attachment; filename="results-${fileNameSlug(competition.name)}.pdf"`);
    } catch (err) {
        flashTemplateError(req, res, err);
    }
};

// renders the uploaded template with the sample data in the requesting admin's language
exports.previewResultsTemplate = async (req, res) => {
    if (!getCompetitionById(req.params.id))
        return renderNotFound(res, req.t('errors:notFound.competition'));
    try {
        const source = readUploadedTemplate(req.file, req.t);
        const pdf = await compilePdf(source, { ...readSampleData(), labels: buildLabels(req.t) }, req.t);
        sendPdf(res, pdf, 'inline; filename="template-preview.pdf"');
    } catch (err) {
        flashTemplateError(req, res, err);
    }
};

exports.downloadResultsTemplate = (req, res) => {
    if (!getCompetitionById(req.params.id))
        return renderNotFound(res, req.t('errors:notFound.competition'));
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="default-template.typ"');
    res.send(readDefaultTemplate());
};
