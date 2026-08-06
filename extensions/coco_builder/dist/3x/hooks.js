"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAfterBuild = void 0;
const cocos_main_1 = __importDefault(require("../platform/cocos/cocos_main"));
const onAfterBuild = async function (options, result) {
    if (options.platform !== "web-mobile" && options.platform !== "web-desktop") {
        return;
    }
    try {
        const config_1 = require("../core/config/config");
        config_1.default.s_playable_batch_inject = "";
        config_1.default.playable_batch_channel_head_inject = {};
        new cocos_main_1.default(Editor.App.version, result.dest);
    }
    catch (error) {
        console.error(error);
    }
};
exports.onAfterBuild = onAfterBuild;
