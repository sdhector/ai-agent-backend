export const expiredToken = {
  access_token: 'expired-token',
  refresh_token: 'refresh-token',
  expires_at: new Date(Date.now() - 60_000).toISOString(),
};

export const validToken = {
  access_token: 'valid-token',
  refresh_token: 'refresh-token',
  expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
};

export const refreshedToken = {
  access_token: 'refreshed-token',
  refresh_token: 'new-refresh-token',
  expires_in: 3600,
};
