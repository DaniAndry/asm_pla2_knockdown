"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAfterBuild = exports.throwError = void 0;
const constants_1 = require("./constants");
const packer_1 = require("./packer/packer");
const settings_1 = require("./settings");
exports.throwError = true;
function projectPath() {
    var _a;
    return ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || Editor.projectPath || process.cwd();
}
function settingsForBuild(options) {
    var _a;
    const packageOptions = (_a = options === null || options === void 0 ? void 0 : options.packages) === null || _a === void 0 ? void 0 : _a[constants_1.PACKAGE_NAME];
    const settings = (packageOptions === null || packageOptions === void 0 ? void 0 : packageOptions.settingsSnapshot)
        ? (0, settings_1.normalizeSettings)(packageOptions.settingsSnapshot)
        : (0, settings_1.loadSettings)(projectPath());
    return {
        settings,
        requestedByPanel: (packageOptions === null || packageOptions === void 0 ? void 0 : packageOptions.forcePack) === true,
        variationFolder: typeof (packageOptions === null || packageOptions === void 0 ? void 0 : packageOptions.variationFolder) === 'string'
            ? packageOptions.variationFolder
            : undefined,
        variantId: typeof (packageOptions === null || packageOptions === void 0 ? void 0 : packageOptions.variantId) === 'string'
            ? packageOptions.variantId
            : undefined,
    };
}
async function onAfterBuild(options, result) {
    var _a, _b;
    if ((options === null || options === void 0 ? void 0 : options.platform) !== 'web-mobile')
        return;
    if (((_b = (_a = options === null || options === void 0 ? void 0 : options.packages) === null || _a === void 0 ? void 0 : _a[constants_1.PACKAGE_NAME]) === null || _b === void 0 ? void 0 : _b.estimateOnly) === true)
        return;
    const { settings, requestedByPanel, variationFolder, variantId } = settingsForBuild(options);
    if (!requestedByPanel && !settings.autoPackCocosBuilds)
        return;
    if (!(result === null || result === void 0 ? void 0 : result.dest)) {
        throw new Error('[CGB Studio packer] Builder result does not contain an output directory.');
    }
    console.log(`[CGB Studio packer] Packing ${result.dest}`);
    const packed = await (0, packer_1.packDirectory)(result.dest, settings, {
        variationFolder: requestedByPanel ? variationFolder : undefined,
        variantId: requestedByPanel ? variantId : settings.activeVariantId,
        projectPath: projectPath(),
    });
    console.log(`[CGB Studio packer] Generated ${packed.files.length} files in ${packed.outputDirectory}`);
}
exports.onAfterBuild = onAfterBuild;
