"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
/**
 * Статический список s_name из super-html config (без require из панели — в WebView Cocos require часто ломается).
 * При необходимости дополняется через IPC query-batch-ui.
 */
const STATIC_CHANNEL_NAMES = [
    "applovin",
    "bigo",
    "common",
    "common_min",
    "facebook",
    "google",
    "ironsource",
    "ironsourcemraid",
    "kwai",
    "liftoff",
    "mintegral",
    "moloco",
    "pangle",
    "tiktok",
    "unity",
    "vungle",
].sort();
const DEFAULT_ITER = {
    enabledChannels: STATIC_CHANNEL_NAMES.slice(),
    iterations: [
        {
            folder: "full",
            target: {
                nodePath: "",
                component: "GameSessionController",
                properties: { usePlayableEndRules: false },
            },
        },
    ],
};
/** Строки панели и окна «Помощь» (RU / EN). */
const BATCH_PANEL_I18N = {
    ru: {
        panelTitle: "coco builder",
        versionLabel: "Версия:",
        btnUpdateExtension: "Обновить расширение",
        btnOpenUpdatePage: "Открыть страницу обновления",
        btnHelp: "Помощь",
        langBtnTitle: "Переключить на English",
        hintAria: "Подсказка",
        moreAria: "Подробнее",
        labelWebRoot: "Папка сборки Web Mobile",
        hintWebRoot: "Путь к выводу Project → Build → Web Mobile (внутри должны быть index.html и ресурсы).",
        phWebRoot: "build/web-mobile или обзор папки…",
        phBatchName: "NAME_PLA",
        btnBrowseWeb: "Обзор папки…",
        labelBuildName: "Имя билда (метка проекта)",
        hintBuildName: "Рядом с Web Mobile создаётся папка ИМЯ_BUILD (например NAME_PLA_BUILD) — в неё кладутся подпапки итераций. Файлы площадок: итерация_ИМЯ_канал, например 2cl_NAME_PLA_applovin.html. Перед полной сборкой содержимое ИМЯ_BUILD очищается. Пустое поле имени билда → внутри используется имя playable.",
        lblLowercase: "Имена площадок в нижнем регистре",
        hintLowercase: "Если включено: NAME_PLA → name_pla, папка name_pla_build, файлы вроде 2cl_name_pla_applovin.html — удобно, когда площадкам нужны однородные нижние пути без заглавных букв.",
        lblObfuscate: "Обфускация (как в панели super-html)",
        lblChannels: "Площадки",
        lblChannelsToggleAll: "Выбрать / снять все площадки",
        lblUseIter: "Несколько итераций (список ниже)",
        btnResetDefaults: "Сброс к умолчанию",
        hintReset: "Площадки и итерации как в примере расширения; папка Web Mobile и обфуска — из кэша super-html. Файл settings/super-html-batch-ui.json будет перезаписан.",
        hintResetAria: "Подсказка о сбросе",
        labelIterations: "Итерации — каждая даёт подпапку в папке вывода",
        hintIterations: "Имя папки итерации — подкаталог внутри ИМЯ_BUILD и префикс в именах файлов площадок (итерация_ИМЯ_канал). Компонент из поля @ccclass должен висеть на активной сцене в одном экземпляре.",
        hintIterAria: "Подсказка об итерациях",
        btnAddIter: "+ Добавить итерацию",
        btnRun: "Собрать все итерации",
        webBuildAgePrefix: "Прошло",
        webBuildAgeSuffix: "с последнего билда Web Mobile",
        webBuildAgeNoPath: "Прошло --:--:-- с последнего билда Web Mobile (путь не задан)",
        webBuildAgeNoIndex: "Прошло --:--:-- с последнего билда Web Mobile (index.html не найден)",
        btnValidate: "Проверить",
        valValidateHint: "Проверяет площадки и итерации без сборки игры. Ошибки подсвечиваются прямо в панели.",
        valNeedIter: "Проверка: включите «Несколько итераций» и добавьте строки в список.",
        valSummaryAllOk: "Проверка: класс и поля в порядке (по сценам assets/**/*.scene).",
        valSummaryHasErrors: "Проверка: есть ошибки — красные поля; зелёные совпали с классом и сценой.",
        validateIpcFail: "Проверка не выполнена: ",
        btnCopyLog: "Копировать лог / ошибку",
        copyOk: "Скопировано в буфер.",
        copyFail: "Не удалось скопировать.",
        helpTitle: "Playable batch — пошаговая инструкция",
        helpClose: "Закрыть",
        helpLeadHtml: "Один билд <strong>Web Mobile</strong> → несколько вариантов. Компонент <strong>PlayableBatchOverrideApplier</strong> на сцене применяет настройки итерации автоматически.",
        helpMainSection: "Главное",
        helpGeneralSection: "Общее",
        helpStep1Title: "Скрипт в проекте (обязательно)",
        helpStep1Tip: "Скопируйте PlayableBatchOverrideApplier.ts в assets и добавьте этот компонент на сцену (обычно на Canvas).",
        btnOpenApplierFolder: "Открыть папку со скриптом…",
        helpStep2Title: "Сборка Web Mobile (обязательно)",
        helpStep2Tip: "Project → Build → Web Mobile. В окне сборки отключите WebGL 2.0 (WebGL 2.0 OFF) и выберите движок Asm.js / ASMJS там, где это доступно в вашей версии Cocos — так стабильнее для playable. Должна получиться папка с index.html и ресурсами — без этого batch не собрать.",
        helpStep3Title: "Площадки",
        helpStep3Tip: "Список сверху вниз. applovin: опция AXON trackEvent('LOADING') в head; остальное — в коде. ironsourcemraid: «!» у строки канала — SoundManager и MRAID. По панели у полей тоже есть «!».",
        helpStep4Title: "Запуск",
        helpStep4Tip: "Кнопка «Собрать все итерации» на главной панели. Лог внизу; при успехе может открыться папка ИМЯ_BUILD.",
        helpG1Title: "Папка сборки Web Mobile",
        helpG1Tip: "В основной панели укажите путь к выводу Web Mobile или «Обзор папки…». У заголовка поля есть «!» с подсказкой.",
        helpG2Title: "Имя билда и регистр имён",
        helpG2Tip: "Метка проекта (например NAME_PLA): рядом с Web Mobile создаётся папка ИМЯ_BUILD. Файлы площадок: итерация_ИМЯ_канал. Перед полной сборкой содержимое ИМЯ_BUILD очищается. Пустое имя → playable. Галочка «нижний регистр» — name_pla_build и 2cl_name_pla_applovin.html.",
        helpG3Title: "Обфускация",
        helpG3Tip: "Как в основной панели super-html: запутывание JS в выходном HTML. Значение по умолчанию из кэша расширения.",
        helpG4Title: "Итерации и сохранение",
        helpG4Tip: "Имя папки итерации — подкаталог в ИМЯ_BUILD и префикс в именах файлов. Выберите компонент и его поля — они применяются при сборке. Настройки в settings/super-html-batch-ui.json. «Сброс к умолчанию» — пример из расширения.",
        chApplovinAxonInline: " AXON: trackEvent('LOADING') в <head>",
        chApplovinAxonAria: "Подсказка AXON",
        chApplovinAxonTip: "В <head> подставляется вызов ALPlayableAnalytics.trackEvent('LOADING'). Остальные события AXON настраиваются в коде игры.",
        chIronAria: "Подсказка ironSource MRAID",
        chIronTip: "1) Нужен скрипт SoundManager. 2) В нем должен быть метод mute(). 3) В нем должен быть метод offbutton().",
        lblDebugPlatforms: "Режим дебага площадок (эмуляция SDK)",
        hintDebugPlatforms: "Добавляет эмуляцию SDK выбранной площадки и цветные debug-логи (зелёный/красный). Для ironSource MRAID появляется debug-кнопка вызова offbutton().",
        propKeyPh: "переменная",
        propValPh: "true, 2, \"текст\"",
        iterTitle: "Итерация",
        iterCopy: "Копировать",
        iterPaste: "Вставить",
        iterDelete: "Удалить",
        iterCopyOk: "Итерация скопирована (буфер + память панели).",
        iterCopyMem: "Итерация в памяти панели (буфер недоступен).",
        iterPasteEmpty: "Вставить: нет данных — сначала «Копировать» на другой итерации.",
        iterFldFolder: "Папка вывода",
        iterFldFolderPh: "например full",
        iterFldFolderTip: "Подкаталог внутри папки ИМЯ_BUILD; это же префикс в именах файлов площадок (итерация_ИМЯ_канал).",
        iterFldComp: "Компонент (имя класса)",
        iterFldCompTip: "Введите имя компонента из проекта. Этот компонент должен быть на активной сцене.",
        iterFldProps: "Поля компонента",
        iterFldPropsTip: "Пары имя свойства и значение (как в инспекторе): true/false, числа, строки в кавычках.",
        valPlatformsSummaryAllOk: "Площадки: все выбранные площадки готовы.",
        valPlatformsSummaryHasErrors: "Площадки: найдены проблемы. Красные площадки требуют правок.",
        valNeedWebRoot: "Не указана папка Web Mobile.",
        valNeedWebIndex: "В папке Web Mobile нет index.html.",
        valNoChannels: "Не выбрано ни одной площадки.",
        valIronNeedScript: "Нужен SoundManager скрипт.",
        valIronNeedMute: "В SoundManager должен быть метод mute().",
        valIronNeedOffbutton: "В SoundManager должен быть метод offbutton().",
        valChannelScriptMissing: "В расширении не найден script.js для площадки.",
        valChannelMetaMissing: "В расширении не найден meta.html для площадки.",
        valChannelConfigMissing: "В расширении не найден config.json для площадки.",
        chStatusIdle: "не проверено",
        chStatusOk: "OK",
        chStatusBad: "ошибка",
        iterAddProp: "+ свойство",
        folderOpened: "Папка открыта в проводнике.",
        folderOpenFail: "Не удалось открыть папку.",
        logCopyApplier: "Скопируйте в assets/… : ",
        logApplierErr: "Открыть папку со скриптом: ",
        applierStatusChecking: "Проверяем наличие скрипта…",
        applierStatusInstalled: "Скрипт найден и добавлен на сцену",
        applierStatusScriptOnly: "Скрипт найден, но на сцене не обнаружен",
        applierStatusMissing: "Скрипт не найден в папке assets",
        pickCancel: "Выбор папки отменён",
        pickOk: "Папка Web Mobile: ",
        pickErr: "Обзор папки: ",
        resetOk: "Сброшено к умолчанию. Записано в settings/super-html-batch-ui.json.",
        needIter: "Добавьте хотя бы одну итерацию в списке.",
        runStart: "Запуск… webRoot = ",
        runMid: " | билд = ",
        runEnd: " | нижний регистр = ",
        buildErr: "Ошибка сборки: ",
        channelsMissing: "Не найден блок #channels (root=",
        channelsMissing2: "). Сообщите версию Creator.",
        ipcBatchUi: "IPC query-batch-ui: ",
        errBundledMissing: "В расширении нет папки bundled-playable (PlayableBatchOverrideApplier.ts).",
        depsMissingWarn: "Внимание: не установлены npm-зависимости расширения. Выполните `npm install` в extensions/super-html.",
        updateStart: "Проверка обновлений расширения…",
        updateUpToDate: "Расширение уже актуально.",
        updateDone: "Расширение обновлено из GitHub.",
        updateRestartRequired: "Чтобы изменения применились полностью, перезапустите Cocos Creator.",
        updateRestartSticky: "После обновления перезапустите Cocos Creator.",
        updateAvailableManual: "Доступна новая версия. Скачайте обновление вручную.",
        updateAvailableVersion: "Новая версия: ",
        updateDownloadPrefix: "Скачать: ",
        updateNoRemote: "Не настроен git remote origin для расширения.",
        updateFailed: "Ошибка обновления: ",
        updateHintPrefix: "Подсказка: ",
        updateStateIdle: "Статус: —",
        updateStateChecking: "Статус: проверка обновлений…",
        updateStateUpdated: "Статус: обновлено",
        updateStateRestart: "Статус: критично — перезапустите Cocos Creator",
        updateStateAvailable: "Статус: доступно обновление",
        updateStateLatest: "Статус: у вас последняя версия",
        updateStateFailed: "Статус: ошибка обновления",
    },
    en: {
        panelTitle: "coco builder",
        versionLabel: "Version:",
        btnUpdateExtension: "Update extension",
        btnOpenUpdatePage: "Open update page",
        btnHelp: "Help",
        langBtnTitle: "Switch to Russian",
        hintAria: "Hint",
        moreAria: "Details",
        labelWebRoot: "Web Mobile build folder",
        hintWebRoot: "Path to Project → Build → Web Mobile output (must contain index.html and assets).",
        phWebRoot: "build/web-mobile or browse…",
        phBatchName: "NAME_PLA",
        btnBrowseWeb: "Browse folder…",
        labelBuildName: "Build name (project label)",
        hintBuildName: "Next to Web Mobile output, a folder NAME_BUILD is created (e.g. NAME_PLA_BUILD) with iteration subfolders. Channel files: iteration_NAME_channel, e.g. 2cl_NAME_PLA_applovin.html. NAME_BUILD is cleared before a full batch. Empty build name → playable name is used internally.",
        lblLowercase: "Lowercase channel file names",
        hintLowercase: "When on: NAME_PLA → name_pla, folder name_pla_build, files like 2cl_name_pla_applovin.html — useful when networks expect uniform lowercase paths.",
        lblObfuscate: "Obfuscation (same as main super-html panel)",
        lblChannels: "Networks / channels",
        lblChannelsToggleAll: "Select / clear all channels",
        lblUseIter: "Multiple iterations (list below)",
        btnResetDefaults: "Reset to defaults",
        hintReset: "Channels and iterations as in the extension sample; Web Mobile path and obfuscation from super-html cache. Overwrites settings/super-html-batch-ui.json.",
        hintResetAria: "Reset hint",
        labelIterations: "Iterations — each becomes a subfolder in the output",
        hintIterations: "Iteration folder name is a subfolder inside NAME_BUILD and the prefix in channel file names (iteration_NAME_channel). The @ccclass component must exist once on the active scene.",
        hintIterAria: "Iterations hint",
        btnAddIter: "+ Add iteration",
        btnRun: "Build all iterations",
        webBuildAgePrefix: "Elapsed",
        webBuildAgeSuffix: "since last Web Mobile build",
        webBuildAgeNoPath: "Elapsed --:--:-- since last Web Mobile build (path is empty)",
        webBuildAgeNoIndex: "Elapsed --:--:-- since last Web Mobile build (index.html not found)",
        btnValidate: "Validate",
        valValidateHint: "Checks networks and iterations without running a build. Issues are highlighted in the panel.",
        valNeedIter: "Validation: turn on multiple iterations and add rows to the list.",
        valSummaryAllOk: "Validation: class and fields look good (against .scene files).",
        valSummaryHasErrors: "Validation: issues found — red fields; green matched class + scene.",
        validateIpcFail: "Validation failed: ",
        btnCopyLog: "Copy log / error",
        copyOk: "Copied to clipboard.",
        copyFail: "Copy failed.",
        helpTitle: "Playable batch — step-by-step",
        helpClose: "Close",
        helpLeadHtml: "One <strong>Web Mobile</strong> build → several variants. The <strong>PlayableBatchOverrideApplier</strong> component applies each iteration settings on the scene.",
        helpMainSection: "Essentials",
        helpGeneralSection: "General",
        helpStep1Title: "Script in the project (required)",
        helpStep1Tip: "Copy PlayableBatchOverrideApplier.ts into assets and add this component to the scene (usually Canvas).",
        btnOpenApplierFolder: "Open script folder…",
        helpStep2Title: "Web Mobile build (required)",
        helpStep2Tip: "Project → Build → Web Mobile. In the build dialog turn WebGL 2.0 OFF and pick Asm.js / ASMJS where your Cocos version allows — more stable for playables. You need a folder with index.html and assets — batch cannot run without it.",
        helpStep3Title: "Networks / channels",
        helpStep3Tip: "List top to bottom. applovin: AXON trackEvent('LOADING') in head; the rest is in code. ironsourcemraid: “!” on the row — SoundManager and MRAID. The main panel also has “!” hints on fields.",
        helpStep4Title: "Run",
        helpStep4Tip: "Use “Build all iterations” on the main panel. Log at the bottom; on success the NAME_BUILD folder may open.",
        helpG1Title: "Web Mobile build folder",
        helpG1Tip: "On the main panel set the Web Mobile output path or use “Browse folder…”. The field title has a “!” hint.",
        helpG2Title: "Build name and name casing",
        helpG2Tip: "Project label (e.g. NAME_PLA): NAME_BUILD next to Web Mobile; files iteration_NAME_channel. NAME_BUILD is cleared before a full batch. Empty name → playable. “Lowercase” checkbox → name_pla_build and 2cl_name_pla_applovin.html.",
        helpG3Title: "Obfuscation",
        helpG3Tip: "Same as the main super-html panel: obfuscates JS in the output HTML. Default from extension cache.",
        helpG4Title: "Iterations and saving",
        helpG4Tip: "Iteration folder → subfolder in NAME_BUILD and file name prefix. Select component fields and they are applied per iteration. Settings in settings/super-html-batch-ui.json. “Reset to defaults” loads the sample.",
        chApplovinAxonInline: " AXON: trackEvent('LOADING') in <head>",
        chApplovinAxonAria: "AXON hint",
        chApplovinAxonTip: "Injects ALPlayableAnalytics.trackEvent('LOADING') in <head>. Other AXON events are configured in game code.",
        chIronAria: "ironSource MRAID hint",
        chIronTip: "1) Add a SoundManager script. 2) It must have mute(). 3) It must have offbutton().",
        lblDebugPlatforms: "Platform debug mode (SDK emulation)",
        hintDebugPlatforms: "Injects selected-network SDK emulation with green/red debug logs. For ironSource MRAID it also adds a debug button that calls offbutton().",
        propKeyPh: "property",
        propValPh: "true, 2, \"text\"",
        iterTitle: "Iteration",
        iterCopy: "Copy",
        iterPaste: "Paste",
        iterDelete: "Delete",
        iterCopyOk: "Iteration copied (clipboard + panel memory).",
        iterCopyMem: "Iteration stored in panel memory (clipboard unavailable).",
        iterPasteEmpty: "Paste: no data — use Copy on another iteration first.",
        iterFldFolder: "Output folder",
        iterFldFolderPh: "e.g. full",
        iterFldFolderTip: "Subfolder inside NAME_BUILD; also the prefix in channel file names (iteration_NAME_channel).",
        iterFldComp: "Component (class name)",
        iterFldCompTip: "Enter the component name from your project. This component must exist on the active scene.",
        iterFldProps: "Component fields",
        iterFldPropsTip: "Property name/value pairs (inspector-style): true/false, numbers, quoted strings.",
        valPlatformsSummaryAllOk: "Networks: all selected networks look ready.",
        valPlatformsSummaryHasErrors: "Networks: issues found. Red rows need fixes.",
        valNeedWebRoot: "Web Mobile folder is empty.",
        valNeedWebIndex: "Web Mobile folder does not contain index.html.",
        valNoChannels: "No network is selected.",
        valIronNeedScript: "SoundManager script is required.",
        valIronNeedMute: "SoundManager must include mute().",
        valIronNeedOffbutton: "SoundManager must include offbutton().",
        valChannelScriptMissing: "Extension is missing network script.js template.",
        valChannelMetaMissing: "Extension is missing network meta.html template.",
        valChannelConfigMissing: "Extension is missing network config.json template.",
        chStatusIdle: "not checked",
        chStatusOk: "OK",
        chStatusBad: "error",
        iterAddProp: "+ property",
        folderOpened: "Folder opened in file manager.",
        folderOpenFail: "Could not open folder.",
        logCopyApplier: "Copy to assets/… : ",
        logApplierErr: "Open script folder: ",
        applierStatusChecking: "Checking script presence…",
        applierStatusInstalled: "Script found and attached on scene",
        applierStatusScriptOnly: "Script found, but not detected on any scene",
        applierStatusMissing: "Script not found in assets folder",
        pickCancel: "Folder pick canceled",
        pickOk: "Web Mobile folder: ",
        pickErr: "Browse folder: ",
        resetOk: "Reset to defaults. Written to settings/super-html-batch-ui.json.",
        needIter: "Add at least one iteration to the list.",
        runStart: "Starting… webRoot = ",
        runMid: " | build = ",
        runEnd: " | lowercase = ",
        buildErr: "Build error: ",
        channelsMissing: "Missing #channels block (root=",
        channelsMissing2: "). Report Creator version.",
        ipcBatchUi: "IPC query-batch-ui: ",
        errBundledMissing: "Extension folder bundled-playable is missing (PlayableBatchOverrideApplier.ts).",
        depsMissingWarn: "Warning: extension npm dependencies are missing. Run `npm install` in extensions/super-html.",
        updateStart: "Checking extension updates…",
        updateUpToDate: "Extension is already up to date.",
        updateDone: "Extension updated from GitHub.",
        updateRestartRequired: "Restart Cocos Creator to fully apply extension changes.",
        updateRestartSticky: "After update, restart Cocos Creator.",
        updateAvailableManual: "New version available. Download update manually.",
        updateAvailableVersion: "Latest version: ",
        updateDownloadPrefix: "Download: ",
        updateNoRemote: "Git remote origin is not configured for this extension.",
        updateFailed: "Update failed: ",
        updateHintPrefix: "Hint: ",
        updateStateIdle: "Status: -",
        updateStateChecking: "Status: checking updates...",
        updateStateUpdated: "Status: updated",
        updateStateRestart: "Status: critical - restart Cocos Creator",
        updateStateAvailable: "Status: update available",
        updateStateLatest: "Status: you're on latest version",
        updateStateFailed: "Status: update error",
    },
};
const EXT = "super-html";
let _pkgJson;
function getExtensionIds() {
    const ids = [];
    try {
        _pkgJson = _pkgJson || require("../../package.json");
        if (_pkgJson.name) {
            ids.push(_pkgJson.name);
        }
        if (_pkgJson.uuid) {
            ids.push(_pkgJson.uuid);
        }
    }
    catch (_a) { }
    if (!ids.length) {
        ids.push(EXT);
    }
    return Array.from(new Set(ids));
}
function getEditor() {
    return typeof globalThis !== "undefined" ? globalThis.Editor : undefined;
}
function getProjectPath() {
    const ed = getEditor();
    try {
        if (ed && ed.Project && ed.Project.path) {
            return ed.Project.path;
        }
    }
    catch (_a) { }
    return "";
}
function mergeUniqueSorted(a, b) {
    return Array.from(new Set([...a, ...b])).sort();
}
function getChannelNamesFromConfigBestEffort() {
    let fromRequire = [];
    try {
        const cfg = require("../../core/config/config").default;
        const arr = cfg.inject_channel_adapter || [];
        const seen = new Set();
        for (const ch of arr) {
            if (ch && ch.s_name && !seen.has(ch.s_name)) {
                seen.add(ch.s_name);
                fromRequire.push(ch.s_name);
            }
        }
    }
    catch (_a) { }
    if (fromRequire.length > 0) {
        return mergeUniqueSorted(STATIC_CHANNEL_NAMES, fromRequire);
    }
    return STATIC_CHANNEL_NAMES.slice();
}
function walkProjectFiles(root, exts, out = []) {
    if (!root || !fs.existsSync(root)) {
        return out;
    }
    let dirents = [];
    try {
        dirents = fs.readdirSync(root, { withFileTypes: true });
    }
    catch (_e) {
        return out;
    }
    for (const d of dirents) {
        const p = path.join(root, d.name);
        if (d.isDirectory()) {
            if (d.name === "node_modules" || d.name === ".git" || d.name.startsWith(".")) {
                continue;
            }
            walkProjectFiles(p, exts, out);
            continue;
        }
        if (!d.isFile()) {
            continue;
        }
        const low = d.name.toLowerCase();
        if (exts.some((e) => low.endsWith(e))) {
            out.push(p);
        }
    }
    return out;
}
let _embeddedChannelTemplates = null;
function getEmbeddedChannelTemplates() {
    if (_embeddedChannelTemplates) {
        return _embeddedChannelTemplates;
    }
    try {
        const cfg = require("../../core/config/json.js");
        _embeddedChannelTemplates = (cfg && cfg.default && typeof cfg.default === "object") ? cfg.default : {};
    }
    catch (_e) {
        _embeddedChannelTemplates = {};
    }
    return _embeddedChannelTemplates;
}
function hasChannelTemplateAsset(channelName, fileName) {
    const data = getEmbeddedChannelTemplates();
    const key = "channel/" + channelName + "/" + fileName;
    return !!(data && data[key]);
}
function resolvePanelRoot(ctx) {
    const cands = [];
    if (ctx && typeof ctx.querySelector === "function") {
        cands.push(ctx);
    }
    if (ctx && ctx.shadowRoot) {
        cands.push(ctx.shadowRoot);
    }
    if (ctx && ctx.parentElement) {
        cands.push(ctx.parentElement);
    }
    for (const r of cands) {
        if (r && r.querySelector && r.querySelector("#channels")) {
            return r;
        }
    }
    return (ctx && ctx.shadowRoot) || ctx;
}
async function ipcToMain(message, data) {
    const ed = getEditor();
    if (!ed || !ed.Message || typeof ed.Message.request !== "function") {
        throw new Error("Editor.Message.request недоступен в этой панели");
    }
    const payload = data !== undefined ? data : {};
    /** В Creator 3.8 первый аргумент — имя пакета или uuid, НЕ префикс @name (иначе «Message does not exist: @super-html - …»). */
    const extIds = getExtensionIds();
    let lastErr;
    for (const extId of extIds) {
        try {
            return await ed.Message.request(extId, message, payload);
        }
        catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}
/** Несколько аргументов в IPC (надёжнее, чем один объект — main снова соберёт payload). */
async function ipcToMainMulti(message) {
    const ipcArgs = Array.prototype.slice.call(arguments, 1);
    const ed = getEditor();
    if (!ed || !ed.Message || typeof ed.Message.request !== "function") {
        throw new Error("Editor.Message.request недоступен в этой панели");
    }
    const extIds = getExtensionIds();
    let lastErr;
    for (const extId of extIds) {
        try {
            const arr = [extId, message].concat(ipcArgs);
            return await ed.Message.request.apply(ed.Message, arr);
        }
        catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}
function cleanWebRootValue(textareaEl) {
    if (!textareaEl) {
        return "";
    }
    return String(textareaEl.value || "")
        .trim()
        .replace(/[\u200b-\u200d\ufeff\u00a0]/g, "")
        .replace(/^["'«»]+|["'«»]+$/g, "");
}
const DEFAULT_BATCH_BUILD_NAME = "NAME_PLA";
function cleanBatchBuildNameValue(inputEl) {
    if (!inputEl) {
        return "";
    }
    return String(inputEl.value || "")
        .trim()
        .replace(/[\u200b-\u200d\ufeff\u00a0]/g, "")
        .replace(/^["'«»]+|["'«»]+$/g, "");
}
function valueToPropInputString(v) {
    if (v === null || v === undefined) {
        return "";
    }
    if (typeof v === "string") {
        return v;
    }
    return JSON.stringify(v);
}
function parsePropInputString(s) {
    const t = String(s).trim();
    if (t === "") {
        return "";
    }
    try {
        return JSON.parse(t);
    }
    catch (_e) {
        return t;
    }
}
/** Приводит одну запись iterations[] из JSON к полям формы. */
function normalizeIterationFromData(it) {
    const folder = (it && it.folder) ? String(it.folder) : "default";
    let nodePath = "";
    let component = "GameSessionController";
    let properties = {};
    if (it && it.target && typeof it.target === "object") {
        nodePath = String(it.target.nodePath != null ? it.target.nodePath : "");
        component = String(it.target.component || component);
        properties =
            it.target.properties && typeof it.target.properties === "object"
                ? Object.assign({}, it.target.properties)
                : {};
    }
    else if (it && Array.isArray(it.targets) && it.targets[0]) {
        const t0 = it.targets[0];
        nodePath = String(t0.nodePath != null ? t0.nodePath : "");
        component = String(t0.component || component);
        properties =
            t0.properties && typeof t0.properties === "object"
                ? Object.assign({}, t0.properties)
                : {};
    }
    else if (it && it.overrides && typeof it.overrides === "object") {
        nodePath = String(it.nodePath != null ? it.nodePath : "");
        component = String(it.component || component);
        properties = Object.assign({}, it.overrides);
    }
    return { folder, nodePath, component, properties };
}
function normalizeIterationPastePayload(obj) {
    if (!obj || typeof obj !== "object") {
        return null;
    }
    if (obj.target || obj.targets || obj.overrides) {
        return normalizeIterationFromData(obj);
    }
    return {
        folder: String(obj.folder != null ? obj.folder : "new"),
        nodePath: String(obj.nodePath != null ? obj.nodePath : ""),
        component: String(obj.component != null ? obj.component : "GameSessionController"),
        properties:
            obj.properties && typeof obj.properties === "object"
                ? Object.assign({}, obj.properties)
                : {},
    };
}
exports.$ = {
    webRoot: "#webRoot",
    batchBuildName: "#batchBuildName",
    batchNamesLowercase: "#batchNamesLowercase",
    channels: "#channels",
    useIter: "#useIter",
    iterBlock: "#iterBlock",
    iterListHost: "#iterListHost",
    btnAddIter: "#btnAddIter",
    btnRun: "#btnRun",
    webBuildAgeChip: "#webBuildAgeChip",
    btnValidateIters: "#btnValidateIters",
    btnResetDefaults: "#btnResetDefaults",
    obf: "#obf",
    log: "#log",
    btnBrowseWeb: "#btnBrowseWeb",
    btnCopyLog: "#btnCopyLog",
    copyStatus: "#copyStatus",
    btnOpenApplierFolder: "#btnOpenApplierFolder",
    btnOpenApplierFolderTop: "#btnOpenApplierFolderTop",
    stepActionStatus: "#stepActionStatus",
    topActionStatus: "#topActionStatus",
    applierInstallBadge: "#applierInstallBadge",
    topRequiredBanner: "#topRequiredBanner",
    channelToggleAll: "#channelToggleAll",
    debugAllPlatforms: "#debugAllPlatforms",
    btnUpdateExtension: "#btnUpdateExtension",
    btnOpenUpdatePage: "#btnOpenUpdatePage",
    extVersionLabel: "#extVersionLabel",
    updateStatusChip: "#updateStatusChip",
    updateRestartNotice: "#updateRestartNotice",
    btnLang: "#btnLang",
    btnHelp: "#btnHelp",
    helpOverlay: "#helpOverlay",
    helpBackdrop: "#helpBackdrop",
    btnHelpClose: "#btnHelpClose",
    hintBubble: "#hintBubble",
};
exports.template = `
<div class="batch-panel-root" id="batchPanelRoot">
<div class="panel-scroll">
  <div class="panel-head">
    <h3 class="title" data-i18n="panelTitle">coco builder</h3>
    <div class="panel-head-actions">
      <button type="button" class="btn btn-lang" id="btnLang" title="" aria-label="">🇷🇺</button>
      <button type="button" class="btn btn-help" id="btnHelp" data-i18n="btnHelp">Помощь</button>
    </div>
  </div>
  <div class="update-top-row">
    <div id="extVersionLabel" class="ext-version-label">Версия: -</div>
    <span id="updateStatusChip" class="update-status-chip update-status-chip--idle">Статус: —</span>
    <button type="button" class="btn btn-update-ext" id="btnUpdateExtension" data-i18n="btnUpdateExtension">Обновить расширение</button>
    <button type="button" class="btn btn-update-link" id="btnOpenUpdatePage" data-i18n="btnOpenUpdatePage" hidden>Открыть страницу обновления</button>
  </div>
  <div id="updateRestartNotice" class="update-restart-notice" hidden>После обновления перезапустите Cocos Creator.</div>
  <div class="top-required-banner" id="topRequiredBanner">
    <div class="top-required-banner-head">
      <span class="top-required-banner-mark">!</span>
      <strong class="top-required-banner-title" data-i18n="helpStep1Title">Скрипт в проекте (обязательно)</strong>
    </div>
      <p class="top-required-banner-tip" data-i18n="helpStep1Tip">Скопируйте PlayableBatchOverrideApplier.ts в assets и добавьте этот компонент на сцену (обычно на Canvas).</p>
    <div class="top-required-banner-toolbar">
      <button type="button" class="btn btn-sm" id="btnOpenApplierFolderTop" data-i18n="btnOpenApplierFolder">Открыть папку со скриптом…</button>
      <div id="applierInstallBadge" class="top-required-banner-badge top-required-banner-badge--checking">Проверяем наличие скрипта…</div>
      <div id="topActionStatus" class="help-step-status"></div>
    </div>
  </div>
  <div class="row">
    <label class="lbl lbl-with-hint">
      <span data-i18n="labelWebRoot">Папка сборки Web Mobile</span>
      <button type="button" class="hint-tip" data-i18n-aria="hintAria" data-i18n-title="hintWebRoot" aria-label="Подсказка" title="">!</button>
    </label>
    <textarea id="webRoot" class="twide" rows="2" data-i18n-placeholder="phWebRoot" placeholder="build/web-mobile или обзор папки…"></textarea>
    <div class="web-row">
      <button type="button" class="btn" id="btnBrowseWeb" data-i18n="btnBrowseWeb">Обзор папки…</button>
    </div>
  </div>
  <div class="row">
    <label class="lbl lbl-with-hint">
      <span data-i18n="labelBuildName">Имя билда (метка проекта)</span>
      <button type="button" class="hint-tip" data-i18n-aria="hintAria" data-i18n-title="hintBuildName" aria-label="Подсказка" title="">!</button>
    </label>
    <input type="text" id="batchBuildName" class="twide inp" data-i18n-placeholder="phBatchName" placeholder="NAME_PLA" autocomplete="off" />
    <div class="batch-lower-row">
      <label class="batch-lower-label"><input type="checkbox" id="batchNamesLowercase" checked /> <span data-i18n="lblLowercase">Имена площадок в нижнем регистре</span></label>
      <button type="button" class="hint-tip" data-i18n-aria="hintAria" data-i18n-title="hintLowercase" aria-label="Подсказка" title="">!</button>
    </div>
  </div>
  <div class="row">
    <label><input type="checkbox" id="obf" checked /> <span data-i18n="lblObfuscate">Обфускация (как в панели super-html)</span></label>
  </div>
  <div class="row">
    <label class="lbl" data-i18n="lblChannels">Площадки</label>
    <label class="ch-toggle-all"><input type="checkbox" id="channelToggleAll" /> <span data-i18n="lblChannelsToggleAll">Выбрать / снять все площадки</span></label>
    <div class="ch-debug-row">
      <label class="ch-toggle-all"><input type="checkbox" id="debugAllPlatforms" /> <span data-i18n="lblDebugPlatforms">Режим дебага площадок (эмуляция SDK)</span></label>
      <button type="button" class="hint-tip" data-i18n-aria="hintAria" data-i18n-title="hintDebugPlatforms" aria-label="Подсказка" title="">!</button>
    </div>
    <div id="channels" class="ch-wrap"></div>
  </div>
  <div class="row">
    <label><input type="checkbox" id="useIter" checked /> <span data-i18n="lblUseIter">Несколько итераций (список ниже)</span></label>
  </div>
  <div class="row reset-row">
    <button type="button" class="btn" id="btnResetDefaults" data-i18n="btnResetDefaults">Сброс к умолчанию</button>
    <button type="button" class="hint-tip" data-i18n-aria="hintResetAria" data-i18n-title="hintReset" aria-label="Подсказка о сбросе" title="">!</button>
  </div>
  <div class="row" id="iterBlock">
    <label class="lbl lbl-with-hint">
      <span data-i18n="labelIterations">Итерации — каждая даёт подпапку в папке вывода</span>
      <button type="button" class="hint-tip" data-i18n-aria="hintIterAria" data-i18n-title="hintIterations" aria-label="Подсказка об итерациях" title="">!</button>
    </label>
    <div id="iterListHost" class="iter-list-host"></div>
    <button type="button" class="btn" id="btnAddIter" data-i18n="btnAddIter">+ Добавить итерацию</button>
  </div>
  <div class="row run-row">
    <button type="button" class="btn" id="btnValidateIters" data-i18n="btnValidate" data-i18n-title="valValidateHint" title="">Проверить</button>
    <button id="btnRun" type="button" class="btn primary" data-i18n="btnRun">Собрать все итерации</button>
    <div id="webBuildAgeChip" class="web-build-age-chip">Прошло --:--:-- с последнего билда Web Mobile</div>
  </div>
  <pre id="log" class="log"></pre>
  <div class="log-actions">
    <button type="button" class="btn" id="btnCopyLog" data-i18n="btnCopyLog">Копировать лог / ошибку</button>
    <span id="copyStatus" class="copy-status"></span>
  </div>
</div>
<div id="helpOverlay" class="help-overlay" aria-hidden="true">
  <div class="help-backdrop" id="helpBackdrop" role="presentation"></div>
  <div class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="helpDialogTitle">
    <div class="help-dialog-head">
      <h3 id="helpDialogTitle" class="help-dialog-title" data-i18n="helpTitle">Playable batch — пошаговая инструкция</h3>
      <button type="button" class="btn btn-sm" id="btnHelpClose" data-i18n="helpClose">Закрыть</button>
    </div>
    <div class="help-dialog-body">
      <p class="help-lead" data-i18n-html="helpLeadHtml">Один билд <strong>Web Mobile</strong> → несколько вариантов. Компонент <strong>PlayableBatchOverrideApplier</strong> на сцене применяет настройки итерации автоматически.</p>
      <div class="help-steps-list">
        <div class="help-section">
          <h4 class="help-section-title" data-i18n="helpMainSection">Главное</h4>
          <div class="help-step help-step--required">
            <div class="help-step-head">
              <span class="help-step-num">1)</span>
              <strong class="help-step-title" data-i18n="helpStep1Title">Скрипт в проекте (обязательно)</strong>
              <button type="button" class="hint-tip help-q" data-i18n-aria="moreAria" data-i18n-title="helpStep1Tip" aria-label="Подробнее" title="">?</button>
            </div>
            <div class="help-step-toolbar">
              <button type="button" class="btn btn-sm" id="btnOpenApplierFolder" data-i18n="btnOpenApplierFolder">Открыть папку со скриптом…</button>
            </div>
            <div id="stepActionStatus" class="help-step-status"></div>
          </div>
          <div class="help-step help-step--required">
            <div class="help-step-head">
              <span class="help-step-num">2)</span>
              <strong class="help-step-title" data-i18n="helpStep2Title">Сборка Web Mobile (обязательно)</strong>
              <button type="button" class="hint-tip help-q" data-i18n-aria="moreAria" data-i18n-title="helpStep2Tip" aria-label="Подробнее" title="">?</button>
            </div>
          </div>
          <div class="help-step help-step--platforms">
            <div class="help-step-head">
              <span class="help-step-num">3)</span>
              <strong class="help-step-title" data-i18n="helpStep3Title">Площадки</strong>
              <button type="button" class="hint-tip help-q" data-i18n-aria="moreAria" data-i18n-title="helpStep3Tip" aria-label="Подробнее" title="">?</button>
            </div>
          </div>
          <div class="help-step help-step--launch">
            <div class="help-step-head">
              <span class="help-step-num">4)</span>
              <strong class="help-step-title" data-i18n="helpStep4Title">Запуск</strong>
              <button type="button" class="hint-tip help-q" data-i18n-aria="moreAria" data-i18n-title="helpStep4Tip" aria-label="Подробнее" title="">?</button>
            </div>
          </div>
        </div>
        <div class="help-section">
          <h4 class="help-section-title" data-i18n="helpGeneralSection">Общее</h4>
          <div class="help-step help-step--general">
            <div class="help-step-head">
              <span class="help-step-bullet" aria-hidden="true">•</span>
              <strong class="help-step-title" data-i18n="helpG1Title">Папка сборки Web Mobile</strong>
              <button type="button" class="hint-tip help-q" data-i18n-aria="moreAria" data-i18n-title="helpG1Tip" aria-label="Подробнее" title="">?</button>
            </div>
          </div>
          <div class="help-step help-step--general">
            <div class="help-step-head">
              <span class="help-step-bullet" aria-hidden="true">•</span>
              <strong class="help-step-title" data-i18n="helpG2Title">Имя билда и регистр имён</strong>
              <button type="button" class="hint-tip help-q" data-i18n-aria="moreAria" data-i18n-title="helpG2Tip" aria-label="Подробнее" title="">?</button>
            </div>
          </div>
          <div class="help-step help-step--general">
            <div class="help-step-head">
              <span class="help-step-bullet" aria-hidden="true">•</span>
              <strong class="help-step-title" data-i18n="helpG3Title">Обфускация</strong>
              <button type="button" class="hint-tip help-q" data-i18n-aria="moreAria" data-i18n-title="helpG3Tip" aria-label="Подробнее" title="">?</button>
            </div>
          </div>
          <div class="help-step help-step--general">
            <div class="help-step-head">
              <span class="help-step-bullet" aria-hidden="true">•</span>
              <strong class="help-step-title" data-i18n="helpG4Title">Итерации и сохранение</strong>
              <button type="button" class="hint-tip help-q" data-i18n-aria="moreAria" data-i18n-title="helpG4Tip" aria-label="Подробнее" title="">?</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="hintBubble" class="hint-bubble" hidden></div>
</div>
`;
exports.style = `
:host {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}
.batch-panel-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
.top-required-banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 80, 80, 0.85);
  border-radius: 8px;
  background: rgba(140, 22, 22, 0.22);
}
.top-required-banner-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.top-required-banner-mark {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #d44242;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
.top-required-banner-title {
  color: #ff8f8f;
  font-size: 13px;
}
.top-required-banner-tip {
  margin: 0 0 8px;
  color: #ffdede;
  line-height: 1.45;
}
.top-required-banner.top-required-banner--ok {
  border-color: rgba(95, 220, 135, 0.85);
  background: rgba(24, 125, 56, 0.26);
}
.top-required-banner.top-required-banner--ok .top-required-banner-mark {
  background: #2fa95d;
}
.top-required-banner.top-required-banner--ok .top-required-banner-title {
  color: #a8efbf;
}
.top-required-banner.top-required-banner--ok .top-required-banner-tip {
  color: #d8ffe4;
}
.top-required-banner-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.top-required-banner-badge {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.3;
  border: 1px solid transparent;
}
.top-required-banner-badge--checking {
  color: #ffd88b;
  border-color: rgba(255, 200, 80, 0.45);
  background: rgba(255, 200, 80, 0.1);
}
.top-required-banner-badge--ok {
  color: #aff7be;
  border-color: rgba(92, 224, 128, 0.55);
  background: rgba(34, 170, 86, 0.18);
}
.top-required-banner-badge--missing {
  color: #ffc5c5;
  border-color: rgba(255, 90, 90, 0.55);
  background: rgba(180, 35, 35, 0.2);
}
.hint-bubble {
  position: fixed;
  z-index: 100002;
  max-width: min(340px, calc(100vw - 20px));
  padding: 10px 12px;
  background: #1a1c22;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: #e8eaf0;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  box-sizing: border-box;
}
.hint-bubble[hidden] {
  display: none !important;
}
.hint-bubble:not([hidden]) {
  display: block;
}
.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: scroll;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
  padding: 12px;
  font-size: 12px;
  font-family: system-ui, sans-serif;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}
.panel-head .title {
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
  flex: 1;
  min-width: 0;
}
.ext-version-label {
  font-size: 11px;
  opacity: 0.82;
}
.panel-head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
.update-top-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.update-status-chip {
  font-size: 11px;
  border-radius: 999px;
  padding: 3px 8px;
  border: 1px solid rgba(180, 190, 210, 0.35);
  background: rgba(90, 100, 120, 0.24);
}
.update-status-chip--idle {
  color: #cfd6e5;
}
.update-status-chip--checking {
  color: #ffd88b;
  border-color: rgba(255, 200, 80, 0.45);
  background: rgba(255, 200, 80, 0.12);
}
.update-status-chip--available {
  color: #ffe6a8;
  border-color: rgba(255, 196, 66, 0.58);
  background: rgba(176, 128, 22, 0.22);
}
.update-status-chip--updated,
.update-status-chip--latest {
  color: #aff7be;
  border-color: rgba(92, 224, 128, 0.55);
  background: rgba(34, 170, 86, 0.18);
}
.update-status-chip--restart {
  color: #ffd3d3;
  border-color: rgba(255, 80, 80, 0.72);
  background: rgba(180, 30, 30, 0.28);
}
.update-status-chip--failed {
  color: #ffc5c5;
  border-color: rgba(255, 90, 90, 0.55);
  background: rgba(180, 35, 35, 0.2);
}
.update-restart-notice {
  margin: 0 0 10px 0;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 80, 80, 0.75);
  background: rgba(180, 30, 30, 0.24);
  color: #ffd5d5;
  font-size: 12px;
  font-weight: 600;
}
.btn-lang {
  min-width: 40px;
  padding: 4px 10px;
  font-size: 16px;
  line-height: 1.2;
}
.help-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 100000;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}
.help-overlay.help-overlay--open {
  display: flex;
}
.help-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.58);
  cursor: pointer;
}
.help-dialog {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 560px;
  max-height: min(88vh, 720px);
  display: flex;
  flex-direction: column;
  background: #2e3138;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.help-dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.help-dialog-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}
.help-dialog-body {
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 16px 18px;
  font-size: 12px;
  line-height: 1.55;
  -webkit-overflow-scrolling: touch;
}
.help-lead {
  margin: 0 0 14px 0;
  opacity: 0.94;
}
.help-steps-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.help-section {
  margin-bottom: 6px;
}
.help-section + .help-section {
  margin-top: 14px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.help-section-title {
  margin: 0 0 8px 0;
  padding-bottom: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.72;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.help-section:first-child .help-section-title {
  margin-top: 0;
}
.help-step {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.help-section .help-step:last-child {
  border-bottom: none;
}
.help-section:last-child .help-step:last-child {
  padding-bottom: 2px;
}
.help-step-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  line-height: 1.35;
}
.help-step-num {
  font-weight: 700;
  font-size: 13px;
  opacity: 0.92;
  flex-shrink: 0;
}
.help-step-title {
  font-size: 13px;
  font-weight: 600;
}
.help-step--required .help-step-title {
  color: #ff7a7a;
}
.help-step--platforms .help-step-title {
  color: #e8c940;
  font-weight: 600;
}
.help-step--launch .help-step-title {
  color: #5ca8ff;
  font-weight: 600;
}
.help-step--general .help-step-title {
  color: #b8bcc8;
  font-weight: 500;
}
.help-step-bullet {
  font-weight: 700;
  font-size: 13px;
  opacity: 0.88;
  flex-shrink: 0;
  width: 1em;
  text-align: center;
  color: #b8bcc8;
}
.help-q {
  width: 18px;
  height: 18px;
  min-width: 18px;
  font-size: 11px;
  font-weight: 700;
}
.help-step-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
  margin-left: 0;
  padding-left: 0;
}
.help-step-status {
  margin-top: 8px;
  font-size: 11px;
  opacity: 0.88;
  min-height: 14px;
}
.help-dialog-body code {
  font-size: 11px;
}
.row { margin-bottom: 12px; }
.lbl { display: block; margin-bottom: 4px; opacity: 0.9; }
.lbl-with-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-bottom: 4px;
  opacity: 0.9;
}
.hint-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  min-width: 16px;
  padding: 0;
  margin: 0;
  vertical-align: middle;
  border-radius: 50%;
  border: 1px solid rgba(200, 200, 220, 0.55);
  background: rgba(70, 85, 130, 0.45);
  color: #e8ebf8;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  cursor: help;
  box-sizing: border-box;
  flex-shrink: 0;
}
.hint-tip:hover,
.hint-tip:focus-visible {
  background: rgba(90, 115, 190, 0.65);
  color: #ffffff;
  border-color: rgba(220, 225, 255, 0.65);
  outline: none;
}
.reset-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.twide { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 11px; }
.ch-toggle-all {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  opacity: 0.95;
  cursor: pointer;
}
.ch-debug-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ch-wrap {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: none;
  overflow: visible;
  padding: 6px 8px;
  border: 1px solid rgba(127,127,127,0.35);
  border-radius: 4px;
  min-height: 48px;
}
.ch-item {
  border-bottom: 1px solid rgba(127,127,127,0.22);
  padding: 8px 4px;
}
.ch-item:last-child { border-bottom: none; }
.ch-line { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.ch-line label { cursor: pointer; display: flex; align-items: center; gap: 6px; }
.ch-line .ch-name { flex: 1; }
.ch-status {
  margin-left: auto;
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
  padding: 3px 6px;
  border-radius: 999px;
  border: 1px solid rgba(150, 150, 150, 0.4);
  color: rgba(230, 230, 230, 0.9);
  background: rgba(120, 120, 120, 0.22);
}
.ch-item--ok .ch-status {
  border-color: rgba(72, 180, 97, 0.9);
  color: #d9ffe2;
  background: rgba(72, 180, 97, 0.2);
}
.ch-item--bad .ch-status {
  border-color: rgba(220, 90, 90, 0.9);
  color: #ffdede;
  background: rgba(220, 90, 90, 0.2);
}
.ch-sub {
  margin-top: 8px;
  margin-left: 4px;
  padding: 8px 10px;
  background: rgba(0,0,0,0.12);
  border-radius: 4px;
  font-size: 11px;
  font-weight: normal;
}
.ch-sub label { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; cursor: pointer; }
.ch-sub label:last-of-type { margin-bottom: 4px; }
.ch-sub .inp { width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 11px; }
.ch-applovin-axon-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }
.file-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.inp { flex: 1; min-width: 160px; padding: 4px 6px; }
.btn {
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid rgba(210, 210, 220, 0.35);
  background: rgba(88, 88, 96, 0.55);
  color: #e4e4ea;
  font-size: 12px;
}
.btn:hover {
  color: #ffffff;
  background: rgba(108, 108, 118, 0.72);
  border-color: rgba(230, 230, 240, 0.45);
}
.btn.primary {
  font-weight: 600;
  color: #ffffff;
  background: rgba(55, 110, 200, 0.72);
  border-color: rgba(160, 200, 255, 0.45);
}
.btn.primary:hover {
  background: rgba(70, 125, 220, 0.85);
}
/* Как .btn.primary, но янтарная — хорошо заметна на тёмной панели */
.btn.btn-help {
  font-weight: 600;
  color: #ffffff;
  background: rgba(200, 145, 18, 0.88);
  border-color: rgba(255, 210, 100, 0.5);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset;
}
.btn.btn-help:hover {
  color: #ffffff;
  background: rgba(225, 170, 35, 0.95);
  border-color: rgba(255, 230, 150, 0.65);
}
.btn.btn-update-ext {
  font-weight: 600;
  color: #ffffff;
  background: rgba(48, 125, 214, 0.86);
  border-color: rgba(146, 202, 255, 0.56);
}
.btn.btn-update-ext:hover {
  color: #ffffff;
  background: rgba(66, 143, 232, 0.92);
  border-color: rgba(180, 220, 255, 0.68);
}
.btn.btn-update-ext[disabled] {
  opacity: 0.6;
  cursor: default;
}
.btn.btn-update-link {
  font-weight: 600;
  color: #fff6d5;
  background: rgba(170, 118, 22, 0.9);
  border-color: rgba(255, 215, 128, 0.52);
}
.btn.btn-update-link:hover {
  color: #ffffff;
  background: rgba(196, 138, 34, 0.96);
  border-color: rgba(255, 228, 158, 0.68);
}
.log { white-space: pre-wrap; max-height: 240px; overflow: auto; background: rgba(0,0,0,0.18); padding: 8px; border-radius: 4px; margin: 0; font-size: 11px; }
.batch-lower-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 8px;
  font-size: 11px;
}
.batch-lower-label { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.batch-lower-row .hint-tip { cursor: help; }
.iter-lbl-with-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 3px;
  font-size: 11px;
  opacity: 0.88;
}
.web-row { margin-top: 6px; }
.log-actions { margin-top: 8px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.copy-status { font-size: 11px; opacity: 0.85; min-height: 14px; }
.iter-list-host {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
  max-height: 380px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 2px;
}
.iter-card {
  border: 1px solid rgba(127,127,127,0.42);
  border-radius: 6px;
  padding: 10px;
  background: rgba(0,0,0,0.14);
}
.iter-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 12px;
}
.iter-card-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
}
.iter-field { margin-bottom: 8px; }
.iter-field label {
  display: block;
  font-size: 11px;
  opacity: 0.88;
  margin-bottom: 3px;
}
.iter-field .inp { width: 100%; box-sizing: border-box; }
.run-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  align-items: center;
}
.web-build-age-chip {
  margin-left: auto;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: #e8f3ea;
  font-size: 10px;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inp.iter-field--ok,
.inp-key.iter-field--ok,
.inp-val.iter-field--ok {
  border: 1px solid rgba(72, 180, 97, 0.95) !important;
  box-shadow: 0 0 0 1px rgba(72, 180, 97, 0.45);
  background-color: rgba(72, 180, 97, 0.14) !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
}
.inp.iter-field--ok::placeholder,
.inp-key.iter-field--ok::placeholder,
.inp-val.iter-field--ok::placeholder {
  color: rgba(255, 255, 255, 0.5) !important;
  -webkit-text-fill-color: rgba(255, 255, 255, 0.5) !important;
}
.inp.iter-field--bad,
.inp-key.iter-field--bad,
.inp-val.iter-field--bad {
  border: 1px solid rgba(220, 90, 90, 0.95) !important;
  box-shadow: 0 0 0 1px rgba(220, 90, 90, 0.45);
  background-color: rgba(220, 90, 90, 0.12) !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
}
.inp.iter-field--bad::placeholder,
.inp-key.iter-field--bad::placeholder,
.inp-val.iter-field--bad::placeholder {
  color: rgba(255, 255, 255, 0.5) !important;
  -webkit-text-fill-color: rgba(255, 255, 255, 0.5) !important;
}
.prop-rows { margin: 4px 0 6px 0; }
.prop-row { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
.prop-row .inp-key { flex: 0 0 36%; min-width: 72px; }
.prop-row .inp-val { flex: 1; min-width: 56px; }
.btn-sm { padding: 4px 8px; font-size: 11px; }
`;
exports.ready = async function () {
    const ctx = this;
    const $ = (ctx && ctx.$) || {};
    const root = resolvePanelRoot(ctx);
    const PERSIST_FILE = ["settings", "super-html-batch-ui.json"].join("/");
    let persistedBatchSt = null;
    let panelLang = "ru";
    try {
        const _projEarly = getProjectPath();
        if (_projEarly) {
            const _absEarly = path.join(_projEarly, PERSIST_FILE);
            if (fs.existsSync(_absEarly)) {
                persistedBatchSt = JSON.parse(fs.readFileSync(_absEarly, "utf8"));
                if (persistedBatchSt.panelLang === "en" || persistedBatchSt.panelLang === "ru") {
                    panelLang = persistedBatchSt.panelLang;
                }
            }
        }
    }
    catch (_earlyPersist) { }
    const byId = {
        "#webRoot": $.webRoot,
        "#batchBuildName": $.batchBuildName,
        "#batchNamesLowercase": $.batchNamesLowercase,
        "#channels": $.channels,
        "#useIter": $.useIter,
        "#iterBlock": $.iterBlock,
        "#iterListHost": $.iterListHost,
        "#btnAddIter": $.btnAddIter,
        "#btnRun": $.btnRun,
        "#webBuildAgeChip": $.webBuildAgeChip,
        "#btnValidateIters": $.btnValidateIters,
        "#btnResetDefaults": $.btnResetDefaults,
        "#obf": $.obf,
        "#log": $.log,
        "#btnBrowseWeb": $.btnBrowseWeb,
        "#btnCopyLog": $.btnCopyLog,
        "#copyStatus": $.copyStatus,
        "#btnOpenApplierFolder": $.btnOpenApplierFolder,
        "#btnOpenApplierFolderTop": $.btnOpenApplierFolderTop,
        "#stepActionStatus": $.stepActionStatus,
        "#topActionStatus": $.topActionStatus,
        "#applierInstallBadge": $.applierInstallBadge,
        "#topRequiredBanner": $.topRequiredBanner,
        "#channelToggleAll": $.channelToggleAll,
        "#debugAllPlatforms": $.debugAllPlatforms,
        "#btnUpdateExtension": $.btnUpdateExtension,
        "#btnOpenUpdatePage": $.btnOpenUpdatePage,
        "#extVersionLabel": $.extVersionLabel,
        "#updateStatusChip": $.updateStatusChip,
        "#updateRestartNotice": $.updateRestartNotice,
        "#btnLang": $.btnLang,
        "#btnHelp": $.btnHelp,
        "#helpOverlay": $.helpOverlay,
        "#helpBackdrop": $.helpBackdrop,
        "#btnHelpClose": $.btnHelpClose,
        "#hintBubble": $.hintBubble,
    };
    const q = (sel) => {
        const from$ = byId[sel];
        if (from$ && from$.nodeType === 1) {
            return from$;
        }
        return root && root.querySelector ? root.querySelector(sel) : null;
    };
    const webRoot = q("#webRoot");
    const batchBuildName = q("#batchBuildName");
    const batchNamesLowercase = q("#batchNamesLowercase");
    const channelsEl = q("#channels");
    const useIter = q("#useIter");
    const iterBlock = q("#iterBlock");
    const iterListHost = q("#iterListHost");
    const btnAddIter = q("#btnAddIter");
    const btnRun = q("#btnRun");
    const webBuildAgeChip = q("#webBuildAgeChip");
    const btnValidateIters = q("#btnValidateIters");
    const btnResetDefaults = q("#btnResetDefaults");
    const obf = q("#obf");
    const logEl = q("#log");
    const btnBrowseWeb = q("#btnBrowseWeb");
    const btnCopyLog = q("#btnCopyLog");
    const copyStatus = q("#copyStatus");
    const btnOpenApplierFolder = q("#btnOpenApplierFolder");
    const btnOpenApplierFolderTop = q("#btnOpenApplierFolderTop");
    const stepActionStatus = q("#stepActionStatus");
    const topActionStatus = q("#topActionStatus");
    const applierInstallBadge = q("#applierInstallBadge");
    const topRequiredBanner = q("#topRequiredBanner");
    const channelToggleAll = q("#channelToggleAll");
    const debugAllPlatforms = q("#debugAllPlatforms");
    const btnUpdateExtension = q("#btnUpdateExtension");
    const btnOpenUpdatePage = q("#btnOpenUpdatePage");
    const extVersionLabel = q("#extVersionLabel");
    const updateStatusChip = q("#updateStatusChip");
    const updateRestartNotice = q("#updateRestartNotice");
    const btnLang = q("#btnLang");
    const btnHelp = q("#btnHelp");
    const helpOverlay = q("#helpOverlay");
    const helpBackdrop = q("#helpBackdrop");
    const btnHelpClose = q("#btnHelpClose");
    let lastIterationClip = null;
    function setHelpOpen(open) {
        if (!helpOverlay) {
            return;
        }
        const hb = q("#hintBubble");
        if (hb) {
            hb.setAttribute("hidden", "");
        }
        helpOverlay.classList.toggle("help-overlay--open", !!open);
        helpOverlay.setAttribute("aria-hidden", open ? "false" : "true");
        if (open) {
            if (btnHelpClose) {
                btnHelpClose.focus();
            }
        }
        else if (btnHelp) {
            btnHelp.focus();
        }
    }
    const log = (msg) => {
        if (logEl) {
            logEl.textContent = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
        }
    };
    function appendLogLine(line) {
        if (!logEl || line == null || line === "") {
            return;
        }
        const prev = logEl.textContent || "";
        logEl.textContent = prev ? prev + "\n" + line : String(line);
    }
    function resolveWebRootAbs() {
        const wr = cleanWebRootValue(webRoot);
        if (!wr) {
            return "";
        }
        const proj = getProjectPath();
        if (proj && !path.isAbsolute(wr)) {
            return path.join(proj, wr);
        }
        return wr;
    }
    function formatAgeText(ms) {
        const safe = Math.max(0, ms | 0);
        const totalSec = Math.floor(safe / 1000);
        const hh = Math.floor(totalSec / 3600);
        const mm = Math.floor((totalSec % 3600) / 60);
        const ss = totalSec % 60;
        return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
    }
    function interpColor(a, b, ratio) {
        const r = Math.max(0, Math.min(1, ratio));
        const mix = (x, y) => Math.round(x + (y - x) * r);
        return "rgb(" + mix(a[0], b[0]) + "," + mix(a[1], b[1]) + "," + mix(a[2], b[2]) + ")";
    }
    function refreshWebBuildAgeChip() {
        if (!webBuildAgeChip) {
            return;
        }
        const abs = resolveWebRootAbs();
        if (!abs) {
            webBuildAgeChip.textContent = t("webBuildAgeNoPath");
            webBuildAgeChip.style.color = "#c8c8c8";
            return;
        }
        const indexPath = path.join(abs, "index.html");
        if (!fs.existsSync(indexPath)) {
            webBuildAgeChip.textContent = t("webBuildAgeNoIndex");
            webBuildAgeChip.style.color = "#ffe3c2";
            return;
        }
        let mtimeMs = 0;
        try {
            mtimeMs = fs.statSync(indexPath).mtimeMs || 0;
        }
        catch (_e) {
            mtimeMs = 0;
        }
        const ageMs = Math.max(0, Date.now() - mtimeMs);
        const minStep = Math.min(10, Math.floor(ageMs / 60000));
        const ratio = minStep / 10;
        const rr = Math.round(47 + (216 - 47) * ratio);
        const gg = Math.round(180 + (91 - 180) * ratio);
        const bb = Math.round(93 + (91 - 93) * ratio);
        const color = interpColor([47, 180, 93], [216, 91, 91], ratio);
        webBuildAgeChip.textContent = t("webBuildAgePrefix") + " " + formatAgeText(ageMs) + " " + t("webBuildAgeSuffix");
        webBuildAgeChip.style.color = color;
    }
    function flashStatus(el, msg) {
        if (!el) {
            return;
        }
        el.textContent = msg;
        setTimeout(() => {
            if (el) {
                el.textContent = "";
            }
        }, 4200);
    }
    function flashStepStatus(msg) {
        flashStatus(stepActionStatus, msg);
        flashStatus(topActionStatus, msg);
    }
    async function copyTextToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        }
        catch (_e) { }
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            (root || document.body).appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            return !!ok;
        }
        catch (_e2) {
            return false;
        }
    }
    function t(k) {
        const pack = BATCH_PANEL_I18N[panelLang];
        const v = pack && pack[k];
        if (v != null && v !== "") {
            return v;
        }
        const fb = BATCH_PANEL_I18N.ru[k];
        return fb != null ? fb : k;
    }
    let currentExtensionVersion = "";
    let updateUiState = "idle";
    let restartRequiredStickyUi = false;
    let manualUpdateUrl = "";
    function renderExtVersionLabel() {
        if (!extVersionLabel) {
            return;
        }
        const v = currentExtensionVersion ? currentExtensionVersion : "-";
        extVersionLabel.textContent = `${t("versionLabel")} ${v}`;
    }
    function setUpdateUiState(state) {
        updateUiState = state || "idle";
        if (!updateStatusChip) {
            return;
        }
        updateStatusChip.classList.remove("update-status-chip--idle", "update-status-chip--checking", "update-status-chip--available", "update-status-chip--updated", "update-status-chip--restart", "update-status-chip--latest", "update-status-chip--failed");
        if (updateUiState === "checking") {
            updateStatusChip.classList.add("update-status-chip--checking");
            updateStatusChip.textContent = t("updateStateChecking");
            return;
        }
        if (updateUiState === "updated") {
            updateStatusChip.classList.add("update-status-chip--updated");
            updateStatusChip.textContent = t("updateStateUpdated");
            return;
        }
        if (updateUiState === "restart") {
            updateStatusChip.classList.add("update-status-chip--restart");
            updateStatusChip.textContent = t("updateStateRestart");
            return;
        }
        if (updateUiState === "available") {
            updateStatusChip.classList.add("update-status-chip--available");
            updateStatusChip.textContent = t("updateStateAvailable");
            return;
        }
        if (updateUiState === "latest") {
            updateStatusChip.classList.add("update-status-chip--latest");
            updateStatusChip.textContent = t("updateStateLatest");
            return;
        }
        if (updateUiState === "failed") {
            updateStatusChip.classList.add("update-status-chip--failed");
            updateStatusChip.textContent = t("updateStateFailed");
            return;
        }
        updateStatusChip.classList.add("update-status-chip--idle");
        updateStatusChip.textContent = t("updateStateIdle");
    }
    function setRestartRequiredNotice(forceOn) {
        if (forceOn) {
            restartRequiredStickyUi = true;
        }
        if (!updateRestartNotice) {
            return;
        }
        if (restartRequiredStickyUi) {
            updateRestartNotice.textContent = t("updateRestartSticky");
            updateRestartNotice.removeAttribute("hidden");
            return;
        }
        updateRestartNotice.setAttribute("hidden", "");
    }
    function openExternalLink(url) {
        const u = String(url || "").trim();
        if (!u) {
            return false;
        }
        try {
            if (typeof window !== "undefined" && typeof window.open === "function") {
                window.open(u, "_blank");
                return true;
            }
        }
        catch (_e) { }
        return false;
    }
    function setManualUpdateLink(url) {
        manualUpdateUrl = String(url || "").trim();
        if (!btnOpenUpdatePage) {
            return;
        }
        if (manualUpdateUrl) {
            btnOpenUpdatePage.removeAttribute("hidden");
            return;
        }
        btnOpenUpdatePage.setAttribute("hidden", "");
    }
    async function refreshBatchUiSnapshot(opts) {
        const o = opts || {};
        try {
            const ui = await ipcToMain("query-batch-ui", {});
            if (ui && ui.extensionVersion) {
                currentExtensionVersion = String(ui.extensionVersion);
                renderExtVersionLabel();
            }
            if (ui && ui.restartRequiredSticky) {
                setRestartRequiredNotice(true);
            }
            if (o.logDeps && ui && ui.missingDeps) {
                appendLogLine(t("depsMissingWarn"));
                if (ui.missingDepsError) {
                    appendLogLine(String(ui.missingDepsError));
                }
            }
            if (o.applyWebRootHint && webRoot && ui && ui.webRootHint && !webRoot.value) {
                webRoot.value = ui.webRootHint;
            }
            if (o.applyObfDefault && obf && ui && ui.enableObfuscator !== undefined) {
                obf.checked = ui.enableObfuscator !== false;
            }
            return ui;
        }
        catch (e) {
            if (o.logError !== false) {
                log(t("ipcBatchUi") + String(e));
            }
            return null;
        }
    }
    let applierInstallState = "checking";
    let applierInstallPath = "";
    function compressUuidForSceneType(uuidWithDashes) {
        const src = String(uuidWithDashes || "").replace(/-/g, "").toLowerCase();
        if (!/^[0-9a-f]{32}$/.test(src)) {
            return "";
        }
        const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        const head = src.slice(0, 5);
        const body = src.slice(5);
        let out = "";
        for (let i = 0; i < body.length; i += 3) {
            const a = parseInt(body[i], 16);
            const b = parseInt(body[i + 1], 16);
            const c = parseInt(body[i + 2], 16);
            out += b64[(a << 2) | (b >> 2)];
            out += b64[((b & 3) << 4) | c];
        }
        return head + out;
    }
    function hasApplierOnAnyScene(applierAbsPath) {
        const proj = getProjectPath();
        if (!proj || !applierAbsPath) {
            return false;
        }
        let uuid = "";
        try {
            const metaPath = applierAbsPath + ".meta";
            if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
                uuid = String((meta && meta.uuid) || "").trim();
            }
        }
        catch (_e) {
            uuid = "";
        }
        const typeToken = compressUuidForSceneType(uuid);
        const assetsDir = path.join(proj, "assets");
        const stack = [assetsDir];
        while (stack.length) {
            const dir = stack.pop();
            if (!dir || !fs.existsSync(dir)) {
                continue;
            }
            let entries = [];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch (_e) {
                continue;
            }
            for (const ent of entries) {
                const p = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    stack.push(p);
                    continue;
                }
                if (!ent.isFile() || !ent.name.toLowerCase().endsWith(".scene")) {
                    continue;
                }
                let txt = "";
                try {
                    txt = fs.readFileSync(p, "utf8");
                }
                catch (_e) {
                    continue;
                }
                if (!txt) {
                    continue;
                }
                if (typeToken && txt.includes(typeToken)) {
                    return true;
                }
                if (txt.includes('"__type__": "PlayableBatchOverrideApplier"')) {
                    return true;
                }
            }
        }
        return false;
    }
    function renderApplierInstallBadge() {
        if (!applierInstallBadge) {
            return;
        }
        if (topRequiredBanner) {
            topRequiredBanner.classList.remove("top-required-banner--ok");
        }
        applierInstallBadge.classList.remove("top-required-banner-badge--checking", "top-required-banner-badge--ok", "top-required-banner-badge--missing");
        if (applierInstallState === "ok") {
            if (topRequiredBanner) {
                topRequiredBanner.classList.add("top-required-banner--ok");
            }
            applierInstallBadge.classList.add("top-required-banner-badge--ok");
            const suffix = applierInstallPath ? `: ${applierInstallPath}` : "";
            applierInstallBadge.textContent = t("applierStatusInstalled") + suffix;
            return;
        }
        if (applierInstallState === "scriptOnly") {
            applierInstallBadge.classList.add("top-required-banner-badge--missing");
            applierInstallBadge.textContent = t("applierStatusScriptOnly");
            return;
        }
        if (applierInstallState === "missing") {
            applierInstallBadge.classList.add("top-required-banner-badge--missing");
            applierInstallBadge.textContent = t("applierStatusMissing");
            return;
        }
        applierInstallBadge.classList.add("top-required-banner-badge--checking");
        applierInstallBadge.textContent = t("applierStatusChecking");
    }
    function normalizeSlash(p) {
        return String(p || "").replace(/\\/g, "/");
    }
    function findPlayableBatchApplierAssetRelPath() {
        const proj = getProjectPath();
        if (!proj) {
            return "";
        }
        const assetsDir = path.join(proj, "assets");
        if (!fs.existsSync(assetsDir)) {
            return "";
        }
        const target = "PlayableBatchOverrideApplier.ts";
        const stack = [assetsDir];
        while (stack.length) {
            const dir = stack.pop();
            if (!dir) {
                continue;
            }
            let entries = [];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch (_e) {
                continue;
            }
            for (const ent of entries) {
                if (ent.isFile() && ent.name === target) {
                    const abs = path.join(dir, ent.name);
                    const rel = path.relative(proj, abs);
                    return normalizeSlash(rel);
                }
                if (ent.isDirectory()) {
                    stack.push(path.join(dir, ent.name));
                }
            }
        }
        return "";
    }
    let applierCheckBusy = false;
    function refreshApplierInstallBadge() {
        if (applierCheckBusy) {
            return;
        }
        applierCheckBusy = true;
        try {
            const rel = findPlayableBatchApplierAssetRelPath();
            applierInstallPath = rel;
            if (!rel) {
                applierInstallState = "missing";
            }
            else {
                const proj = getProjectPath();
                const abs = proj ? path.join(proj, rel) : "";
                applierInstallState = hasApplierOnAnyScene(abs) ? "ok" : "scriptOnly";
            }
            renderApplierInstallBadge();
        }
        finally {
            applierCheckBusy = false;
        }
    }
    function applyDataI18nToScope(scope) {
        if (!scope || !scope.querySelectorAll) {
            return;
        }
        scope.querySelectorAll("[data-i18n]").forEach((el) => {
            const k = el.getAttribute("data-i18n");
            if (k) {
                el.textContent = t(k);
            }
        });
        scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
            const k = el.getAttribute("data-i18n-html");
            if (k) {
                el.innerHTML = t(k);
            }
        });
        scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
            const k = el.getAttribute("data-i18n-title");
            if (k) {
                el.title = t(k);
            }
        });
        scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
            const k = el.getAttribute("data-i18n-aria");
            if (k) {
                el.setAttribute("aria-label", t(k));
            }
        });
        scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            const k = el.getAttribute("data-i18n-placeholder");
            if (k && "placeholder" in el) {
                el.placeholder = t(k);
            }
        });
    }
    function syncLangButton() {
        if (!btnLang) {
            return;
        }
        btnLang.textContent = panelLang === "ru" ? "🇷🇺" : "🇺🇸";
        btnLang.title = t("langBtnTitle");
        btnLang.setAttribute("aria-label", (panelLang === "ru" ? "RU" : "EN") + " — " + t("langBtnTitle"));
    }
    function refreshChannelExtraI18n() {
        if (!channelsEl) {
            return;
        }
        const axLbl = channelsEl.querySelector(".ch-applovin-axon-lbl");
        if (axLbl) {
            axLbl.textContent = t("chApplovinAxonInline");
        }
        const axTip = channelsEl.querySelector(".ch-applovin-axon-tip");
        if (axTip) {
            axTip.title = t("chApplovinAxonTip");
            axTip.setAttribute("aria-label", t("chApplovinAxonAria"));
        }
        const ironTip = channelsEl.querySelector(".ch-iron-mraid-tip");
        if (ironTip) {
            ironTip.title = t("chIronTip");
            ironTip.setAttribute("aria-label", t("chIronAria"));
        }
        channelsEl.querySelectorAll(".ch-item").forEach((item) => {
            const st = item.querySelector(".ch-status");
            if (!st) {
                return;
            }
            if (item.classList.contains("ch-item--ok")) {
                st.textContent = t("chStatusOk");
            }
            else if (item.classList.contains("ch-item--bad")) {
                st.textContent = t("chStatusBad");
            }
            else {
                st.textContent = t("chStatusIdle");
            }
        });
    }
    if (!channelsEl) {
        log(t("channelsMissing") + (root ? root.nodeName : "null") + t("channelsMissing2"));
        return;
    }
    const names = getChannelNamesFromConfigBestEffort();
    const boxState = {};
    function appendChannelItem(name) {
        const item = document.createElement("div");
        item.className = "ch-item";
        item.dataset.ch = name;
        const line = document.createElement("div");
        line.className = "ch-line";
        const lab = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "ch-enable";
        cb.checked = true;
        const span = document.createElement("span");
        span.className = "ch-name";
        span.textContent = name;
        lab.appendChild(cb);
        lab.appendChild(span);
        line.appendChild(lab);
        const status = document.createElement("span");
        status.className = "ch-status";
        status.textContent = t("chStatusIdle");
        line.appendChild(status);
        item.appendChild(line);
        if (name === "applovin") {
            const sub = document.createElement("div");
            sub.className = "ch-sub ch-applovin-extras";
            sub.style.display = "none";
            const axRow = document.createElement("div");
            axRow.className = "ch-applovin-axon-row";
            const l1 = document.createElement("label");
            const axonLoad = document.createElement("input");
            axonLoad.type = "checkbox";
            axonLoad.className = "ch-applovin-loading";
            l1.appendChild(axonLoad);
            const axSpan = document.createElement("span");
            axSpan.className = "ch-applovin-axon-lbl";
            axSpan.textContent = t("chApplovinAxonInline");
            l1.appendChild(axSpan);
            axRow.appendChild(l1);
            const axTip = document.createElement("button");
            axTip.type = "button";
            axTip.className = "hint-tip ch-applovin-axon-tip";
            axTip.setAttribute("aria-label", t("chApplovinAxonAria"));
            axTip.title = t("chApplovinAxonTip");
            axTip.textContent = "!";
            axRow.appendChild(axTip);
            sub.appendChild(axRow);
            item.appendChild(sub);
            function syncApplovinSub() {
                sub.style.display = cb.checked ? "block" : "none";
            }
            cb.addEventListener("change", () => {
                syncApplovinSub();
                syncChannelToggleAllState();
                clearChannelValidationState();
                scheduleSave();
            });
            axonLoad.addEventListener("change", scheduleSave);
            syncApplovinSub();
        }
        else if (name === "ironsourcemraid") {
            const isTip = document.createElement("button");
            isTip.type = "button";
            isTip.className = "hint-tip ch-iron-mraid-tip";
            isTip.setAttribute("aria-label", t("chIronAria"));
            isTip.title = t("chIronTip");
            isTip.textContent = "!";
            line.appendChild(isTip);
        }
        else {
            cb.addEventListener("change", () => {
                syncChannelToggleAllState();
                clearChannelValidationState();
                scheduleSave();
            });
        }
        channelsEl.appendChild(item);
        boxState[name] = cb;
    }
    names.forEach((name) => appendChannelItem(name));
    syncChannelToggleAllState();
    if (useIter) {
        useIter.checked = true;
    }
    function setAllChannels(on) {
        names.forEach((n) => {
            const cb = boxState[n];
            if (cb) {
                cb.checked = on;
            }
        });
        syncChannelToggleAllState();
        clearChannelValidationState();
    }
    function syncChannelToggleAllState() {
        if (!channelToggleAll) {
            return;
        }
        const total = names.length;
        let enabled = 0;
        names.forEach((n) => {
            const cb = boxState[n];
            if (cb && cb.checked) {
                enabled++;
            }
        });
        channelToggleAll.indeterminate = enabled > 0 && enabled < total;
        channelToggleAll.checked = total > 0 && enabled === total;
    }
    function selectedChannels() {
        return names.filter((n) => {
            const cb = boxState[n];
            return cb && cb.checked;
        });
    }
    function collectChannelOptions() {
        const out = {};
        if (!channelsEl) {
            return out;
        }
        out.debugAllPlatforms = !!(debugAllPlatforms && debugAllPlatforms.checked);
        const row = channelsEl.querySelector('.ch-item[data-ch="applovin"]');
        if (row) {
            const axonLoad = row.querySelector(".ch-applovin-loading");
            out.applovin = {
                axonLoading: !!(axonLoad && axonLoad.checked),
            };
        }
        return out;
    }
    function applyChannelOptionsFromState(opts) {
        if (debugAllPlatforms && opts && typeof opts.debugAllPlatforms === "boolean") {
            debugAllPlatforms.checked = !!opts.debugAllPlatforms;
        }
        if (!opts || !opts.applovin || !channelsEl) {
            return;
        }
        const row = channelsEl.querySelector('.ch-item[data-ch="applovin"]');
        if (!row) {
            return;
        }
        const a = opts.applovin;
        const axonLoad = row.querySelector(".ch-applovin-loading");
        if (axonLoad) {
            if (typeof a.axonLoading === "boolean" && typeof a.axonEnabled === "undefined") {
                axonLoad.checked = a.axonLoading;
            }
            else {
                axonLoad.checked = !!(a.axonEnabled && a.axonLoading !== false);
            }
        }
        const main = row.querySelector(".ch-enable");
        const sub = row.querySelector(".ch-applovin-extras");
        if (sub && main) {
            sub.style.display = main.checked ? "block" : "none";
        }
    }
    function applyDefaultChannelOptions() {
        applyChannelOptionsFromState({
            debugAllPlatforms: false,
            applovin: { axonLoading: false },
        });
    }
    function clearChannelValidationState() {
        if (!channelsEl) {
            return;
        }
        channelsEl.querySelectorAll(".ch-item").forEach((item) => {
            item.classList.remove("ch-item--ok", "ch-item--bad");
            const st = item.querySelector(".ch-status");
            if (st) {
                st.textContent = t("chStatusIdle");
                st.title = "";
            }
        });
    }
    function setChannelValidationState(channelName, ok, issues) {
        if (!channelsEl) {
            return;
        }
        const row = channelsEl.querySelector('.ch-item[data-ch="' + channelName + '"]');
        if (!row) {
            return;
        }
        row.classList.remove("ch-item--ok", "ch-item--bad");
        row.classList.add(ok ? "ch-item--ok" : "ch-item--bad");
        const st = row.querySelector(".ch-status");
        if (st) {
            st.textContent = ok ? t("chStatusOk") : t("chStatusBad");
            st.title = Array.isArray(issues) && issues.length > 0 ? issues.join("\n") : "";
        }
    }
    function findSoundManagerScript(projectPath) {
        if (!projectPath) {
            return "";
        }
        const assetsDir = path.join(projectPath, "assets");
        const files = walkProjectFiles(assetsDir, [".ts", ".js"]);
        for (const file of files) {
            let src = "";
            try {
                src = fs.readFileSync(file, "utf8");
            }
            catch (_e) {
                continue;
            }
            const lowPath = file.replace(/\\/g, "/").toLowerCase();
            if (lowPath.endsWith("/soundmanager.ts") || lowPath.endsWith("/soundmanager.js")) {
                return file;
            }
            if (/@ccclass\s*\(\s*['"]SoundManager['"]\s*\)/.test(src)) {
                return file;
            }
            if (/\bclass\s+SoundManager\b/.test(src)) {
                return file;
            }
        }
        return "";
    }
    function validateSingleChannel(channelName, commonIssues, projectPath) {
        const issues = commonIssues.slice();
        if (!hasChannelTemplateAsset(channelName, "script.js")) {
            issues.push(t("valChannelScriptMissing"));
        }
        if (channelName === "tiktok" || channelName === "pangle" || channelName === "pangle_portrait" || channelName === "pangle_landscape") {
            if (!hasChannelTemplateAsset(channelName, "meta.html")) {
                issues.push(t("valChannelMetaMissing"));
            }
            if (!hasChannelTemplateAsset(channelName, "config.json")) {
                issues.push(t("valChannelConfigMissing"));
            }
        }
        if (channelName === "ironsourcemraid") {
            const smFile = findSoundManagerScript(projectPath);
            if (!smFile) {
                issues.push(t("valIronNeedScript"));
            }
            else {
                let src = "";
                try {
                    src = fs.readFileSync(smFile, "utf8");
                }
                catch (_e) {
                    src = "";
                }
                if (!/\bmute\s*\(/i.test(src)) {
                    issues.push(t("valIronNeedMute"));
                }
            }
        }
        return { ok: issues.length === 0, issues };
    }
    function runChannelValidation() {
        const selected = selectedChannels();
        clearChannelValidationState();
        if (!selected.length) {
            log(t("valNoChannels"));
            return { hasErrors: true, results: [] };
        }
        const wr = cleanWebRootValue(webRoot);
        const proj = getProjectPath();
        let webRootAbs = wr;
        if (wr && proj && !path.isAbsolute(wr)) {
            webRootAbs = path.join(proj, wr);
        }
        const commonIssues = [];
        if (!wr) {
            commonIssues.push(t("valNeedWebRoot"));
        }
        else {
            const indexHtml = path.join(webRootAbs, "index.html");
            if (!fs.existsSync(indexHtml)) {
                commonIssues.push(t("valNeedWebIndex"));
            }
        }
        const results = [];
        let hasErrors = false;
        selected.forEach((channelName) => {
            const result = validateSingleChannel(channelName, commonIssues, proj);
            if (!result.ok) {
                hasErrors = true;
            }
            setChannelValidationState(channelName, result.ok, result.issues);
            results.push({
                channelName,
                ok: result.ok,
                issues: result.issues || [],
            });
        });
        log(hasErrors ? t("valPlatformsSummaryHasErrors") : t("valPlatformsSummaryAllOk"));
        if (hasErrors) {
            results.forEach((r) => {
                if (!r || r.ok) {
                    return;
                }
                const details = Array.isArray(r.issues) ? r.issues.filter(Boolean).join(" | ") : "";
                appendLogLine("- [" + r.channelName + "] " + (details || t("valPlatformsSummaryHasErrors")));
            });
        }
        return { hasErrors, results };
    }
    function collectIterationsFromDom() {
        if (!iterListHost) {
            return [];
        }
        const cards = iterListHost.querySelectorAll(".iter-card");
        const out = [];
        cards.forEach((card) => {
            const folderEl = card.querySelector(".iter-folder");
            const compEl = card.querySelector(".iter-comp");
            const folder = folderEl ? folderEl.value.trim() : "default";
            const component = compEl && compEl.value.trim() ? compEl.value.trim() : "GameSessionController";
            const props = {};
            card.querySelectorAll(".prop-row").forEach((row) => {
                const ke = row.querySelector(".prop-key");
                const ve = row.querySelector(".prop-val");
                const k = ke ? ke.value.trim() : "";
                if (!k) {
                    return;
                }
                props[k] = parsePropInputString(ve ? ve.value : "");
            });
            out.push({
                folder: folder || "default",
                target: {
                    nodePath: "",
                    component,
                    properties: props,
                },
            });
        });
        return out;
    }
    /** Как collectIterationsFromDom, но пустое имя компонента не подставляет GameSessionController — для проверки. */
    function collectIterationsFromDomForValidation() {
        if (!iterListHost) {
            return [];
        }
        const cards = iterListHost.querySelectorAll(".iter-card");
        const out = [];
        cards.forEach((card) => {
            const folderEl = card.querySelector(".iter-folder");
            const compEl = card.querySelector(".iter-comp");
            const folder = folderEl ? folderEl.value.trim() : "default";
            const component = compEl ? compEl.value.trim() : "";
            const props = {};
            card.querySelectorAll(".prop-row").forEach((row) => {
                const ke = row.querySelector(".prop-key");
                const ve = row.querySelector(".prop-val");
                const k = ke ? ke.value.trim() : "";
                if (!k) {
                    return;
                }
                props[k] = parsePropInputString(ve ? ve.value : "");
            });
            out.push({
                folder: folder || "default",
                target: {
                    nodePath: "",
                    component,
                    properties: props,
                },
            });
        });
        return out;
    }
    function clearIterCardValidation(card) {
        if (!card) {
            return;
        }
        card.querySelectorAll(".iter-comp, .prop-key, .prop-val").forEach((el) => {
            el.classList.remove("iter-field--ok", "iter-field--bad");
        });
    }
    function applyIterationValidationReport(report) {
        if (!iterListHost || !report) {
            return true;
        }
        const items = report.items;
        if (!Array.isArray(items)) {
            return true;
        }
        const cards = iterListHost.querySelectorAll(".iter-card");
        let anyBad = false;
        if (cards.length > 0 && items.length === 0) {
            anyBad = true;
        }
        if (cards.length !== items.length) {
            anyBad = true;
        }
        cards.forEach((card, i) => {
            clearIterCardValidation(card);
            const item = items[i];
            if (!item) {
                anyBad = true;
                return;
            }
            const compInp = card.querySelector(".iter-comp");
            const classOk = !!(item.component && item.componentKnown);
            if (compInp) {
                if (!classOk) {
                    compInp.classList.add("iter-field--bad");
                    anyBad = true;
                }
                else {
                    compInp.classList.add("iter-field--ok");
                }
            }
            if (!classOk) {
                return;
            }
            card.querySelectorAll(".prop-row").forEach((row) => {
                const ke = row.querySelector(".prop-key");
                const ve = row.querySelector(".prop-val");
                const k = ke ? ke.value.trim() : "";
                if (!k) {
                    return;
                }
                const kr = item.keys[k];
                if (!kr || !kr.ok) {
                    if (ke) {
                        ke.classList.add("iter-field--bad");
                    }
                    if (ve) {
                        ve.classList.add("iter-field--bad");
                    }
                    anyBad = true;
                }
                else {
                    if (ke) {
                        ke.classList.add("iter-field--ok");
                    }
                    if (ve) {
                        ve.classList.add("iter-field--ok");
                    }
                }
            });
        });
        return anyBad;
    }
    function runValidationInPanelProcess(iterations) {
        const proj = getProjectPath();
        if (!proj) {
            return { ok: false, items: [] };
        }
        try {
            const validateMod = require("../batch_iteration_validate");
            return validateMod.validatePlayableBatchIterations(proj, iterations);
        }
        catch (_e) {
            return { ok: false, items: [] };
        }
    }
    async function fetchIterationValidationReport(iterations) {
        let report = null;
        try {
            report = await ipcToMainMulti("validate-playable-batch-iterations", { iterations });
        }
        catch (_ipc) {
            report = null;
        }
        const n = iterations.length;
        const items = report && report.items;
        if (Array.isArray(items) && items.length === n && n > 0) {
            return report;
        }
        return runValidationInPanelProcess(iterations);
    }
    async function runIterationValidation() {
        const platformReport = runChannelValidation();
        if (!useIter || !useIter.checked) {
            return !!(platformReport && platformReport.hasErrors);
        }
        const iterations = collectIterationsFromDomForValidation();
        if (!iterations.length) {
            log(t("valNeedIter"));
            return true;
        }
        try {
            const report = await fetchIterationValidationReport(iterations);
            const anyBad = applyIterationValidationReport(report);
            log(anyBad ? t("valSummaryHasErrors") : t("valSummaryAllOk"));
            return anyBad || !!(platformReport && platformReport.hasErrors);
        }
        catch (e) {
            log(t("validateIpcFail") + String(e));
            return true;
        }
    }
    function clearIterationList() {
        if (iterListHost) {
            iterListHost.innerHTML = "";
        }
    }
    function appendPropRow(propRowsHost, key, valueStr) {
        const row = document.createElement("div");
        row.className = "prop-row";
        const ik = document.createElement("input");
        ik.type = "text";
        ik.className = "inp prop-key inp-key";
        ik.placeholder = t("propKeyPh");
        ik.value = key || "";
        const iv = document.createElement("input");
        iv.type = "text";
        iv.className = "inp prop-val inp-val";
        iv.placeholder = t("propValPh");
        iv.value = valueStr || "";
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "btn btn-sm";
        rm.textContent = "×";
        rm.addEventListener("click", () => {
            row.remove();
            const card = propRowsHost.closest(".iter-card");
            if (card) {
                clearIterCardValidation(card);
            }
            scheduleSave();
        });
        ik.addEventListener("input", scheduleSave);
        iv.addEventListener("input", scheduleSave);
        row.appendChild(ik);
        row.appendChild(iv);
        row.appendChild(rm);
        propRowsHost.appendChild(row);
    }
    function collectSingleCardNorm(card) {
        const folderEl = card.querySelector(".iter-folder");
        const compEl = card.querySelector(".iter-comp");
        const folder = folderEl ? folderEl.value.trim() : "default";
        const component = compEl && compEl.value.trim() ? compEl.value.trim() : "GameSessionController";
        const props = {};
        card.querySelectorAll(".prop-row").forEach((row) => {
            const ke = row.querySelector(".prop-key");
            const ve = row.querySelector(".prop-val");
            const k = ke ? ke.value.trim() : "";
            if (!k) {
                return;
            }
            props[k] = parsePropInputString(ve ? ve.value : "");
        });
        return {
            folder: folder || "default",
            nodePath: "",
            component,
            properties: props,
        };
    }
    function applyNormToCard(card, norm) {
        clearIterCardValidation(card);
        const folderEl = card.querySelector(".iter-folder");
        const compEl = card.querySelector(".iter-comp");
        if (folderEl) {
            folderEl.value = norm.folder != null ? String(norm.folder) : "default";
        }
        if (compEl) {
            compEl.value = norm.component != null ? String(norm.component) : "GameSessionController";
        }
        const propRows = card.querySelector(".prop-rows");
        if (!propRows) {
            return;
        }
        propRows.innerHTML = "";
        const keys = Object.keys(norm.properties || {});
        if (keys.length === 0) {
            appendPropRow(propRows, "", "");
        }
        else {
            keys.forEach((k) => {
                appendPropRow(propRows, k, valueToPropInputString(norm.properties[k]));
            });
        }
        scheduleSave();
    }
    function addIterationCard(rawIt) {
        if (!iterListHost) {
            return;
        }
        const norm = rawIt
            ? normalizeIterationFromData(rawIt)
            : {
                folder: "new",
                nodePath: "",
                component: "GameSessionController",
                properties: { usePlayableEndRules: false },
            };
        const card = document.createElement("div");
        card.className = "iter-card";
        const head = document.createElement("div");
        head.className = "iter-card-head";
        const title = document.createElement("span");
        title.textContent = t("iterTitle");
        const headBtns = document.createElement("div");
        headBtns.className = "iter-card-btns";
        const btnCopyIter = document.createElement("button");
        btnCopyIter.type = "button";
        btnCopyIter.className = "btn btn-sm";
        btnCopyIter.textContent = t("iterCopy");
        const btnPasteIter = document.createElement("button");
        btnPasteIter.type = "button";
        btnPasteIter.className = "btn btn-sm";
        btnPasteIter.textContent = t("iterPaste");
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-sm";
        del.textContent = t("iterDelete");
        del.addEventListener("click", () => {
            card.remove();
            scheduleSave();
        });
        btnCopyIter.addEventListener("click", async () => {
            const snap = collectSingleCardNorm(card);
            lastIterationClip = snap;
            const payload = {
                playableBatchIteration: 1,
                folder: snap.folder,
                nodePath: "",
                component: snap.component,
                properties: snap.properties,
            };
            const ok = await copyTextToClipboard(JSON.stringify(payload, null, 2));
            log(ok ? t("iterCopyOk") : t("iterCopyMem"));
        });
        btnPasteIter.addEventListener("click", async () => {
            let candidate = lastIterationClip;
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const clipTxt = (await navigator.clipboard.readText()).trim();
                    if (clipTxt) {
                        const p = JSON.parse(clipTxt);
                        if (p && typeof p === "object") {
                            candidate =
                                p.playableBatchIteration === 1
                                    ? {
                                        folder: p.folder,
                                        nodePath: "",
                                        component: p.component != null ? p.component : "GameSessionController",
                                        properties: p.properties && typeof p.properties === "object"
                                            ? p.properties
                                            : {},
                                    }
                                    : p;
                        }
                    }
                }
            }
            catch (_pc) { }
            const pasted = normalizeIterationPastePayload(candidate);
            if (!pasted) {
                log(t("iterPasteEmpty"));
                return;
            }
            applyNormToCard(card, pasted);
        });
        headBtns.appendChild(btnCopyIter);
        headBtns.appendChild(btnPasteIter);
        headBtns.appendChild(del);
        head.appendChild(title);
        head.appendChild(headBtns);
        card.appendChild(head);
        function addField(lblText, cls, ph, val, hintTitle) {
            const wrap = document.createElement("div");
            wrap.className = "iter-field";
            const head = document.createElement("div");
            head.className = "iter-lbl-with-hint";
            const labSpan = document.createElement("span");
            labSpan.textContent = lblText;
            head.appendChild(labSpan);
            if (hintTitle) {
                const tip = document.createElement("button");
                tip.type = "button";
                tip.className = "hint-tip";
                tip.setAttribute("aria-label", t("hintAria"));
                tip.title = hintTitle;
                tip.textContent = "!";
                head.appendChild(tip);
            }
            const inp = document.createElement("input");
            inp.type = "text";
            inp.className = "inp " + cls;
            inp.placeholder = ph;
            inp.value = val;
            inp.addEventListener("input", scheduleSave);
            wrap.appendChild(head);
            wrap.appendChild(inp);
            card.appendChild(wrap);
        }
        addField(t("iterFldFolder"), "iter-folder", t("iterFldFolderPh"), norm.folder, t("iterFldFolderTip"));
        addField(t("iterFldComp"), "iter-comp", "GameSessionController", norm.component, t("iterFldCompTip"));
        const propsWrap = document.createElement("div");
        propsWrap.className = "iter-field";
        const phead = document.createElement("div");
        phead.className = "iter-lbl-with-hint";
        const plabSpan = document.createElement("span");
        plabSpan.textContent = t("iterFldProps");
        phead.appendChild(plabSpan);
        const pTip = document.createElement("button");
        pTip.type = "button";
        pTip.className = "hint-tip";
        pTip.setAttribute("aria-label", t("hintAria"));
        pTip.title = t("iterFldPropsTip");
        pTip.textContent = "!";
        phead.appendChild(pTip);
        propsWrap.appendChild(phead);
        const propRows = document.createElement("div");
        propRows.className = "prop-rows";
        propsWrap.appendChild(propRows);
        card.appendChild(propsWrap);
        const pkeys = Object.keys(norm.properties);
        if (pkeys.length === 0) {
            appendPropRow(propRows, "", "");
        }
        else {
            pkeys.forEach((k) => {
                appendPropRow(propRows, k, valueToPropInputString(norm.properties[k]));
            });
        }
        const addP = document.createElement("button");
        addP.type = "button";
        addP.className = "btn btn-sm";
        addP.textContent = t("iterAddProp");
        addP.addEventListener("click", () => {
            appendPropRow(propRows, "", "");
            scheduleSave();
        });
        card.appendChild(addP);
        iterListHost.appendChild(card);
    }
    function renderIterationsListFromConfig(iterationsArray) {
        clearIterationList();
        const arr = Array.isArray(iterationsArray) && iterationsArray.length > 0
            ? iterationsArray
            : DEFAULT_ITER.iterations;
        arr.forEach((it) => addIterationCard(it));
    }
    function getBatchPanelI18nScope() {
        try {
            if (channelsEl && typeof channelsEl.getRootNode === "function") {
                const rn = channelsEl.getRootNode();
                if (rn && typeof rn.querySelectorAll === "function") {
                    return rn;
                }
            }
        }
        catch (_gr) { }
        if (root && typeof root.querySelectorAll === "function") {
            return root;
        }
        try {
            if (typeof document !== "undefined" && document.getElementById) {
                const br = document.getElementById("batchPanelRoot");
                if (br) {
                    const rn2 = br.getRootNode && br.getRootNode();
                    if (rn2 && typeof rn2.querySelectorAll === "function") {
                        return rn2;
                    }
                    if (typeof br.querySelectorAll === "function") {
                        return br;
                    }
                }
            }
        }
        catch (_gr2) { }
        return typeof document !== "undefined" ? document : null;
    }
    function setupHintBubble() {
        const bubble = q("#hintBubble");
        const shell = q("#batchPanelRoot");
        if (!bubble || !shell) {
            return;
        }
        shell.addEventListener("click", (ev) => {
            const tip = ev.target.closest(".hint-tip");
            if (tip) {
                ev.preventDefault();
                ev.stopPropagation();
                const txt = (tip.getAttribute("title") || "").trim();
                if (!txt) {
                    return;
                }
                bubble.textContent = txt;
                bubble.removeAttribute("hidden");
                const r = tip.getBoundingClientRect();
                const margin = 8;
                let left = r.left;
                let top = r.bottom + 6;
                const maxW = Math.min(340, window.innerWidth - 2 * margin);
                bubble.style.maxWidth = maxW + "px";
                if (left + maxW > window.innerWidth - margin) {
                    left = Math.max(margin, window.innerWidth - maxW - margin);
                }
                bubble.style.left = left + "px";
                bubble.style.top = top + "px";
                requestAnimationFrame(() => {
                    const h = bubble.offsetHeight;
                    if (h && top + h > window.innerHeight - margin) {
                        bubble.style.top = Math.max(margin, r.top - 6 - h) + "px";
                    }
                });
                return;
            }
            bubble.setAttribute("hidden", "");
        });
        if (typeof document !== "undefined") {
            document.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape" && !bubble.hasAttribute("hidden")) {
                    bubble.setAttribute("hidden", "");
                }
            });
        }
    }
    function applyBatchPanelLanguage() {
        const scope = getBatchPanelI18nScope();
        if (scope && scope.querySelectorAll) {
            applyDataI18nToScope(scope);
        }
        syncLangButton();
        refreshChannelExtraI18n();
        renderExtVersionLabel();
        setUpdateUiState(updateUiState);
        setRestartRequiredNotice(false);
        syncChannelToggleAllState();
        renderApplierInstallBadge();
        if (iterListHost && iterListHost.querySelector(".iter-card")) {
            const snap = collectIterationsFromDom();
            renderIterationsListFromConfig(snap.length ? snap : DEFAULT_ITER.iterations);
        }
    }
    let saveTimer = null;
    function scheduleSave() {
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(() => {
            saveTimer = null;
            persistToDisk();
        }, 450);
    }
    function persistToDisk() {
        try {
            const proj = getProjectPath();
            if (!proj) {
                return;
            }
            const abs = path.join(proj, PERSIST_FILE);
            const state = {
                version: 8,
                panelLang: panelLang === "en" ? "en" : "ru",
                selectedChannels: selectedChannels(),
                webRoot: cleanWebRootValue(webRoot),
                batchBuildName: cleanBatchBuildNameValue(batchBuildName),
                batchNamesLowercase: batchNamesLowercase ? batchNamesLowercase.checked : true,
                useIter: useIter ? useIter.checked : true,
                iterationsSnapshot: collectIterationsFromDom(),
                obfusc: obf ? obf.checked : true,
                channelOptions: collectChannelOptions(),
            };
            const dir = path.dirname(abs);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(abs, JSON.stringify(state, null, 2), "utf8");
        }
        catch (_p) { }
    }
    renderIterationsListFromConfig(DEFAULT_ITER.iterations);
    function applyPersistedState(st) {
        if (!st || typeof st !== "object") {
            return;
        }
        if (st.panelLang === "en" || st.panelLang === "ru") {
            panelLang = st.panelLang;
        }
        if (Array.isArray(st.selectedChannels) && st.selectedChannels.length > 0) {
            setAllChannels(false);
            st.selectedChannels.forEach((n) => {
                if (boxState[n]) {
                    boxState[n].checked = true;
                }
            });
        }
        syncChannelToggleAllState();
        if (webRoot && typeof st.webRoot === "string" && st.webRoot.trim()) {
            webRoot.value = st.webRoot;
        }
        if (batchBuildName) {
            if (typeof st.batchBuildName === "string") {
                batchBuildName.value = st.batchBuildName.trim();
            }
            else if (typeof st.batchOutputDir === "string" && st.batchOutputDir.trim()) {
                const legacy = st.batchOutputDir.trim().replace(/_BUILD$/i, "");
                batchBuildName.value = legacy || DEFAULT_BATCH_BUILD_NAME;
            }
            else if (!batchBuildName.value.trim()) {
                batchBuildName.value = DEFAULT_BATCH_BUILD_NAME;
            }
        }
        if (batchNamesLowercase) {
            batchNamesLowercase.checked = typeof st.batchNamesLowercase === "boolean"
                ? st.batchNamesLowercase
                : true;
        }
        if (useIter && typeof st.useIter === "boolean") {
            useIter.checked = st.useIter;
        }
        if (Array.isArray(st.iterationsSnapshot) && st.iterationsSnapshot.length > 0) {
            renderIterationsListFromConfig(st.iterationsSnapshot);
        }
        else if (typeof st.iterJson === "string" && st.iterJson.trim()) {
            try {
                const parsed = JSON.parse(st.iterJson);
                if (parsed.iterations && Array.isArray(parsed.iterations)) {
                    renderIterationsListFromConfig(parsed.iterations);
                }
            }
            catch (_q) { }
        }
        if (obf && typeof st.obfusc === "boolean") {
            obf.checked = st.obfusc;
        }
        if (st.channelOptions && typeof st.channelOptions === "object") {
            applyChannelOptionsFromState(st.channelOptions);
        }
    }
    try {
        const cache = require("../../platform/cocos/cache").default;
        const c = cache.get();
        if (webRoot && c.path) {
            webRoot.value = c.path;
        }
        if (batchBuildName && !batchBuildName.value.trim()) {
            batchBuildName.value = DEFAULT_BATCH_BUILD_NAME;
        }
        if (obf) {
            obf.checked = c.enable_obfuscator !== false;
        }
    }
    catch (_a) { }
    try {
        const ui = await refreshBatchUiSnapshot({
            logDeps: true,
            applyWebRootHint: true,
            applyObfDefault: true,
        });
        if (ui && Array.isArray(ui.channelNames) && ui.channelNames.length > 0) {
            const merged = mergeUniqueSorted(names, ui.channelNames);
            merged.forEach((name) => {
                if (!boxState[name]) {
                    appendChannelItem(name);
                }
            });
            names.length = 0;
            merged.forEach((n) => names.push(n));
            syncChannelToggleAllState();
        }
    }
    catch (e) {
        log(t("ipcBatchUi") + String(e));
    }
    if (persistedBatchSt) {
        applyPersistedState(persistedBatchSt);
    }
    applyBatchPanelLanguage();
    refreshApplierInstallBadge();
    refreshWebBuildAgeChip();
    let applierWatchTimer = setInterval(refreshApplierInstallBadge, 2500);
    let webBuildAgeTimer = setInterval(refreshWebBuildAgeChip, 1000);
    ctx.__stopApplierWatch = () => {
        if (applierWatchTimer) {
            clearInterval(applierWatchTimer);
            applierWatchTimer = null;
        }
    };
    ctx.__stopWebBuildAgeWatch = () => {
        if (webBuildAgeTimer) {
            clearInterval(webBuildAgeTimer);
            webBuildAgeTimer = null;
        }
    };
    setupHintBubble();
    if (useIter) {
        syncIterVisibility();
    }
    if (webRoot) {
        webRoot.addEventListener("input", () => {
            clearChannelValidationState();
            refreshWebBuildAgeChip();
            scheduleSave();
        });
    }
    if (batchBuildName) {
        batchBuildName.addEventListener("input", scheduleSave);
    }
    if (batchNamesLowercase) {
        batchNamesLowercase.addEventListener("change", scheduleSave);
    }
    if (obf) {
        obf.addEventListener("change", scheduleSave);
    }
    if (channelToggleAll) {
        channelToggleAll.addEventListener("change", () => {
            setAllChannels(!!channelToggleAll.checked);
            scheduleSave();
        });
    }
    if (debugAllPlatforms) {
        debugAllPlatforms.addEventListener("change", scheduleSave);
    }
    ctx.__persistBatchUi = () => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        persistToDisk();
    };
    const openApplierFolderAction = async () => {
            try {
                const res = await ipcToMain("open-playable-applier-folder", {
                    locale: panelLang === "en" ? "en" : "ru",
                });
                flashStepStatus(t("folderOpened"));
                if (res && res.folder) {
                    log(t("logCopyApplier") + path.join(res.folder, "PlayableBatchOverrideApplier.ts"));
                }
            }
            catch (e) {
                flashStepStatus(t("folderOpenFail"));
                log(t("logApplierErr") + String(e));
            }
    };
    if (btnOpenApplierFolder) {
        btnOpenApplierFolder.addEventListener("click", openApplierFolderAction);
    }
    if (btnOpenApplierFolderTop) {
        btnOpenApplierFolderTop.addEventListener("click", openApplierFolderAction);
    }
    if (btnUpdateExtension) {
        btnUpdateExtension.addEventListener("click", async () => {
            btnUpdateExtension.disabled = true;
            setUpdateUiState("checking");
            log(t("updateStart"));
            try {
                const res = await ipcToMain("update-extension-from-github", {
                    locale: panelLang === "en" ? "en" : "ru",
                });
                if (res && res.ok && res.updated) {
                    setManualUpdateLink("");
                    const restartRequired = !!(res && res.restartRequired);
                    setUpdateUiState(restartRequired ? "restart" : "updated");
                    if (restartRequired) {
                        setRestartRequiredNotice(true);
                    }
                    log(t("updateDone"));
                    await refreshBatchUiSnapshot({
                        logDeps: false,
                        applyWebRootHint: false,
                        applyObfDefault: false,
                        logError: false,
                    });
                    if (restartRequired || (res && res.restartMessage)) {
                        appendLogLine(String((res && res.restartMessage) ? res.restartMessage : t("updateRestartRequired")));
                    }
                    return;
                }
                if (res && res.ok && res.checkOnly) {
                    if (res.updateAvailable) {
                        setUpdateUiState("available");
                        setManualUpdateLink(String((res && res.downloadUrl) || (res && res.releaseUrl) || ""));
                        log(t("updateAvailableManual"));
                        if (res.latestVersion) {
                            appendLogLine(t("updateAvailableVersion") + String(res.latestVersion));
                        }
                        if (res.downloadUrl) {
                            appendLogLine(t("updateDownloadPrefix") + String(res.downloadUrl));
                        }
                        return;
                    }
                    setManualUpdateLink("");
                    setUpdateUiState("latest");
                    log(t("updateUpToDate"));
                    return;
                }
                if (res && res.ok) {
                    setManualUpdateLink("");
                    setUpdateUiState("latest");
                    log(t("updateUpToDate"));
                    return;
                }
                if (res && res.code === "no_remote") {
                    setUpdateUiState("failed");
                    log(t("updateNoRemote"));
                    if (res.hint) {
                        appendLogLine(t("updateHintPrefix") + String(res.hint));
                    }
                    return;
                }
                setUpdateUiState("failed");
                log(t("updateFailed") + ((res && res.message) ? String(res.message) : "unknown"));
                if (res && res.hint) {
                    appendLogLine(t("updateHintPrefix") + String(res.hint));
                }
                if (res && res.detail) {
                    appendLogLine(String(res.detail));
                }
            }
            catch (e) {
                setUpdateUiState("failed");
                log(t("updateFailed") + String(e));
            }
            finally {
                btnUpdateExtension.disabled = false;
            }
        });
    }
    if (btnOpenUpdatePage) {
        btnOpenUpdatePage.addEventListener("click", () => {
            if (!manualUpdateUrl) {
                return;
            }
            const ok = openExternalLink(manualUpdateUrl);
            if (!ok) {
                appendLogLine(t("updateDownloadPrefix") + manualUpdateUrl);
            }
        });
    }
    if (btnLang) {
        btnLang.addEventListener("click", () => {
            panelLang = panelLang === "ru" ? "en" : "ru";
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
            persistToDisk();
            applyBatchPanelLanguage();
        });
    }
    if (btnHelp) {
        btnHelp.addEventListener("click", () => {
            setHelpOpen(true);
        });
    }
    if (btnHelpClose) {
        btnHelpClose.addEventListener("click", () => {
            setHelpOpen(false);
        });
    }
    if (helpBackdrop) {
        helpBackdrop.addEventListener("click", () => {
            setHelpOpen(false);
        });
    }
    if (helpOverlay) {
        const escRoot = (typeof helpOverlay.closest === "function" && helpOverlay.closest("#batchPanelRoot")) ||
            (root && typeof root.addEventListener === "function" ? root : null) ||
            (typeof document !== "undefined" ? document : null);
        if (escRoot && typeof escRoot.addEventListener === "function") {
            escRoot.addEventListener("keydown", (ev) => {
                if (ev.key !== "Escape" || !helpOverlay.classList.contains("help-overlay--open")) {
                    return;
                }
                ev.preventDefault();
                ev.stopPropagation();
                setHelpOpen(false);
            }, escRoot === document);
        }
    }
    ctx.__closeBatchHelp = () => {
        setHelpOpen(false);
    };
    if (btnCopyLog && logEl) {
        btnCopyLog.addEventListener("click", async () => {
            const logText = logEl.textContent || "";
            let ok = false;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(logText);
                    ok = true;
                }
                else {
                    throw new Error("no clipboard api");
                }
            }
            catch (_b) {
                try {
                    const ta = document.createElement("textarea");
                    ta.value = logText;
                    ta.style.position = "fixed";
                    ta.style.left = "-9999px";
                    (root || document.body).appendChild(ta);
                    ta.select();
                    ok = document.execCommand("copy");
                    ta.remove();
                }
                catch (_c) { }
            }
            if (copyStatus) {
                copyStatus.textContent = ok ? t("copyOk") : t("copyFail");
                setTimeout(() => {
                    if (copyStatus) {
                        copyStatus.textContent = "";
                    }
                }, 3500);
            }
        });
    }
    if (btnBrowseWeb) {
        btnBrowseWeb.addEventListener("click", async () => {
            try {
                const res = await ipcToMain("pick-web-mobile-folder", {
                    locale: panelLang === "en" ? "en" : "ru",
                });
                if (!res || res.canceled) {
                    log(t("pickCancel"));
                    return;
                }
                if (webRoot && res.displayPath) {
                    webRoot.value = res.displayPath;
                    refreshWebBuildAgeChip();
                    scheduleSave();
                }
                if (res.warning) {
                    log(res.warning);
                }
                else if (res.valid) {
                    log(t("pickOk") + (res.displayPath || res.absPath));
                }
            }
            catch (e) {
                log(t("pickErr") + String(e));
            }
        });
    }
    function syncIterVisibility() {
        if (iterBlock && useIter) {
            iterBlock.style.display = useIter.checked ? "block" : "none";
        }
    }
    async function resetPanelToDefaults() {
        setAllChannels(false);
        DEFAULT_ITER.enabledChannels.forEach((n) => {
            if (boxState[n]) {
                boxState[n].checked = true;
            }
        });
        if (useIter) {
            useIter.checked = true;
        }
        try {
            const ui = await ipcToMain("query-batch-ui", {});
            if (webRoot && ui.webRootHint) {
                webRoot.value = ui.webRootHint;
            }
            if (obf && ui.enableObfuscator !== undefined) {
                obf.checked = ui.enableObfuscator !== false;
            }
        }
        catch (_rq) {
            try {
                const cache = require("../../platform/cocos/cache").default;
                const c = cache.get();
                if (webRoot) {
                    webRoot.value = c.path || "";
                }
                if (obf) {
                    obf.checked = c.enable_obfuscator !== false;
                }
            }
            catch (_rc) {
                if (webRoot) {
                    webRoot.value = "";
                }
                if (obf) {
                    obf.checked = true;
                }
            }
        }
        renderIterationsListFromConfig(DEFAULT_ITER.iterations);
        applyDefaultChannelOptions();
        if (batchBuildName) {
            batchBuildName.value = DEFAULT_BATCH_BUILD_NAME;
        }
        if (batchNamesLowercase) {
            batchNamesLowercase.checked = true;
        }
        syncIterVisibility();
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        refreshWebBuildAgeChip();
        persistToDisk();
    }
    if (useIter) {
        useIter.addEventListener("change", () => {
            syncIterVisibility();
            scheduleSave();
        });
    }
    if (btnAddIter) {
        btnAddIter.addEventListener("click", () => {
            addIterationCard(null);
            scheduleSave();
        });
    }
    if (btnResetDefaults) {
        btnResetDefaults.addEventListener("click", async () => {
            await resetPanelToDefaults();
            log(t("resetOk"));
        });
    }
    if (btnRun) {
        btnRun.addEventListener("click", async () => {
            const wr = cleanWebRootValue(webRoot);
            let iterations = [{ folder: "default", overrides: {} }];
            let enabledChannelNames = selectedChannels();
            if (useIter && useIter.checked) {
                iterations = collectIterationsFromDom();
                if (!iterations.length) {
                    log(t("needIter"));
                    return;
                }
            }
            else {
                iterations = [{ folder: "default", overrides: {} }];
            }
            const obfusc = !!(obf && obf.checked);
            const bname = cleanBatchBuildNameValue(batchBuildName);
            const bLower = !!(batchNamesLowercase && batchNamesLowercase.checked);
            const payloadObj = {
                webRoot: wr,
                batchBuildName: bname,
                batchNamesLowercase: bLower,
                iterations,
                enabledChannelNames,
                enableObfuscator: obfusc,
                channelOptions: collectChannelOptions(),
                panelLang: panelLang === "en" ? "en" : "ru",
            };
            log(t("runStart") + JSON.stringify(wr) + t("runMid") + JSON.stringify(bname) + t("runEnd") + bLower);
            try {
                const res = await ipcToMainMulti("run-playable-batch", wr, iterations, enabledChannelNames, obfusc, payloadObj);
                log(res);
                const channelReportAfterBuild = runChannelValidation();
                if (useIter && useIter.checked && res && res.ok) {
                    try {
                        const viter = collectIterationsFromDomForValidation();
                        const vrep = await fetchIterationValidationReport(viter);
                        const anyBad = applyIterationValidationReport(vrep);
                        appendLogLine(anyBad ? t("valSummaryHasErrors") : t("valSummaryAllOk"));
                        if (channelReportAfterBuild && channelReportAfterBuild.hasErrors) {
                            appendLogLine(t("valPlatformsSummaryHasErrors"));
                        }
                    }
                    catch (_valAfter) { }
                }
            }
            catch (e) {
                const msg = (e && e.message) ? e.message : String(e);
                log(t("buildErr") + msg + ((e && e.stack) ? "\n\n" + e.stack : ""));
            }
        });
    }
    if (btnValidateIters) {
        btnValidateIters.addEventListener("click", () => {
            void runIterationValidation();
        });
    }
    if (iterListHost) {
        iterListHost.addEventListener("input", (ev) => {
            const el = ev.target;
            if (!el || typeof el.closest !== "function") {
                return;
            }
            const card = el.closest(".iter-card");
            if (card) {
                clearIterCardValidation(card);
            }
        });
    }
};
exports.beforeClose = function () {
    try {
        if (typeof this.__stopApplierWatch === "function") {
            this.__stopApplierWatch();
        }
    }
    catch (_e0) { }
    try {
        if (typeof this.__stopWebBuildAgeWatch === "function") {
            this.__stopWebBuildAgeWatch();
        }
    }
    catch (_eWebAge) { }
    try {
        if (typeof this.__closeBatchHelp === "function") {
            this.__closeBatchHelp();
        }
    }
    catch (_e) { }
    try {
        if (typeof this.__persistBatchUi === "function") {
            this.__persistBatchUi();
        }
    }
    catch (_e2) { }
};
