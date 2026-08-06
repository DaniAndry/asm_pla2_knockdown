"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = void 0;
//@ts-ignore
const package_json_1 = __importDefault(require("../../package.json"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const https_1 = __importDefault(require("https"));
const electron_1 = require("electron");
const cache_1 = __importDefault(require("../platform/cocos/cache"));
const RUNTIME_DEPS = ["jszip", "clean-css", "cheerio", "uglify-js", "mime-types"];
const DEFAULT_GITHUB_REPO = "soluslike/coco_builder";
let depsState = {
    checked: false,
    ok: false,
    error: "",
};
let restartRequiredSticky = false;
function getExtensionVersionFromDisk() {
    try {
        const extRoot = path_1.default.join(__dirname, "..", "..");
        const pkgPath = path_1.default.join(extRoot, "package.json");
        const txt = fs_1.default.readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(txt);
        return String((pkg && pkg.version) || package_json_1.default.version || "");
    }
    catch (_e) {
        return String(package_json_1.default.version || "");
    }
}
function clearExtensionRequireCache(extRoot) {
    try {
        const root = path_1.default.resolve(extRoot);
        const rootNorm = process.platform === "win32" ? root.toLowerCase() : root;
        const currentFile = process.platform === "win32" ? __filename.toLowerCase() : __filename;
        const cache = require.cache || {};
        for (const key of Object.keys(cache)) {
            const keyNorm = process.platform === "win32" ? key.toLowerCase() : key;
            if (keyNorm.startsWith(rootNorm) && keyNorm !== currentFile) {
                delete cache[key];
            }
        }
    }
    catch (_e) { }
}
function parseGithubRepoFromUrl(url) {
    const s = String(url || "").trim();
    if (!s) {
        return "";
    }
    let m = s.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
    if (m && m[1] && m[2]) {
        return `${m[1]}/${m[2]}`;
    }
    m = s.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (m && m[1] && m[2]) {
        return `${m[1]}/${m[2]}`;
    }
    return "";
}
function getGithubRepoFallback() {
    try {
        const repo = package_json_1.default && package_json_1.default.repository;
        if (typeof repo === "string") {
            const parsed = parseGithubRepoFromUrl(repo);
            if (parsed) {
                return parsed;
            }
        }
        if (repo && typeof repo === "object" && typeof repo.url === "string") {
            const parsed = parseGithubRepoFromUrl(repo.url);
            if (parsed) {
                return parsed;
            }
        }
    }
    catch (_e) { }
    return DEFAULT_GITHUB_REPO;
}
function compareSemverLike(a, b) {
    const parse = (v) => String(v || "")
        .trim()
        .replace(/^[^\d]*/, "")
        .split(/[^\d]+/)
        .filter((x) => x.length > 0)
        .map((x) => Number(x) || 0);
    const av = parse(a);
    const bv = parse(b);
    const n = Math.max(av.length, bv.length, 3);
    for (let i = 0; i < n; i++) {
        const x = av[i] || 0;
        const y = bv[i] || 0;
        if (x > y) {
            return 1;
        }
        if (x < y) {
            return -1;
        }
    }
    return 0;
}
function fetchJson(url, redirectsLeft = 2) {
    return new Promise((resolve, reject) => {
        const req = https_1.default.get(url, {
            headers: {
                "User-Agent": "super-html-updater",
                "Accept": "application/vnd.github+json, application/json",
            },
        }, (res) => {
            const status = Number(res.statusCode || 0);
            const loc = String((res.headers && res.headers.location) || "");
            if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
                res.resume();
                fetchJson(loc, redirectsLeft - 1).then(resolve, reject);
                return;
            }
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (c) => {
                body += String(c || "");
            });
            res.on("end", () => {
                if (status < 200 || status >= 300) {
                    reject(new Error(`HTTP ${status}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body || "{}"));
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on("error", reject);
        req.setTimeout(12000, () => {
            req.destroy(new Error("request timeout"));
        });
    });
}
async function checkUpdateFromGithubOnly(params) {
    const repo = params.repo || getGithubRepoFallback();
    const currentVersion = String(params.currentVersion || "");
    const en = !!params.en;
    const apiBase = `https://api.github.com/repos/${repo}`;
    let latestVersion = "";
    let releaseUrl = `https://github.com/${repo}/releases`;
    let downloadUrl = `https://github.com/${repo}/archive/refs/heads/main.zip`;
    try {
        const rel = await fetchJson(`${apiBase}/releases/latest`);
        if (rel && typeof rel.tag_name === "string") {
            latestVersion = String(rel.tag_name).replace(/^[^\d]*/, "").trim();
        }
        if (rel && typeof rel.html_url === "string" && rel.html_url.trim()) {
            releaseUrl = rel.html_url.trim();
        }
        if (rel && typeof rel.zipball_url === "string" && rel.zipball_url.trim()) {
            downloadUrl = rel.zipball_url.trim();
        }
    }
    catch (_e) { }
    if (!latestVersion) {
        const pkg = await fetchJson(`https://raw.githubusercontent.com/${repo}/main/package.json`);
        latestVersion = String((pkg && pkg.version) || "").trim();
        if (!latestVersion) {
            throw new Error("latest version not found");
        }
    }
    const updateAvailable = compareSemverLike(currentVersion, latestVersion) < 0;
    return {
        ok: true,
        updated: false,
        checkOnly: true,
        code: updateAvailable ? "update_available" : "up_to_date",
        repo,
        currentVersion,
        latestVersion,
        updateAvailable,
        releaseUrl,
        downloadUrl,
        message: updateAvailable
            ? (en
                ? `New version available: ${latestVersion}. Download update manually.`
                : `Доступна новая версия: ${latestVersion}. Скачайте обновление вручную.`)
            : (en
                ? "Extension is already up to date."
                : "Расширение уже актуально."),
    };
}
function ensureRuntimeDependencies() {
    if (depsState.checked && depsState.ok) {
        return { ok: true, error: "" };
    }
    const extRoot = path_1.default.join(__dirname, "..", "..");
    const getMissing = () => {
        const missing = [];
        for (const modName of RUNTIME_DEPS) {
            try {
                require.resolve(modName, { paths: [extRoot] });
            }
            catch (_e) {
                missing.push(modName);
            }
        }
        return missing;
    };
    let missing = getMissing();
    if (missing.length === 0) {
        depsState = { checked: true, ok: true, error: "" };
        return { ok: true, error: "" };
    }
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const out = (0, child_process_1.spawnSync)(npmCmd, ["install", "--omit=dev", "--no-audit", "--no-fund"], {
        cwd: extRoot,
        encoding: "utf8",
        windowsHide: true,
    });
    missing = getMissing();
    if (out.error || out.status !== 0 || missing.length > 0) {
        const raw = String((out && (out.stderr || out.stdout)) || "").trim();
        const msg = raw || `npm install failed, missing: ${missing.join(", ")}`;
        depsState = { checked: true, ok: false, error: msg };
        return { ok: false, error: msg };
    }
    depsState = { checked: true, ok: true, error: "" };
    return { ok: true, error: "" };
}
function tryGetBatchRunner() {
    try {
        return require("./batch_runner");
    }
    catch (e) {
        return { error: e };
    }
}
function tryGetBatchValidator() {
    try {
        return require("./batch_iteration_validate");
    }
    catch (e) {
        return { error: e };
    }
}
/**
 * @en
 * @zh 为扩展的主进程注册方法
 */
exports.methods = {
    open_panel() {
        Editor.Panel.open(package_json_1.default.name);
    },
    query_batch_ui() {
        const dep = ensureRuntimeDependencies();
        //@ts-ignore
        const proj = Editor.Project && Editor.Project.path;
        const c = cache_1.default.get();
        let webRootHint = c.path || "";
        if (!webRootHint && proj) {
            const guess = path_1.default.join(proj, "build", "web-mobile");
            const idx = path_1.default.join(guess, "index.html");
            if (fs_1.default.existsSync(idx)) {
                const rel = path_1.default.relative(proj, guess);
                if (!rel.startsWith("..") && !path_1.default.isAbsolute(rel)) {
                    webRootHint = rel.split(/[/\\]/).join("/");
                }
                else {
                    webRootHint = guess;
                }
            }
        }
        const runner = dep.ok ? tryGetBatchRunner() : { error: dep.error };
        const channelNames = (runner && !runner.error && typeof runner.getUniqueChannelNames === "function")
            ? runner.getUniqueChannelNames()
            : [];
        return {
            channelNames,
            webRootHint,
            enableObfuscator: c.enable_obfuscator !== false,
            projectPath: proj || "",
            extensionVersion: getExtensionVersionFromDisk(),
            restartRequiredSticky,
            missingDeps: !!(runner && runner.error),
            missingDepsError: runner && runner.error ? String((runner.error && runner.error.message) || runner.error) : (dep.ok ? "" : dep.error),
        };
    },
    async pick_web_mobile_folder() {
        const data = arguments.length > 1 && arguments[1] && typeof arguments[1] === "object" ? arguments[1] : {};
        const en = data.locale === "en";
        //@ts-ignore
        const proj = Editor.Project && Editor.Project.path;
        let openAt = proj || undefined;
        if (proj) {
            const buildDir = path_1.default.join(proj, "build");
            openAt = fs_1.default.existsSync(buildDir) ? buildDir : proj;
        }
        //@ts-ignore
        const sel = await Editor.Dialog.select({
            title: en
                ? "Web Mobile folder (must contain index.html)"
                : "Папка Web Mobile (должен быть index.html)",
            type: "directory",
            path: openAt,
        });
        if (sel.canceled || !sel.filePaths || !sel.filePaths[0]) {
            return { canceled: true };
        }
        const abs = path_1.default.normalize(sel.filePaths[0]);
        const indexHtml = path_1.default.join(abs, "index.html");
        const valid = fs_1.default.existsSync(indexHtml);
        let displayPath = abs;
        if (proj) {
            const r = path_1.default.relative(proj, abs);
            if (!r.startsWith("..") && !path_1.default.isAbsolute(r)) {
                displayPath = r.split(/[/\\]/).join("/");
            }
        }
        return {
            canceled: false,
            absPath: abs,
            displayPath,
            valid,
            warning: valid
                ? ""
                : en
                    ? "No index.html in the selected folder. Run Project → Build (Web Mobile) first, or pick the real build output folder."
                    : "В выбранной папке нет index.html. Сначала выполните Project → Build (Web Mobile) или укажите папку вывода сборки.",
        };
    },
    async open_playable_applier_folder() {
        const data = arguments.length > 1 && arguments[1] && typeof arguments[1] === "object" ? arguments[1] : {};
        const en = data.locale === "en";
        const extRoot = path_1.default.join(__dirname, "..", "..");
        const dir = path_1.default.join(extRoot, "bundled-playable");
        if (!fs_1.default.existsSync(dir)) {
            throw new Error(en
                ? "Extension folder bundled-playable is missing (PlayableBatchOverrideApplier.ts)."
                : "В расширении нет папки bundled-playable (PlayableBatchOverrideApplier.ts).");
        }
        const err = await electron_1.shell.openPath(dir);
        if (err) {
            throw new Error(err);
        }
        return { ok: true, folder: dir };
    },
    async update_extension_from_github() {
        const data = arguments.length > 1 && arguments[1] && typeof arguments[1] === "object" ? arguments[1] : {};
        const en = data.locale === "en";
        const extRoot = path_1.default.join(__dirname, "..", "..");
        const currentVersion = getExtensionVersionFromDisk();
        const fallbackRepo = getGithubRepoFallback();
        const runGit = (args) => {
            const out = (0, child_process_1.spawnSync)("git", args, {
                cwd: extRoot,
                encoding: "utf8",
                windowsHide: true,
            });
            if (out.error) {
                throw out.error;
            }
            if (out.status !== 0) {
                const msg = String(out.stderr || out.stdout || "").trim();
                throw new Error(msg || `git ${args.join(" ")} failed`);
            }
            return String(out.stdout || "").trim();
        };
        try {
            runGit(["rev-parse", "--is-inside-work-tree"]);
        }
        catch (_e) {
            try {
                return await checkUpdateFromGithubOnly({
                    repo: fallbackRepo,
                    currentVersion,
                    en,
                });
            }
            catch (ee) {
                return {
                    ok: false,
                    code: "not_git_repo",
                    message: en
                        ? "Extension folder is not a git repository, and online version check failed."
                        : "Папка расширения не является git-репозиторием, и онлайн-проверка версии не удалась.",
                    hint: String((ee && ee.message) || ee || ""),
                };
            }
        }
        let remoteUrl = "";
        try {
            remoteUrl = runGit(["config", "--get", "remote.origin.url"]);
        }
        catch (_e) {
            remoteUrl = "";
        }
        if (!remoteUrl) {
            try {
                return await checkUpdateFromGithubOnly({
                    repo: fallbackRepo,
                    currentVersion,
                    en,
                });
            }
            catch (ee) {
                return {
                    ok: false,
                    code: "no_remote",
                    message: en
                        ? "Git remote origin is not configured, and online version check failed."
                        : "Не настроен git remote origin, и онлайн-проверка версии не удалась.",
                    hint: en
                        ? `Set git remote or check releases manually: https://github.com/${fallbackRepo}/releases`
                        : `Настройте git remote или проверьте релизы вручную: https://github.com/${fallbackRepo}/releases`,
                    detail: String((ee && ee.message) || ee || ""),
                };
            }
        }
        const branch = (() => {
            try {
                const b = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
                return (b && b !== "HEAD") ? b : "main";
            }
            catch (_e) {
                return "main";
            }
        })();
        try {
            runGit(["fetch", "origin", branch, "--tags"]);
            const localHead = runGit(["rev-parse", "HEAD"]);
            const remoteHead = runGit(["rev-parse", `origin/${branch}`]);
            if (localHead === remoteHead) {
                return {
                    ok: true,
                    updated: false,
                    code: "up_to_date",
                    branch,
                    remoteUrl,
                };
            }
            runGit(["pull", "--ff-only", "origin", branch]);
            clearExtensionRequireCache(extRoot);
            depsState = { checked: false, ok: false, error: "" };
            restartRequiredSticky = true;
            const dep = ensureRuntimeDependencies();
            const newHead = runGit(["rev-parse", "HEAD"]);
            return {
                ok: true,
                updated: true,
                code: "updated",
                branch,
                remoteUrl,
                previousHead: localHead,
                currentHead: newHead,
                depsReady: dep.ok,
                depsError: dep.ok ? "" : dep.error,
                restartRequired: true,
                restartMessage: en
                    ? "Update downloaded. Restart Cocos Creator to fully apply extension changes."
                    : "Обновление скачано. Перезапустите Cocos Creator, чтобы изменения расширения применились полностью.",
            };
        }
        catch (e) {
            const msg = (e && e.message) ? e.message : String(e);
            return {
                ok: false,
                code: "update_failed",
                message: msg,
            };
        }
    },
    async run_playable_batch(_e) {
        const dep = ensureRuntimeDependencies();
        if (!dep.ok) {
            throw new Error("Missing extension dependencies and auto-install failed. Details: " + dep.error);
        }
        const runner = tryGetBatchRunner();
        if (!runner || runner.error || typeof runner.runPlayableBatch !== "function") {
            const msg = runner && runner.error ? String((runner.error && runner.error.message) || runner.error) : "batch runner unavailable";
            throw new Error("Missing extension dependencies. Run `npm install` in extensions/super-html. Details: " + msg);
        }
        const args = Array.prototype.slice.call(arguments, 1);
        const p = {};
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg && typeof arg === "object" && !Array.isArray(arg)) {
                Object.assign(p, arg);
            }
        }
        const s0 = args[0];
        const w = (p.webRoot != null && String(p.webRoot).trim()) ? String(p.webRoot).trim() : "";
        if (!w && typeof s0 === "string" && s0.trim()) {
            p.webRoot = s0.trim();
        }
        if (!p.iterations && Array.isArray(args[1])) {
            p.iterations = args[1];
        }
        if (!p.enabledChannelNames && Array.isArray(args[2])) {
            p.enabledChannelNames = args[2];
        }
        if (p.enableObfuscator === undefined && typeof args[3] === "boolean") {
            p.enableObfuscator = args[3];
        }
        //@ts-ignore
        const proj = Editor.Project && Editor.Project.path;
        if (proj) {
            p.projectPath = proj;
        }
        try {
            const result = await runner.runPlayableBatch(p);
            try {
                const out = result && result.baseOut;
                if (out && fs_1.default.existsSync(out)) {
                    await electron_1.shell.openPath(out);
                }
            }
            catch (_openErr) { }
            return result;
        }
        catch (e) {
            const msg = (e && e.message) ? e.message : String(e);
            const hint = "\n[debug] args.len=" + args.length +
                " webRoot=" + JSON.stringify(p.webRoot) +
                " projectPath=" + JSON.stringify(proj || "") +
                " keys=" + JSON.stringify(Object.keys(p));
            throw new Error(msg + hint);
        }
    },
    validate_playable_batch_iterations() {
        const dep = ensureRuntimeDependencies();
        if (!dep.ok) {
            return { ok: false, error: "missing_dependencies", message: "Missing extension dependencies and auto-install failed. Details: " + dep.error, items: [] };
        }
        const validator = tryGetBatchValidator();
        if (!validator || validator.error || typeof validator.validatePlayableBatchIterations !== "function") {
            const msg = validator && validator.error ? String((validator.error && validator.error.message) || validator.error) : "validator unavailable";
            return { ok: false, error: "missing_dependencies", message: "Missing extension dependencies. Run `npm install` in extensions/super-html. Details: " + msg, items: [] };
        }
        /** Как run_playable_batch: Creator может класть payload в разные arguments после первого. */
        const args = Array.prototype.slice.call(arguments, 1);
        const merged = {};
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (!arg) {
                continue;
            }
            if (typeof arg === "object" && !Array.isArray(arg)) {
                Object.assign(merged, arg);
            }
            else if (Array.isArray(arg) && arg.length > 0 && arg[0] && typeof arg[0] === "object" && arg[0].target != null) {
                merged.iterations = arg;
            }
        }
        let iterations = Array.isArray(merged.iterations) ? merged.iterations : [];
        //@ts-ignore
        const proj = Editor.Project && Editor.Project.path;
        if (!proj) {
            return { ok: false, error: "no_project", items: [] };
        }
        return validator.validatePlayableBatchIterations(proj, iterations);
    },
};
/**
 * @en Hooks triggered after extension loading is complete
 * @zh 扩展加载完成后触发的钩子
 */
const load = function () { };
exports.load = load;
/**
 * @en Hooks triggered after extension uninstallation is complete
 * @zh 扩展卸载完成后触发的钩子
 */
const unload = function () { };
exports.unload = unload;
