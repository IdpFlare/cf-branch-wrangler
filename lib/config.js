/**
 * Environment variable validation and configuration
 */

const { execSync } = require('child_process');

function validateEnv() {
  // Validation moved to specific actions (e.g., Pages API patching)
}

/**
 * Attempts to detect the current branch from git when CI env vars aren't available.
 * Cloudflare Workers CI has a known bug where branch names aren't exposed to the
 * build environment, so we fall back to git as a last resort.
 * @returns {string|null} Branch name, or null if detection fails
 */
function detectBranchFromGit() {
  try {
    let branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();

    // If in detached HEAD state (common in CI), find the remote branch this commit belongs to
    if (branch === 'HEAD') {
      const branches = execSync('git branch -a --contains HEAD', { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
      const match = branches.match(/remotes\/origin\/([^\n\s]+)/);
      if (match) {
        branch = match[1].replace('HEAD', '').replace('->', '').trim();
      }
    }

    return (branch && branch !== 'HEAD') ? branch : null;
  } catch (e) {
    console.warn('cf-branch-wrangler: Failed to detect branch via git:', e.message);
    return null;
  }
}

/**
 * Returns validated configuration object from environment variables
 * Values are either set directly or can be derived later
 * @returns {Object} Configuration object with all required values
 */
function getEnv() {
  let branch = process.env.CF_PAGES_BRANCH ||
               process.env.WORKERS_CI_BRANCH ||
               process.env.CF_BRANCH ||
               process.env.GITHUB_HEAD_REF ||
               process.env.GITHUB_REF_NAME;

  // Cloudflare Workers CI has a known bug where branch names aren't always exposed.
  // Fall back to git detection if no CI variable is set.
  if (!branch) {
    branch = detectBranchFromGit();
  }

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
