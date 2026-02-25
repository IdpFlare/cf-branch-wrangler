# cf-branch-wrangler

Automated infrastructure provisioning for Cloudflare Pages branch deployments.

## Overview

Solves the "Binding Gap" problem for Cloudflare Pages. When deploying preview branches, each branch needs isolated D1 databases, R2 buckets, and KV namespaces with proper bindings configured in the Pages Project settings via the Cloudflare API.

## Installation

```bash
npm install -D cf-branch-wrangler
```

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

## Usage

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Bearer token for Cloudflare API requests (set as a **Preview** secret in Pages project settings) |
| `CF_PAGES_BRANCH` | Current branch (auto-set by Cloudflare Pages) |

> **Note:** The `CLOUDFLARE_API_TOKEN` must be added under **Settings → Environment variables → Preview** (not Production). The tool only runs for non-production branches, so Production doesn't need it.

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Auto-derived from Wrangler auth (no need to set) |
| `CF_PAGES_PROJECT_NAME` | Auto-derived from wrangler config `name` field |
| `CF_PAGES_PRODUCTION_BRANCH` | Production branch name (default: `main`) |

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
6. Update the Pages Project's preview deployment bindings

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
2. **Branch Detection**: Checks `CF_PAGES_BRANCH` against production branch
3. **Name Sanitization**: Converts branch names to safe Cloudflare resource names
   - Lowercase, alphanumeric + hyphens only
   - Max 63 characters
4. **Provisioning**: Uses `wrangler` CLI to create resources if they don't exist
5. **Binding Update**: Patches Pages Project preview bindings via Cloudflare API

## Idempotency

The tool is safe to run multiple times on the same branch:
- Checks for existing resources before creating
- Reuses existing databases, buckets, and namespaces
- Only updates bindings when resources change

## License

MIT
