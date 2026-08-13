"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEstimateFingerprintEnvironment = exports.createEstimateFingerprint = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const builder_tasks_1 = require("./builder-tasks");
const dev_overrides_1 = require("./networks/dev-overrides");
function stableValue(value) {
    if (Array.isArray(value))
        return value.map(stableValue);
    if (!value || typeof value !== 'object')
        return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => ![
        'id',
        'taskId',
        'baseTaskId',
        'nativeTaskId',
        'logDest',
        'buildPath',
        'outputName',
        'sizeEstimate',
        'estimateRunId',
        'selected',
        'snapchat',
    ].includes(key))
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, item]) => [key, stableValue(item)]));
}
function stableBuilderOptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return stableValue(value);
    const options = { ...value };
    if (options.packages && typeof options.packages === 'object' && !Array.isArray(options.packages)) {
        const packages = { ...options.packages };
        delete packages['cgb-studio-packer'];
        if (Object.keys(packages).length)
            options.packages = packages;
        else
            delete options.packages;
    }
    return stableValue(options);
}
function metadataSnapshot(root, directoryName) {
    const directory = path.join(root, directoryName);
    if (!fs.existsSync(directory))
        return [];
    const output = [];
    const visit = (current) => {
        const entries = fs.readdirSync(current, { withFileTypes: true })
            .sort((first, second) => first.name.localeCompare(second.name));
        for (const entry of entries) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) {
                visit(absolute);
            }
            else if (entry.isFile()) {
                const stat = fs.statSync(absolute);
                output.push([
                    path.relative(root, absolute).replace(/\\/g, '/'),
                    stat.size,
                    Math.trunc(stat.mtimeMs),
                ].join(':'));
            }
        }
    };
    visit(directory);
    return output;
}
function settingsContents(root) {
    return [
        'settings/v2/packages/engine.json',
        'settings/v2/packages/builder.json',
        'package.json',
    ].flatMap((relative) => {
        const absolute = path.join(root, relative);
        return fs.existsSync(absolute)
            ? [{ path: relative, contents: fs.readFileSync(absolute, 'utf8') }]
            : [];
    });
}
function createEstimateFingerprint(projectPath, creatorVersion, builderOptions, settings, variant, environment) {
    const resolvedEnvironment = environment
        || createEstimateFingerprintEnvironment(projectPath, creatorVersion);
    const source = {
        extensionVersion: builder_tasks_1.EXTENSION_VERSION,
        ...resolvedEnvironment,
        builderOptions: stableBuilderOptions(builderOptions),
        buildDefaults: stableValue(settings.buildDefaults),
        obfuscate: settings.obfuscate,
        defaultOverride: (0, dev_overrides_1.defaultOverrideFingerprint)((0, dev_overrides_1.loadDeveloperOverrides)(projectPath)),
        variant: stableValue(variant),
    };
    return crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
}
exports.createEstimateFingerprint = createEstimateFingerprint;
function createEstimateFingerprintEnvironment(projectPath, creatorVersion) {
    return {
        creatorVersion,
        settingsFiles: settingsContents(projectPath),
        projectFiles: [
            ...metadataSnapshot(projectPath, 'assets'),
            ...metadataSnapshot(projectPath, 'build-templates'),
        ],
    };
}
exports.createEstimateFingerprintEnvironment = createEstimateFingerprintEnvironment;
