/**
 * Environment variable validation and configuration
 */

// Only API token is truly required since we derive the rest
const REQUIRED_ENV_VARS = ['CLOUDFLARE_API_TOKEN'];

function validateEnv() {
  // Validation moved to specific actions (e.g., Pages API patching)
}

/**
 * Returns validated configuration object from environment variables
 * Values are either set directly or can be derived later
 * @returns {Object} Configuration object with all required values
 */
function getEnv() {
  const branch = process.env.CF_PAGES_BRANCH || 
                 process.env.WORKERS_CI_BRANCH ||
                 process.env.CF_BRANCH || 
                 process.env.GITHUB_HEAD_REF || 
                 process.env.GITHUB_REF_NAME;

  return {
    apiToken: process.env.CLOUDFLARE_API_TOKEN ? process.env.CLOUDFLARE_API_TOKEN.trim() : null,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID, // Optional - Wrangler derives it
    projectName: process.env.CF_PAGES_PROJECT_NAME, // Optional - Derived from wrangler.toml
    branch: branch,
    productionBranch: process.env.CF_PAGES_PRODUCTION_BRANCH || process.env.CF_PRODUCTION_BRANCH || 'main'
  };
}

module.exports = {
  validateEnv,
  getEnv
};
