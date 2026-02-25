/**
 * Environment variable validation and configuration
 */

const REQUIRED_ENV_VARS = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CF_PAGES_PROJECT_NAME',
  'CF_PAGES_BRANCH'
];

/**
 * Validates that all required environment variables are set
 * @throws {Error} If any required environment variable is missing
 */
function validateEnv() {
  const missing = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Returns validated configuration object from environment variables
 * @returns {Object} Configuration object with all required values
 */
function getEnv() {
  validateEnv();

  return {
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    projectName: process.env.CF_PAGES_PROJECT_NAME,
    branch: process.env.CF_PAGES_BRANCH,
    productionBranch: process.env.CF_PAGES_PRODUCTION_BRANCH || 'main'
  };
}

module.exports = {
  validateEnv,
  getEnv
};
