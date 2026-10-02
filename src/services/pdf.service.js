const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TYPST_BIN = process.env.TYPST_BIN || 'typst';
const MAX_TEMPLATE_BYTES = 256 * 1024;
const COMPILE_TIMEOUT_MS = 10000;
// virtual memory cap in KB for one compile
const COMPILE_MEMORY_KB = 1048576;
const TEMPLATE_DIR = path.join(__dirname, '../templates/results');
// fonts shipped with the app (Liberation Sans), system fonts are ignored so every server renders the same
const FONT_DIR = path.join(TEMPLATE_DIR, 'fonts');

class TemplateError extends Error {
    constructor(message, { line, column } = {}) {
        super(message);
        this.name = 'TemplateError';
        this.line = line;
        this.column = column;
    }
}
exports.TemplateError = TemplateError;
exports.MAX_TEMPLATE_BYTES = MAX_TEMPLATE_BYTES;

exports.readDefaultTemplate = () => fs.readFileSync(path.join(TEMPLATE_DIR, 'default.typ'), 'utf8');

exports.readSampleData = () => JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'sample-results.json'), 'utf8'));

// first error of the short diagnostics, e.g. "main.typ:2:10: error: expected expression"
function parseDiagnostic(stderr) {
    const located = stderr.match(/^main\.typ:(\d+):(\d+): error: (.*)$/m);
    if (located) return { message: located[3], line: Number(located[1]), column: Number(located[2]) };
    const plain = stderr.match(/^error: (.*)$/m);
    return plain ? { message: plain[1] } : null;
}

// runs typst on main.typ and results.json in a throwaway directory and resolves with the PDF buffer
exports.compileResultsPdf = async (templateSource, data, t, { timeoutMs = COMPILE_TIMEOUT_MS } = {}) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trampolin-results-'));
    const rootDir = path.join(workDir, 'root');
    // empty and read-only, so no package can be stored or loaded
    const packageDir = path.join(workDir, 'packages');
    const outFile = path.join(workDir, 'out.pdf');
    try {
        fs.mkdirSync(rootDir);
        fs.mkdirSync(packageDir, { mode: 0o555 });
        fs.writeFileSync(path.join(rootDir, 'main.typ'), templateSource);
        fs.writeFileSync(path.join(rootDir, 'results.json'), JSON.stringify(data));

        const { code, stderr, timedOut } = await runTypst(rootDir, outFile, packageDir, timeoutMs);
        if (timedOut) throw new TemplateError(t('results:errors.timeout'));
        if (code !== 0) {
            const diagnostic = parseDiagnostic(stderr);
            throw new TemplateError(diagnostic ? diagnostic.message : t('results:errors.compileFailed'), diagnostic || {});
        }
        return fs.readFileSync(outFile);
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
};

function runTypst(rootDir, outFile, packageDir, timeoutMs) {
    return new Promise((resolve, reject) => {
        // the shell sets the memory limit and then becomes typst, so killing the child kills typst
        const child = spawn('sh', ['-c', `ulimit -v ${COMPILE_MEMORY_KB} && exec "$0" "$@"`, TYPST_BIN,
            'compile', '--root', rootDir, '--diagnostic-format', 'short', '--ignore-system-fonts', '--font-path', FONT_DIR,
            path.join(rootDir, 'main.typ'), outFile,
        ], {
            cwd: rootDir,
            stdio: ['ignore', 'ignore', 'pipe'],
            env: { PATH: process.env.PATH, HOME: rootDir, TYPST_PACKAGE_PATH: packageDir, TYPST_PACKAGE_CACHE_PATH: packageDir },
        });

        let stderr = '';
        let timedOut = false;
        child.stderr.on('data', chunk => { stderr += chunk; });
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
        child.on('error', (err) => { clearTimeout(timer); reject(err); });
        child.on('close', (code) => { clearTimeout(timer); resolve({ code, stderr, timedOut }); });
    });
}

// checks an uploaded template file and returns its source, errors are translated for the admin
exports.readUploadedTemplate = (file, t) => {
    if (!file) throw new TemplateError(t('results:errors.noFile'));
    if (!/\.typ$/i.test(file.originalname)) throw new TemplateError(t('results:errors.notTyp'));
    if (file.size > MAX_TEMPLATE_BYTES) throw new TemplateError(t('results:errors.tooLarge'));

    let source;
    try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
        throw new TemplateError(t('results:errors.notUtf8'));
    }
    // early friendly error only, the read-only package directory is the real guard
    if (/["']@[\w-]+\//.test(source)) throw new TemplateError(t('results:errors.packages'));
    return source;
};
