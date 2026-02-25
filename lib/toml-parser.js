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
 * Detects and reads the wrangler config file (toml, json, or jsonc)
 * @param {string} [dir] - Directory to search in (defaults to cwd)
 * @returns {{ config: Object, format: 'toml'|'jsonc', configPath: string }} Parsed config, format, and file path
 * @throws {Error} If no config file is found or cannot be parsed
 */
function parseWranglerConfig(dir) {
  const searchDir = dir || process.cwd();

  // Check in order: wrangler.jsonc, wrangler.json, wrangler.toml
  const candidates = [
    { file: 'wrangler.jsonc', format: 'jsonc' },
    { file: 'wrangler.json', format: 'jsonc' },
    { file: 'wrangler.toml', format: 'toml' }
  ];

  for (const { file, format } of candidates) {
    const configPath = path.join(searchDir, file);
    if (!fs.existsSync(configPath)) continue;

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = format === 'jsonc'
      ? JSON.parse(stripJsonc(content))
      : toml.parse(content);

    return { config, format, configPath };
  }

  throw new Error(
    'No wrangler config found. Expected wrangler.toml, wrangler.json, or wrangler.jsonc in project root.'
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

/**
 * Rewrites the wrangler config file with branch-specific resource bindings.
 * This ensures the Pages build picks up the correct branch resources instead of production ones.
 * @param {Object} provisioned - Provisioned resources { d1: [{id, name}], r2: [{name}], kv: [{id}] }
 * @param {Object} bindings - Original bindings from the config
 * @param {string} format - Config format: 'toml' or 'jsonc'
 * @param {string} configPath - Path to the wrangler config file
 */
function rewriteConfigBindings(provisioned, bindings, format, configPath) {
  const content = fs.readFileSync(configPath, 'utf-8');

  if (format === 'jsonc') {
    const config = JSON.parse(stripJsonc(content));

    // Update D1
    if (config.d1_databases) {
      for (let i = 0; i < config.d1_databases.length; i++) {
        if (provisioned.d1[i]) {
          config.d1_databases[i].database_name = provisioned.d1[i].name;
          config.d1_databases[i].database_id = provisioned.d1[i].id;
        }
      }
    }

    // Update R2
    if (config.r2_buckets) {
      for (let i = 0; i < config.r2_buckets.length; i++) {
        if (provisioned.r2[i]) {
          config.r2_buckets[i].bucket_name = provisioned.r2[i].name;
        }
      }
    }

    // Update KV
    if (config.kv_namespaces) {
      for (let i = 0; i < config.kv_namespaces.length; i++) {
        if (provisioned.kv[i]) {
          config.kv_namespaces[i].id = provisioned.kv[i].id;
        }
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } else {
    // TOML - parse, modify, stringify
    const config = toml.parse(content);

    if (config.d1_databases) {
      for (let i = 0; i < config.d1_databases.length; i++) {
        if (provisioned.d1[i]) {
          config.d1_databases[i].database_name = provisioned.d1[i].name;
          config.d1_databases[i].database_id = provisioned.d1[i].id;
        }
      }
    }

    if (config.r2_buckets) {
      for (let i = 0; i < config.r2_buckets.length; i++) {
        if (provisioned.r2[i]) {
          config.r2_buckets[i].bucket_name = provisioned.r2[i].name;
        }
      }
    }

    if (config.kv_namespaces) {
      for (let i = 0; i < config.kv_namespaces.length; i++) {
        if (provisioned.kv[i]) {
          config.kv_namespaces[i].id = provisioned.kv[i].id;
        }
      }
    }

    fs.writeFileSync(configPath, toml.stringify(config));
  }

  console.log(`Updated ${path.basename(configPath)} with branch-specific bindings`);
}

module.exports = {
  parseWranglerConfig,
  parseWranglerToml,
  extractBindings,
  rewriteConfigBindings
};
