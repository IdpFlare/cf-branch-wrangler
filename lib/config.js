/**
 * Environment variable validation and configuration
 */

// Only API token is truly required since we derive the rest
const REQUIRED_ENV_VARS = ['CLOUDFLARE_API_TOKEN'];

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
 * Values are either set directly or can be derived later
 * @returns {Object} Configuration object with all required values
 */
function getEnv() {
  validateEnv();

  return {
    apiToken: process.env.CLOUDFLARE_API_TOKEN.trim(),
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID, // Optional - Wrangler derives it
    projectName: process.env.CF_PAGES_PROJECT_NAME, // Optional - Derived from wrangler.toml
    branch: process.env.CF_PAGES_BRANCH, // Required - Set by CF Pages CI
    productionBranch: process.env.CF_PAGES_PRODUCTION_BRANCH || 'main'
  };
}

module.exports = {
  validateEnv,
  getEnv
};
