"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshedToken = exports.validToken = exports.expiredToken = void 0;
exports.expiredToken = {
    access_token: 'expired-token',
    refresh_token: 'refresh-token',
    expires_at: new Date(Date.now() - 60000).toISOString(),
};
exports.validToken = {
    access_token: 'valid-token',
    refresh_token: 'refresh-token',
    expires_at: new Date(Date.now() + 60 * 60000).toISOString(),
};
exports.refreshedToken = {
    access_token: 'refreshed-token',
    refresh_token: 'new-refresh-token',
    expires_in: 3600,
};
