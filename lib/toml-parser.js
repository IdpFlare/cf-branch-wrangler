/**
 * Wrangler config parser - supports both wrangler.toml and wrangler.jsonc
 */

const fs = require('fs');
const path = require('path');
const toml = require('@iarna/toml');

/**
 * Strips JSON comments (// and /* ... *​/) and trailing commas for JSONC parsing
 * @param {string} text - JSONC content
 * @returns {string} Clean JSON string
 */
function stripJsonc(text) {
  // Remove single-line comments
  let result = text.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove trailing commas before } or ]
  result = result.replace(/,\s*([\]}])/g, '$1');
  return result;
}

/**
 * Detects and reads the wrangler config file (toml or jsonc)
 * @param {string} [dir] - Directory to search in (defaults to cwd)
 * @returns {{ config: Object, format: 'toml'|'jsonc' }} Parsed config and detected format
 * @throws {Error} If no config file is found or cannot be parsed
 */
function parseWranglerConfig(dir) {
  const searchDir = dir || process.cwd();

  // Check for wrangler.jsonc first (newer format), then wrangler.toml
  const jsoncPath = path.join(searchDir, 'wrangler.jsonc');
  const tomlPath = path.join(searchDir, 'wrangler.toml');

  if (fs.existsSync(jsoncPath)) {
    const content = fs.readFileSync(jsoncPath, 'utf-8');
    const config = JSON.parse(stripJsonc(content));
    return { config, format: 'jsonc' };
  }

  if (fs.existsSync(tomlPath)) {
    const content = fs.readFileSync(tomlPath, 'utf-8');
    const config = toml.parse(content);
    return { config, format: 'toml' };
  }

  throw new Error(
    'No wrangler config found. Expected wrangler.toml or wrangler.jsonc in project root.'
  );
}

// Keep backward compat
function parseWranglerToml(tomlPath = 'wrangler.toml') {
  if (!fs.existsSync(tomlPath)) {
    throw new Error(`wrangler.toml not found at ${tomlPath}`);
  }
  const content = fs.readFileSync(tomlPath, 'utf-8');
  return toml.parse(content);
}

/**
 * Extracts D1, R2, and KV bindings from parsed wrangler config
 * @param {Object} config - Parsed wrangler config (toml or jsonc)
 * @returns {Object} Object with d1, r2, and kv binding arrays
 */
function extractBindings(config) {
  const bindings = {
    d1: [],
    r2: [],
    kv: []
  };

  // Extract D1 bindings
  if (config.d1_databases) {
    for (const entry of config.d1_databases) {
      bindings.d1.push({
        binding: entry.binding,
        name: entry.database_name || entry.database_id
      });
    }
  }

  // Extract R2 bindings
  if (config.r2_buckets) {
    for (const entry of config.r2_buckets) {
      bindings.r2.push({
        binding: entry.binding,
        name: entry.bucket_name
      });
    }
  }

  // Extract KV bindings
  if (config.kv_namespaces) {
    for (const entry of config.kv_namespaces) {
      bindings.kv.push({
        binding: entry.binding,
        id: entry.id
      });
    }
  }

  return bindings;
}

module.exports = {
  parseWranglerConfig,
  parseWranglerToml,
  extractBindings
};
