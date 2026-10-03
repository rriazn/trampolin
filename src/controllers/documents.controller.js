const { getCompetitionById } = require('../services/db/competitions.crud');
const { getGroupById } = require('../services/db/groups.crud');
const { renderNotFound } = require('../services/errors.service');
const { fileNameSlug } = require('../services/helpers/admin.helpers');
const { buildResultsData, buildLabels } = require('../services/results.service');
const { readUploadedPdfTemplate, compileOverlay, buildExampleTemplate, MAX_PDF_TEMPLATE_BYTES, MARKER_KEYS } = require('../services/pdf-template.service');
const { groupReadiness, groupReadinessFor, buildCertificatesData, buildCertificateLabels } = require('../services/certificates.service');
const {
    compilePdf, readUploadedTemplate, readDefaultTemplate, readSampleData, TemplateError, MAX_TEMPLATE_BYTES,
} = require('../services/pdf.service');
const { buildZip } = require('../services/files.service');
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
    res.render('admin/documents', {
        competition,
        groups: groupReadiness(competition),
        markers: MARKER_KEYS.map(key => `{{${key}}}`).join(', '),
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
        const pdf = await compilePdf(source, buildResultsData(competition, req.t, req.language), req.t);
        sendPdf(res, pdf, `attachment; filename="results-${fileNameSlug(competition.name, 'competition')}.pdf"`);
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

// reads the optional PDF template upload of the certificates card, a too large file becomes a flash instead of a server error
exports.receiveCertificateTemplate = receiveUpload('template', MAX_PDF_TEMPLATE_BYTES, {
    redirectTo: documentsUrl, tooLargeKey: 'certificates:errors.pdfTooLarge', failedKey: 'certificates:errors.uploadFailed',
});

// the uploaded PDF template, or null for the built-in design
const readCertificateTemplate = (req) => (req.file ? readUploadedPdfTemplate(req.file, req.t) : null);

const compileCertificatesData = async (req, data, template) => {
    if (template) return compileOverlay(data, template, req.t);
    return compilePdf(readDefaultTemplate('certificates'), data, req.t, { dataFile: 'certificates.json' });
};

const compileCertificates = (req, competition, group, template) =>
    compileCertificatesData(req, buildCertificatesData(competition, group, req.t, req.language), template);

const certificatesFileName = (competition, group) => `certificates-${fileNameSlug(competition.name, 'competition')}-${fileNameSlug(group.name, 'group')}`;

// two groups can slug to the same name, a number keeps the zip entries apart
const uniqueName = (name, entries) => {
    let candidate = name;
    for (let n = 2; entries.some(e => e.name === candidate); n++) candidate = name.replace(/\.pdf$/, `-${n}.pdf`);
    return candidate;
};

exports.downloadGroupCertificates = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition)
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const group = getGroupById(req.params.gid);
    if (!group || group.competition_id !== competition.id)
        return renderNotFound(res, req.t('errors:notFound.group'));

    const readiness = groupReadinessFor(competition, group);
    if (!readiness.ready)
        return flashAndReturn(req, res, req.t('certificates:errors.notReady'));
    if (readiness.participantCount === 0)
        return flashAndReturn(req, res, req.t('certificates:errors.noParticipants'));

    try {
        const pdf = await compileCertificates(req, competition, group, await readCertificateTemplate(req));
        sendPdf(res, pdf, `attachment; filename="${certificatesFileName(competition, group)}.pdf"`);
    } catch (err) {
        flashTemplateError(req, res, err);
    }
};

exports.downloadAllCertificates = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition)
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const readyGroups = groupReadiness(competition).filter(g => g.downloadable);
    if (readyGroups.length === 0)
        return flashAndReturn(req, res, req.t('certificates:errors.noReadyGroups'));

    try {
        // the data of all groups is built before the first await, so a group deleted meanwhile cannot break the ZIP
        const jobs = readyGroups.map(({ id }) => {
            const group = getGroupById(id);
            return { group, data: buildCertificatesData(competition, group, req.t, req.language) };
        });
        const template = await readCertificateTemplate(req);
        const entries = [];
        // one after the other, each compile goes through the shared queue
        for (const { group, data } of jobs) {
            entries.push({ name: uniqueName(`${certificatesFileName(competition, group)}.pdf`, entries), buffer: await compileCertificatesData(req, data, template) });
        }
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="certificates-${fileNameSlug(competition.name, 'competition')}.zip"`);
        res.send(buildZip(entries));
    } catch (err) {
        flashTemplateError(req, res, err);
    }
};

// renders the uploaded PDF template with the sample data in the requesting admin's language
exports.previewCertificates = async (req, res) => {
    if (!getCompetitionById(req.params.id))
        return renderNotFound(res, req.t('errors:notFound.competition'));
    if (!req.file)
        return flashAndReturn(req, res, req.t('certificates:errors.noPdf'));

    try {
        const template = await readCertificateTemplate(req);
        const data = { ...readSampleData('certificates'), labels: buildCertificateLabels(req.t) };
        sendPdf(res, await compileCertificatesData(req, data, template), 'inline; filename="certificates-preview.pdf"');
    } catch (err) {
        flashTemplateError(req, res, err);
    }
};

// an example PDF design with every marker, in the language of the admin
exports.downloadCertificatesTemplate = async (req, res) => {
    if (!getCompetitionById(req.params.id))
        return renderNotFound(res, req.t('errors:notFound.competition'));
    try {
        sendPdf(res, await buildExampleTemplate(req.t), 'attachment; filename="certificates-example-template.pdf"');
    } catch (err) {
        flashTemplateError(req, res, err);
    }
};
