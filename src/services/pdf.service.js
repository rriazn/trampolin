const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TYPST_BIN = process.env.TYPST_BIN || 'typst';
const MAX_TEMPLATE_BYTES = 256 * 1024;
const COMPILE_TIMEOUT_MS = 10000;
// virtual memory cap in KB for one compile
const COMPILE_MEMORY_KB = 1048576;
// typst downloads a package before it fails to store it, a proxy that refuses connections keeps that request off the network
const DEAD_PROXY = 'http://127.0.0.1:1';
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

// package location that is a file, so nothing can be stored below it, not even by root (a read-only directory would not stop root)
function createPackageGuard(workDir) {
    const guard = path.join(workDir, 'no-packages');
    fs.writeFileSync(guard, '');
    return guard;
}
exports.createPackageGuard = createPackageGuard;

// runs typst on main.typ and results.json in a throwaway directory and resolves with the PDF buffer
exports.compileResultsPdf = async (templateSource, data, t, { timeoutMs = COMPILE_TIMEOUT_MS } = {}) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trampolin-results-'));
    const rootDir = path.join(workDir, 'root');
    const outFile = path.join(workDir, 'out.pdf');
    try {
        fs.mkdirSync(rootDir);
        const packageGuard = createPackageGuard(workDir);
        fs.writeFileSync(path.join(rootDir, 'main.typ'), templateSource);
        fs.writeFileSync(path.join(rootDir, 'results.json'), JSON.stringify(data));

        const { code, stderr, timedOut } = await runTypst(rootDir, outFile, packageGuard, timeoutMs);
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

function runTypst(rootDir, outFile, packageGuard, timeoutMs) {
    return new Promise((resolve, reject) => {
        // the shell sets the memory limit and then becomes typst, so killing the child kills typst
        const child = spawn('sh', ['-c', `ulimit -v ${COMPILE_MEMORY_KB} && exec "$0" "$@"`, TYPST_BIN,
            'compile', '--root', rootDir, '--diagnostic-format', 'short', '--ignore-system-fonts', '--font-path', FONT_DIR,
            path.join(rootDir, 'main.typ'), outFile,
        ], {
            cwd: rootDir,
            stdio: ['ignore', 'ignore', 'pipe'],
            env: {
                PATH: process.env.PATH,
                HOME: rootDir,
                TYPST_PACKAGE_PATH: packageGuard,
                TYPST_PACKAGE_CACHE_PATH: packageGuard,
                HTTPS_PROXY: DEAD_PROXY,
                https_proxy: DEAD_PROXY,
                ALL_PROXY: DEAD_PROXY,
            },
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
    // early friendly error only, the package guard file is the real guard
    if (/["']@[\w-]+\//.test(source)) throw new TemplateError(t('results:errors.packages'));
    return source;
};
