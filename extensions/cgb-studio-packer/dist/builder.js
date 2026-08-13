"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.configs = void 0;
exports.configs = {
    '*': {
        hooks: './hooks',
        options: {},
    },
};
function load() {
    console.log('[CGB Studio packer] build extension loaded');
}
exports.load = load;
function unload() { }
exports.unload = unload;
