#!/usr/bin/env node

const { main } = require('../lib/index.js');
const { cleanup } = require('../lib/cleanup.js');

const args = process.argv.slice(2);
const command = args[0];

if (command === 'cleanup') {
  const autoConfirm = args.includes('--confirm');
  const branchIdx = args.indexOf('--branch');
  const branch = branchIdx !== -1 ? args[branchIdx + 1] : null;

  cleanup({ autoConfirm, branch }).catch((error) => {
    console.error('cf-branch-wrangler cleanup failed:', error.message);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error('cf-branch-wrangler failed:', error.message);
    process.exit(1);
  });
}
