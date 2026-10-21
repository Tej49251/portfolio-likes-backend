/**
 * src/config/env.js
 *
 * Validates and exports all required environment variables at startup.
 * Throws immediately if any required variable is missing, so misconfigured
 * deployments fail fast rather than silently.
 */

'use strict';

function requireEnv(name) {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      'Check your .env file or Render environment settings.'
    );
  }
  return val.trim();
}

function optionalEnv(name, defaultValue) {
  const val = process.env[name];
  return val && val.trim() !== '' ? val.trim() : defaultValue;
}

const config = {
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  port: parseInt(optionalEnv('PORT', '3000'), 10),

  // PostgreSQL connection string (Neon pooled endpoint)
  databaseUrl: requireEnv('DATABASE_URL'),

  // Exact origin of the deployed Firebase portfolio
  // Example: https://portfolio-tejas-4c9f7.web.app
  allowedOrigin: requireEnv('ALLOWED_ORIGIN'),

  // Admin secret — never expose this to the public API or frontend
  adminSecret: requireEnv('ADMIN_SECRET'),

  get isProduction() {
    return this.nodeEnv === 'production';
  },
};

// Sanity-check: admin secret must be at least 32 characters
if (config.adminSecret.length < 32) {
  throw new Error(
    'ADMIN_SECRET must be at least 32 characters. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

// Sanity-check: ALLOWED_ORIGIN must look like a URL
if (!/^https?:\/\//.test(config.allowedOrigin)) {
  throw new Error(
    `ALLOWED_ORIGIN must be a full URL (including protocol). Got: "${config.allowedOrigin}"`
  );
}

export default config;
