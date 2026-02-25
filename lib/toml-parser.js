/**
 * wrangler.toml parser and binding extractor
 */

const fs = require('fs');
const toml = require('@iarna/toml');

/**
 * Reads and parses wrangler.toml file
 * @param {string} tomlPath - Path to wrangler.toml file
 * @returns {Object} Parsed TOML content
 * @throws {Error} If file doesn't exist or cannot be parsed
 */
function parseWranglerToml(tomlPath = 'wrangler.toml') {
  if (!fs.existsSync(tomlPath)) {
    throw new Error(`wrangler.toml not found at ${tomlPath}`);
  }

  const content = fs.readFileSync(tomlPath, 'utf-8');
  return toml.parse(content);
}

/**
 * Extracts D1, R2, and KV bindings from parsed TOML
 * @param {Object} toml - Parsed wrangler.toml content
 * @returns {Object} Object with d1, r2, and kv binding arrays
 */
function extractBindings(toml) {
  const bindings = {
    d1: [],
    r2: [],
    kv: []
  };

  // Extract D1 bindings (array format: [[d1_databases]])
  if (toml.d1_databases) {
    for (const config of toml.d1_databases) {
      bindings.d1.push({
        binding: config.binding,
        name: config.database_name || config.database_id
      });
    }
  }

  // Extract R2 bindings (array format: [[r2_buckets]])
  if (toml.r2_buckets) {
    for (const config of toml.r2_buckets) {
      bindings.r2.push({
        binding: config.binding,
        name: config.bucket_name
      });
    }
  }

  // Extract KV bindings (array format: [[kv_namespaces]])
  if (toml.kv_namespaces) {
    for (const config of toml.kv_namespaces) {
      bindings.kv.push({
        binding: config.binding,
        id: config.id
      });
    }
  }

  return bindings;
}

module.exports = {
  parseWranglerToml,
  extractBindings
};
