# cf-branch-wrangler

Automated infrastructure provisioning for Cloudflare Pages and Workers branch deployments.

## Overview

Solves the "Binding Gap" problem for Cloudflare deployments. When deploying preview branches via CI/CD, each branch needs isolated D1 databases, R2 buckets, and KV namespaces. This tool provisions these resources dynamically and:
- **For Pages**: Patches the Pages Project preview deployment bindings via the Cloudflare API.
- **For Workers**: Rewrites `wrangler.toml` with the new bindings so they are applied on `wrangler deploy`.

## Installation

```bash
npm install -D cf-branch-wrangler
```

### For Cloudflare Pages

Then add it as a prebuild step in your `package.json`:

```json
{
  "scripts": {
    "prebuild": "cf-branch-wrangler",
    "build": "your-build-command"
  }
}
```

Cloudflare Pages will run `prebuild` automatically before `build`, provisioning branch-specific resources in CI.

### For Cloudflare Workers Builds (Git Integration)

If you have connected your Git repository directly to a Worker via the Cloudflare dashboard:

1. Add `cf-branch-wrangler` as a prebuild step in your `package.json`:
   ```json
   {
     "scripts": {
       "prebuild": "cf-branch-wrangler",
       "build": "your-build-command"
     }
   }
   ```
2. Cloudflare's build system will run `prebuild` before deploying. The tool automatically detects the `WORKERS_CI_BRANCH` environment variable and rewrites your `wrangler.toml` with branch-specific resources so that the deployment picks them up.

### For External CI (GitHub Actions, GitLab, etc.)

Run the tool before your `wrangler deploy` step:

```yaml
- name: Provision Branch Infrastructure
  run: npx cf-branch-wrangler
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    # GitHub Actions sets GITHUB_REF_NAME automatically!

- name: Deploy to Cloudflare Workers
  run: npx wrangler deploy --env ${{ github.ref_name }}
```

## Usage

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Bearer token for Cloudflare API requests (Required for Pages projects. For Workers, Wrangler uses this or `WRANGLER_AUTH_TOKEN` implicitly) |
| `CF_PAGES_BRANCH` / `WORKERS_CI_BRANCH` | Current branch (auto-set by Cloudflare Pages/Workers CI) |
| `CF_BRANCH` / `GITHUB_HEAD_REF` / `GITHUB_REF_NAME` | Alternative branch variables. If Cloudflare CI variables are missing, the tool falls back to these. |

> **Note (Pages):** The `CLOUDFLARE_API_TOKEN` must be added under **Settings → Environment variables → Preview** (not Production). The tool only runs for non-production branches, so Production doesn't need it.

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Auto-derived from Wrangler auth (no need to set) |
| `CF_PAGES_PROJECT_NAME` | Auto-derived from wrangler config `name` field |
| `CF_PAGES_PRODUCTION_BRANCH` | Production branch name (default: `main`) |
| `CF_PRODUCTION_BRANCH` | Fallback for production branch name (default: `main`) |

### Running Manually

```bash
npx cf-branch-wrangler
```

The tool will:
1. Parse your wrangler config (`wrangler.toml` or `wrangler.jsonc`) to discover D1, R2, and KV bindings
2. Skip provisioning if running on the production branch
3. Create branch-specific resources (e.g., `my-db-feature-branch`)
4. Run D1 migrations if `migrations/` directory exists
5. Execute `seed.sql` if present
6. Update `wrangler.toml` dynamically with the newly provisioned resource IDs
7. For Pages projects only: Update the Pages Project's preview deployment bindings via Cloudflare API

## Configuration Format

Both `wrangler.toml` and `wrangler.jsonc` are supported. The tool auto-detects which format your project uses (preferring `wrangler.jsonc` if both exist).

### wrangler.toml

```toml
# D1 Databases
[[d1_databases]]
binding = "DB"
database_name = "my-app-db"

# R2 Buckets
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-app-bucket"

# KV Namespaces
[[kv_namespaces]]
binding = "CACHE"
id = "my-app-cache"
```

### wrangler.jsonc

```jsonc
{
  "name": "my-app",
  "d1_databases": [
    { "binding": "DB", "database_name": "my-app-db" }
  ],
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "my-app-bucket" }
  ],
  "kv_namespaces": [
    { "binding": "CACHE", "id": "my-app-cache" }
  ]
}
```

## How It Works

1. **Resource Discovery**: Reads your wrangler config (`wrangler.toml` or `wrangler.jsonc`) to find all bindings
2. **Branch Detection**: Checks branch environment variables against the production branch
3. **Name Sanitization**: Converts branch names to safe Cloudflare resource names
   - Lowercase, alphanumeric + hyphens only
   - Max 63 characters
4. **Provisioning**: Uses `wrangler` CLI to create resources if they don't exist
5. **Config Update**: Rewrites your local wrangler config with branch-specific IDs so subsequent commands use them
6. **Binding Update (Pages Only)**: Patches Pages Project preview bindings via Cloudflare API

## Idempotency

The tool is safe to run multiple times on the same branch:
- Checks for existing resources before creating
- Reuses existing databases, buckets, and namespaces
- Only updates bindings when resources change

## Cleanup

Remove branch-specific resources that are no longer needed:

```bash
npx cf-branch-wrangler cleanup
```

This scans your Cloudflare account for resources matching the naming pattern from your wrangler config (e.g., `my-db-feature-branch`) and prompts before deleting each one.

### Flags

| Flag | Description |
|------|-------------|
| `--confirm` | Skip interactive prompts, delete all matching resources |
| `--branch <name>` | Only clean up resources for a specific branch |

### Examples

```bash
# Interactive cleanup - prompts before each deletion
npx cf-branch-wrangler cleanup

# Clean up a specific branch
npx cf-branch-wrangler cleanup --branch feature-xyz

# Non-interactive, delete everything (for CI/scripts)
npx cf-branch-wrangler cleanup --confirm
```

## License

MIT
