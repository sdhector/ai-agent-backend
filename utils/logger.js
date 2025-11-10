"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LOG_LEVELS = void 0;
exports.createLogger = createLogger;
exports.LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};
var Logger = /** @class */ (function () {
    function Logger(context) {
        this.context = context;
        this.level = process.env.LOG_LEVEL || 'INFO';
    }
    Logger.prototype.debug = function (message, meta) {
        if (meta === void 0) { meta = {}; }
        if (this.shouldLog('DEBUG')) {
            console.log("[DEBUG] [".concat(this.context, "] ").concat(message), meta);
        }
    };
    Logger.prototype.info = function (message, meta) {
        if (meta === void 0) { meta = {}; }
        if (this.shouldLog('INFO')) {
            console.log("[INFO] [".concat(this.context, "] ").concat(message), meta);
        }
    };
    Logger.prototype.warn = function (message, meta) {
        if (meta === void 0) { meta = {}; }
        if (this.shouldLog('WARN')) {
            console.warn("[WARN] [".concat(this.context, "] ").concat(message), meta);
        }
    };
    Logger.prototype.error = function (message, error, meta) {
        if (error === void 0) { error = null; }
        if (meta === void 0) { meta = {}; }
        if (this.shouldLog('ERROR')) {
            console.error("[ERROR] [".concat(this.context, "] ").concat(message), __assign({ error: error === null || error === void 0 ? void 0 : error.message, stack: error === null || error === void 0 ? void 0 : error.stack }, meta));
        }
    };
    Logger.prototype.shouldLog = function (level) {
        return exports.LOG_LEVELS[level] >= exports.LOG_LEVELS[this.level];
    };
    return Logger;
}());
exports.Logger = Logger;
function createLogger(context) {
    return new Logger(context);
}
module.exports = { createLogger: createLogger, LOG_LEVELS: exports.LOG_LEVELS };
