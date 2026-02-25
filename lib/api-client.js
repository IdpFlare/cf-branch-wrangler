/**
 * Cloudflare API client for updating Pages Project bindings
 */

/**
 * Derives the Cloudflare Account ID from the API token
 * @param {string} apiToken - Cloudflare API bearer token
 * @returns {Promise<string>} Account ID
 */
async function fetchAccountId(apiToken) {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=1', {
    headers: { 'Authorization': `Bearer ${apiToken}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch account ID: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.result || data.result.length === 0) {
    throw new Error('No accounts found for the provided API token');
  }

  return data.result[0].id;
}

/**
 * Patches the preview deployment configuration for a Pages Project
 * @param {string} accountId - Cloudflare Account ID
 * @param {string} projectName - Pages Project name
 * @param {string} apiToken - Cloudflare API bearer token
 * @param {Object} bindings - Provisioned resources with d1, r2, kv arrays
 * @returns {Promise<Object>} API response
 */
async function patchPreviewBindings(accountId, projectName, apiToken, bindings) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;

  // Build deployment configs payload
  // Cloudflare API expects bindings as objects keyed by binding name, not arrays
  const d1Map = {};
  for (const db of bindings.d1) {
    d1Map[db.binding] = { id: db.id };
  }

  const r2Map = {};
  for (const bucket of bindings.r2) {
    r2Map[bucket.binding] = { name: bucket.name };
  }

  const kvMap = {};
  for (const ns of bindings.kv) {
    kvMap[ns.binding] = { namespace_id: ns.id };
  }

  const deploymentConfigs = {
    preview: {
      d1_databases: d1Map,
      r2_buckets: r2Map,
      kv_namespaces: kvMap
    }
  };

  console.log(`Updating preview bindings for Pages Project: ${projectName}`);
  console.log(`  D1 databases: ${Object.keys(d1Map).length}`);
  console.log(`  R2 buckets: ${Object.keys(r2Map).length}`);
  console.log(`  KV namespaces: ${Object.keys(kvMap).length}`);

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deployment_configs: deploymentConfigs
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`API request failed: ${response.status} ${response.statusText}`);
      console.error(`Response body: ${errorBody}`);
      throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Successfully updated preview bindings');
    return data;

  } catch (error) {
    console.error('Failed to patch preview bindings:', error.message);
    throw error;
  }
}

module.exports = {
  fetchAccountId,
  patchPreviewBindings
};
