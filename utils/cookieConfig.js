/**
 * Secure Cookie Configuration
 * Centralized cookie options for authentication tokens
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Access token cookie options
 * Short-lived token (15 minutes)
 */
const accessTokenCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/'
};

/**
 * Refresh token cookie options
 * Long-lived token (7 days)
 */
const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth' // Only sent to auth routes
};

/**
 * Clear cookie options (for logout)
 */
const clearCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  path: '/'
};

/**
 * Set authentication cookies on response
 * @param {Response} res - Express response object
 * @param {string} accessToken - JWT access token
 * @param {string} refreshToken - JWT refresh token
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, accessTokenCookieOptions);
  res.cookie('refreshToken', refreshToken, {
    ...refreshTokenCookieOptions,
    path: '/' // Allow refresh from any path
  });
};

/**
 * Clear authentication cookies on response
 * @param {Response} res - Express response object
 */
const clearAuthCookies = (res) => {
  res.clearCookie('accessToken', clearCookieOptions);
  res.clearCookie('refreshToken', { ...clearCookieOptions, path: '/' });
};

/**
 * Set only access token cookie (for token refresh)
 * @param {Response} res - Express response object
 * @param {string} accessToken - JWT access token
 */
const setAccessTokenCookie = (res, accessToken) => {
  res.cookie('accessToken', accessToken, accessTokenCookieOptions);
};

module.exports = {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  clearCookieOptions,
  setAuthCookies,
  clearAuthCookies,
  setAccessTokenCookie
};
