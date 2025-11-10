"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.malformedResponse = exports.networkError = exports.timeoutError = exports.rateLimitError = void 0;
exports.rateLimitError = {
    response: {
        status: 429,
        data: {
            error: {
                message: 'Rate limit exceeded',
            },
        },
    },
};
exports.timeoutError = Object.assign(new Error('timeout of 30000ms exceeded'), {
    code: 'ECONNABORTED',
});
exports.networkError = Object.assign(new Error('getaddrinfo ENOTFOUND anthropic.com'), {
    code: 'ENOTFOUND',
});
exports.malformedResponse = {
    response: {
        status: 200,
        data: {
            unexpected: 'structure',
        },
    },
};
