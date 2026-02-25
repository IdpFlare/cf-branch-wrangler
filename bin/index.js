#!/usr/bin/env node

const { main } = require('../lib/index.js');

main().catch((error) => {
  console.error('cf-branch-wrangler failed:', error.message);
  process.exit(1);
});
