/**
 * Branch name sanitization for Cloudflare resource naming
 */

const DEFAULT_PRODUCTION_BRANCH = 'main';

/**
 * Sanitizes a branch name to be safe for Cloudflare resource names
 * Rules:
 * - Convert to lowercase
 * - Replace invalid chars with hyphens
 * - Max 63 characters
 * - No consecutive hyphens
 * - No leading/trailing hyphens
 * @param {string} branch - The branch name to sanitize
 * @returns {string} Sanitized branch name
 */
function sanitizeBranchName(branch) {
  // Convert to lowercase
  let sanitized = branch.toLowerCase();

  // Replace any character that's not alphanumeric or hyphen with a hyphen
  sanitized = sanitized.replace(/[^a-z0-9-]/g, '-');

  // Replace consecutive hyphens with a single hyphen
  sanitized = sanitized.replace(/-+/g, '-');

  // Strip leading hyphens
  sanitized = sanitized.replace(/^-+/, '');

  // Strip trailing hyphens
  sanitized = sanitized.replace(/-+$/, '');

  // Limit to 63 characters
  if (sanitized.length > 63) {
    sanitized = sanitized.substring(0, 63);
  }

  // Ensure we didn't end up with trailing hyphen after truncation
  sanitized = sanitized.replace(/-+$/, '');

  return sanitized;
}

/**
 * Returns the branch suffix for resource naming
 * Returns empty string for production branch (no suffix needed)
 * @param {string} branch - The current branch name
 * @param {string} productionBranch - The production branch name
 * @returns {string} Suffix like "-feature-branch" or empty string
 */
function getBranchSuffix(branch, productionBranch = DEFAULT_PRODUCTION_BRANCH) {
  if (branch === productionBranch) {
    return '';
  }

  const sanitized = sanitizeBranchName(branch);
  return sanitized ? `-${sanitized}` : '';
}

/**
 * Checks if a branch is the production branch
 * @param {string} branch - The current branch name
 * @param {string} productionBranch - The production branch name
 * @returns {boolean} True if this is the production branch
 */
function isProductionBranch(branch, productionBranch = DEFAULT_PRODUCTION_BRANCH) {
  return branch === productionBranch;
}

module.exports = {
  sanitizeBranchName,
  getBranchSuffix,
  isProductionBranch,
  DEFAULT_PRODUCTION_BRANCH
};
