/**
 * Resource provisioning via Wrangler CLI
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Parses a database ID from wrangler d1 create output
 * Matches: database_id = "uuid-here"
 * @param {string} output - Command output text
 * @returns {string|null} Database ID if found
 */
function parseD1CreateOutput(output) {
  const match = output.match(/database_id\s*=\s*"([a-f0-9-]+)"/);
  return match ? match[1] : null;
}

/**
 * Finds a D1 database by name using the Cloudflare API via wrangler
 * @param {string} name - Database name to find
 * @returns {string|null} Database ID if found, null otherwise
 */
function findD1Database(name) {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const baseCmd = accountId
      ? `npx wrangler d1 list --accountId=${accountId}`
      : 'npx wrangler d1 list';

    // Try JSON output first (wrangler 3.x+)
    try {
      const jsonOut = execSync(`${baseCmd} --json`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const databases = JSON.parse(jsonOut);
      const found = databases.find(db => db.name === name);
      if (found) return found.uuid;
    } catch (_) {
      // --json flag might not be supported, fall through to text parsing
    }

    // Fallback: parse text output
    const output = execSync(baseCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    // Try various wrangler output formats
    for (const line of output.split('\n')) {
      // Table format: │ uuid │ name │ ...
      if (line.includes(name)) {
        const uuidMatch = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
        if (uuidMatch) return uuidMatch[1];
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Finds an R2 bucket by name in the wrangler list output
 * @param {string} name - Bucket name to find
 * @returns {boolean} True if bucket exists
 */
function findR2Bucket(name) {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cmd = accountId
      ? `npx wrangler r2 bucket list --accountId=${accountId}`
      : 'npx wrangler r2 bucket list';
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output.includes(name);
  } catch (error) {
    return false;
  }
}

/**
 * Finds a KV namespace by title (name) in the wrangler list output
 * @param {string} name - Namespace name to find
 * @returns {string|null} Namespace ID if found, null otherwise
 */
function findKVNamespace(name) {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const baseCmd = accountId
      ? `npx wrangler kv namespace list --accountId=${accountId}`
      : 'npx wrangler kv namespace list';

    // Try JSON output first
    try {
      const jsonOut = execSync(`${baseCmd} --json`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const namespaces = JSON.parse(jsonOut);
      const found = namespaces.find(ns => ns.title === name);
      if (found) return found.id;
    } catch (_) {
      // Fall through to text parsing
    }

    const output = execSync(baseCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    for (const line of output.split('\n')) {
      if (line.includes(name)) {
        const uuidMatch = line.match(/([a-f0-9]{32})/);
        if (uuidMatch) return uuidMatch[1];
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Provisions a D1 database for a branch
 * @param {Object} binding - D1 binding configuration
 * @param {string} suffix - Branch suffix (e.g., "-feature-branch")
 * @param {string} configFormat - Config format: 'toml' or 'jsonc'
 * @returns {Object} Database info with id and name
 */
function provisionD1(binding, suffix, configFormat) {
  const dbName = `${binding.name}${suffix}`;
  console.log(`Provisioning D1 database: ${dbName}`);

  // Check if database already exists
  let dbId = findD1Database(dbName);

  if (!dbId) {
    console.log(`  Creating new D1 database: ${dbName}`);
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cmd = accountId
      ? `npx wrangler d1 create ${dbName} --accountId=${accountId}`
      : `npx wrangler d1 create ${dbName}`;

    // Capture create output so we can parse the database_id from it
    const output = execSync(cmd, { encoding: 'utf-8' });
    console.log(output);

    dbId = parseD1CreateOutput(output);

    // If we couldn't parse it from the create output, try listing
    if (!dbId) {
      dbId = findD1Database(dbName);
    }

    if (!dbId) {
      console.error(`  Failed to retrieve database ID for ${dbName}`);
      process.exit(1);
    }
    console.log(`  Created D1 database: ${dbName} (${dbId})`);
  } else {
    console.log(`  D1 database already exists: ${dbName} (${dbId})`);
  }

  // Generate a temp wrangler config so migrations/seed can resolve the DB by name.
  // wrangler d1 migrations apply doesn't support --database-id, it needs a config lookup.
  const isJsonc = configFormat === 'jsonc';
  const tmpConfigName = isJsonc ? '.branch-wrangler.jsonc' : '.branch-wrangler.toml';
  const tmpConfig = path.join(process.cwd(), tmpConfigName);
  const needsTmpConfig = fs.existsSync(path.join(process.cwd(), 'migrations')) ||
    fs.existsSync(path.join(process.cwd(), 'seed.sql'));

  if (needsTmpConfig) {
    const content = isJsonc
      ? JSON.stringify({ d1_databases: [{ binding: binding.binding, database_name: dbName, database_id: dbId }] }, null, 2)
      : `[[d1_databases]]\nbinding = "${binding.binding}"\ndatabase_name = "${dbName}"\ndatabase_id = "${dbId}"\n`;
    fs.writeFileSync(tmpConfig, content);
  }

  try {
    // Run migrations if they exist
    const migrationsDir = path.join(process.cwd(), 'migrations');
    if (fs.existsSync(migrationsDir)) {
      console.log(`  Running migrations for ${dbName}`);
      try {
        execSync(`npx wrangler d1 migrations apply ${dbName} --remote --config=${tmpConfig}`, {
          stdio: 'inherit'
        });
      } catch (error) {
        console.error(`  Migration failed for ${dbName}`);
        process.exit(1);
      }
    }

    // Run seed.sql if present
    const seedFile = path.join(process.cwd(), 'seed.sql');
    if (fs.existsSync(seedFile)) {
      console.log(`  Running seed.sql for ${dbName}`);
      try {
        execSync(`npx wrangler d1 execute ${dbName} --remote --file=${seedFile} --config=${tmpConfig}`, {
          stdio: 'inherit'
        });
      } catch (error) {
        console.error(`  Seed failed for ${dbName}`);
        process.exit(1);
      }
    }
  } finally {
    // Clean up temp config
    if (needsTmpConfig && fs.existsSync(tmpConfig)) {
      fs.unlinkSync(tmpConfig);
    }
  }

  return { id: dbId, name: dbName };
}

/**
 * Provisions an R2 bucket for a branch
 * @param {Object} binding - R2 binding configuration
 * @param {string} suffix - Branch suffix (e.g., "-feature-branch")
 * @returns {Object} Bucket info with name
 */
function provisionR2(binding, suffix) {
  const bucketName = `${binding.name}${suffix}`;
  console.log(`Provisioning R2 bucket: ${bucketName}`);

  // Check if bucket exists
  const exists = findR2Bucket(bucketName);

  if (!exists) {
    console.log(`  Creating new R2 bucket: ${bucketName}`);
    try {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const cmd = accountId
        ? `npx wrangler r2 bucket create ${bucketName} --accountId=${accountId}`
        : `npx wrangler r2 bucket create ${bucketName}`;
      execSync(cmd, { stdio: 'inherit' });
    } catch (error) {
      console.error(`  Failed to create R2 bucket: ${bucketName}`);
      process.exit(1);
    }
  } else {
    console.log(`  R2 bucket already exists: ${bucketName}`);
  }

  return { name: bucketName };
}

/**
 * Provisions a KV namespace for a branch
 * @param {Object} binding - KV binding configuration
 * @param {string} suffix - Branch suffix (e.g., "-feature-branch")
 * @returns {Object} Namespace info with id
 */
function provisionKV(binding, suffix) {
  const namespaceName = `${binding.id}${suffix}`;
  console.log(`Provisioning KV namespace: ${namespaceName}`);

  // Check if namespace exists
  let namespaceId = findKVNamespace(namespaceName);

  if (!namespaceId) {
    console.log(`  Creating new KV namespace: ${namespaceName}`);
    try {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const cmd = accountId
        ? `npx wrangler kv namespace create ${namespaceName} --accountId=${accountId}`
        : `npx wrangler kv namespace create ${namespaceName}`;
      const output = execSync(cmd, {
        stdio: 'pipe',
        encoding: 'utf-8'
      });
      // Extract ID from output: "namespace created with id=\"abc123\""
      const match = output.match(/id="([a-f0-9]+)"/);
      if (match) {
        namespaceId = match[1];
      }
    } catch (error) {
      console.error(`  Failed to create KV namespace: ${namespaceName}`);
      process.exit(1);
    }

    if (!namespaceId) {
      console.error(`  Failed to retrieve namespace ID for ${namespaceName}`);
      process.exit(1);
    }
  } else {
    console.log(`  KV namespace already exists: ${namespaceName} (${namespaceId})`);
  }

  return { id: namespaceId };
}

/**
 * Provisions all resources (D1, R2, KV) for a branch
 * @param {Object} bindings - Object with d1, r2, kv binding arrays
 * @param {string} suffix - Branch suffix (e.g., "-feature-branch")
 * @param {string} configFormat - Config format: 'toml' or 'jsonc'
 * @returns {Object} Provisioned resources with d1, r2, kv arrays
 */
function provisionAll(bindings, suffix, configFormat) {
  const result = {
    d1: [],
    r2: [],
    kv: []
  };

  // Provision D1 databases
  for (const binding of bindings.d1) {
    result.d1.push(provisionD1(binding, suffix, configFormat));
  }

  // Provision R2 buckets
  for (const binding of bindings.r2) {
    result.r2.push(provisionR2(binding, suffix));
  }

  // Provision KV namespaces
  for (const binding of bindings.kv) {
    result.kv.push(provisionKV(binding, suffix));
  }

  return result;
}

module.exports = {
  provisionD1,
  provisionR2,
  provisionKV,
  provisionAll
};
