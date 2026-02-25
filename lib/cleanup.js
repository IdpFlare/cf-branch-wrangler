/**
 * Cleanup logic for removing branch-specific resources
 */

const { execSync } = require('child_process');
const readline = require('readline');
const { parseWranglerConfig, extractBindings } = require('./toml-parser.js');
const { sanitizeBranchName } = require('./branch-sanitizer.js');

/**
 * Prompts the user for yes/no confirmation
 * @param {string} question - The question to ask
 * @returns {Promise<boolean>} True if user confirms
 */
function confirm(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${question} (y/N) `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

/**
 * Lists all D1 databases in the account
 * @returns {Array} Array of { name, uuid } objects
 */
function listD1Databases() {
    try {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const cmd = accountId
            ? `npx wrangler d1 list --accountId=${accountId} --json`
            : 'npx wrangler d1 list --json';
        const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        return JSON.parse(output);
    } catch (_) {
        return [];
    }
}

/**
 * Lists all R2 buckets in the account
 * @returns {Array} Array of bucket objects with name property
 */
function listR2Buckets() {
    try {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const cmd = accountId
            ? `npx wrangler r2 bucket list --accountId=${accountId} --json`
            : 'npx wrangler r2 bucket list --json';
        const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        return JSON.parse(output);
    } catch (_) {
        return [];
    }
}

/**
 * Lists all KV namespaces in the account
 * @returns {Array} Array of namespace objects with id/title properties
 */
function listKVNamespaces() {
    try {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const cmd = accountId
            ? `npx wrangler kv namespace list --accountId=${accountId} --json`
            : 'npx wrangler kv namespace list --json';
        const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        return JSON.parse(output);
    } catch (_) {
        return [];
    }
}

/**
 * Finds branch-suffixed resources that match the base names from wrangler config
 * @param {Object} bindings - Parsed bindings from wrangler config
 * @param {string|null} branchFilter - Optional specific branch to filter by
 * @returns {Object} Resources to delete: { d1: [], r2: [], kv: [] }
 */
function findBranchResources(bindings, branchFilter) {
    const suffix = branchFilter ? `-${sanitizeBranchName(branchFilter)}` : null;
    const toDelete = { d1: [], r2: [], kv: [] };

    // Find D1 databases
    const baseDbNames = bindings.d1.map(b => b.name);
    const allDatabases = listD1Databases();

    for (const db of allDatabases) {
        for (const baseName of baseDbNames) {
            // Must start with base name + hyphen (branch suffix), but not be the base name itself
            if (db.name === baseName) continue;
            if (!db.name.startsWith(`${baseName}-`)) continue;

            if (suffix && db.name !== `${baseName}${suffix}`) continue;
            toDelete.d1.push({ name: db.name, id: db.uuid });
        }
    }

    // Find R2 buckets
    const baseBucketNames = bindings.r2.map(b => b.name);
    const allBuckets = listR2Buckets();

    for (const bucket of allBuckets) {
        for (const baseName of baseBucketNames) {
            if (bucket.name === baseName) continue;
            if (!bucket.name.startsWith(`${baseName}-`)) continue;

            if (suffix && bucket.name !== `${baseName}${suffix}`) continue;
            toDelete.r2.push({ name: bucket.name });
        }
    }

    // Find KV namespaces
    const baseKvIds = bindings.kv.map(b => b.id);
    const allNamespaces = listKVNamespaces();

    for (const ns of allNamespaces) {
        for (const baseId of baseKvIds) {
            if (ns.title === baseId) continue;
            if (!ns.title.startsWith(`${baseId}-`)) continue;

            if (suffix && ns.title !== `${baseId}${suffix}`) continue;
            toDelete.kv.push({ id: ns.id, title: ns.title });
        }
    }

    return toDelete;
}

/**
 * Deletes a D1 database
 * @param {string} name - Database name
 */
function deleteD1(name) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cmd = accountId
        ? `npx wrangler d1 delete ${name} --accountId=${accountId} -y`
        : `npx wrangler d1 delete ${name} -y`;
    execSync(cmd, { stdio: 'inherit' });
}

/**
 * Deletes an R2 bucket
 * @param {string} name - Bucket name
 */
function deleteR2(name) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cmd = accountId
        ? `npx wrangler r2 bucket delete ${name} --accountId=${accountId}`
        : `npx wrangler r2 bucket delete ${name}`;
    execSync(cmd, { stdio: 'inherit' });
}

/**
 * Deletes a KV namespace
 * @param {string} id - Namespace ID
 */
function deleteKV(id) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cmd = accountId
        ? `npx wrangler kv namespace delete --namespace-id=${id} --accountId=${accountId}`
        : `npx wrangler kv namespace delete --namespace-id=${id}`;
    execSync(cmd, { stdio: 'inherit' });
}

/**
 * Main cleanup entry point
 * @param {Object} options - Cleanup options
 * @param {boolean} options.autoConfirm - Skip interactive prompts
 * @param {string|null} options.branch - Optional branch filter
 */
async function cleanup(options = {}) {
    const { autoConfirm = false, branch = null } = options;

    console.log('cf-branch-wrangler: Starting cleanup');

    // Parse wrangler config for base resource names
    // No API token needed - all operations go via wrangler CLI which uses its own auth
    console.log('Parsing wrangler config');
    const { config: wranglerConfig } = parseWranglerConfig();
    const bindings = extractBindings(wranglerConfig);

    // Discover branch-specific resources
    const filterLabel = branch ? ` for branch "${branch}"` : '';
    console.log(`\nSearching for branch-specific resources${filterLabel}...`);
    const resources = findBranchResources(bindings, branch);

    const totalCount = resources.d1.length + resources.r2.length + resources.kv.length;
    if (totalCount === 0) {
        console.log('No branch-specific resources found. Nothing to clean up.');
        return;
    }

    // Print summary
    console.log(`\nFound ${totalCount} branch-specific resource(s):\n`);

    if (resources.d1.length > 0) {
        console.log('  D1 Databases:');
        for (const db of resources.d1) {
            console.log(`    - ${db.name} (${db.id})`);
        }
    }
    if (resources.r2.length > 0) {
        console.log('  R2 Buckets:');
        for (const bucket of resources.r2) {
            console.log(`    - ${bucket.name}`);
        }
    }
    if (resources.kv.length > 0) {
        console.log('  KV Namespaces:');
        for (const ns of resources.kv) {
            console.log(`    - ${ns.title} (${ns.id})`);
        }
    }

    console.log('');

    let deletedCount = 0;
    let skippedCount = 0;

    // Delete D1 databases
    for (const db of resources.d1) {
        if (!autoConfirm) {
            const ok = await confirm(`Delete D1 database "${db.name}"?`);
            if (!ok) {
                console.log(`  Skipped ${db.name}`);
                skippedCount++;
                continue;
            }
        }
        try {
            console.log(`  Deleting D1 database: ${db.name}`);
            deleteD1(db.name);
            deletedCount++;
        } catch (error) {
            console.error(`  Failed to delete D1 database ${db.name}: ${error.message}`);
        }
    }

    // Delete R2 buckets
    for (const bucket of resources.r2) {
        if (!autoConfirm) {
            const ok = await confirm(`Delete R2 bucket "${bucket.name}"?`);
            if (!ok) {
                console.log(`  Skipped ${bucket.name}`);
                skippedCount++;
                continue;
            }
        }
        try {
            console.log(`  Deleting R2 bucket: ${bucket.name}`);
            deleteR2(bucket.name);
            deletedCount++;
        } catch (error) {
            console.error(`  Failed to delete R2 bucket ${bucket.name}: ${error.message}`);
        }
    }

    // Delete KV namespaces
    for (const ns of resources.kv) {
        if (!autoConfirm) {
            const ok = await confirm(`Delete KV namespace "${ns.title}"?`);
            if (!ok) {
                console.log(`  Skipped ${ns.title}`);
                skippedCount++;
                continue;
            }
        }
        try {
            console.log(`  Deleting KV namespace: ${ns.title}`);
            deleteKV(ns.id);
            deletedCount++;
        } catch (error) {
            console.error(`  Failed to delete KV namespace ${ns.title}: ${error.message}`);
        }
    }

    console.log(`\ncf-branch-wrangler cleanup: Done (${deletedCount} deleted, ${skippedCount} skipped)`);
}

module.exports = { cleanup };
