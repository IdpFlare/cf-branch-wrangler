/**
 * Main orchestration logic for cf-branch-wrangler
 */

const { getEnv } = require('./config.js');
const { parseWranglerConfig, extractBindings } = require('./toml-parser.js');
const { isProductionBranch, getBranchSuffix } = require('./branch-sanitizer.js');
const { provisionAll } = require('./provisioner.js');
const { fetchAccountId, patchPreviewBindings } = require('./api-client.js');

/**
 * Main entry point for the CLI tool
 */
async function main() {
  console.log('cf-branch-wrangler: Starting infrastructure provisioning');

  // 1. Validate environment variables
  const config = getEnv();

  // 2. Parse wrangler config for bindings and derive project name if needed
  console.log('Parsing wrangler config');
  const { config: wranglerConfig, format: configFormat } = parseWranglerConfig();

  // Derive project name from config if not set
  if (!config.projectName) {
    if (wranglerConfig.name) {
      config.projectName = wranglerConfig.name;
      console.log(`  Project name derived from wrangler config: ${config.projectName}`);
    } else {
      throw new Error(
        'CF_PAGES_PROJECT_NAME not set and no "name" field found in wrangler config. ' +
        'Please set CF_PAGES_PROJECT_NAME environment variable.'
      );
    }
  }

  console.log(`  Branch: ${config.branch}`);
  console.log(`  Production branch: ${config.productionBranch}`);
  console.log(`  Project: ${config.projectName}`);

  const bindings = extractBindings(wranglerConfig);
  console.log(`  Found ${bindings.d1.length} D1 bindings`);
  console.log(`  Found ${bindings.r2.length} R2 bindings`);
  console.log(`  Found ${bindings.kv.length} KV bindings`);

  // 3. Check if this is the production branch
  if (isProductionBranch(config.branch, config.productionBranch)) {
    console.log('Production branch detected, skipping provisioning');
    console.log('cf-branch-wrangler: Complete (no action needed)');
    process.exit(0);
  }

  // 4. Generate branch suffix
  const suffix = getBranchSuffix(config.branch, config.productionBranch);
  console.log(`Branch suffix: "${suffix}"`);

  if (!suffix) {
    console.warn('Warning: Empty branch suffix generated, skipping provisioning');
    process.exit(0);
  }

  // 5. Provision all resources (D1, R2, KV)
  console.log('Provisioning branch-specific resources');
  const provisioned = provisionAll(bindings, suffix, configFormat);

  // Map binding names to provisioned resources for the API call
  const apiBindings = {
    d1: bindings.d1.map((b, i) => ({ ...provisioned.d1[i], binding: b.binding })),
    r2: bindings.r2.map((b, i) => ({ ...provisioned.r2[i], binding: b.binding })),
    kv: bindings.kv.map((b, i) => ({ ...provisioned.kv[i], binding: b.binding }))
  };

  // 6. Derive account ID if not set, then patch Pages Project preview bindings
  if (!config.accountId) {
    console.log('Deriving account ID from API token');
    config.accountId = await fetchAccountId(config.apiToken);
    console.log(`  Account ID: ${config.accountId}`);
  }

  await patchPreviewBindings(
    config.accountId,
    config.projectName,
    config.apiToken,
    apiBindings
  );

  console.log('cf-branch-wrangler: Complete');
}

module.exports = { main };
