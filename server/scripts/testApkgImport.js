#!/usr/bin/env node
/**
 * Simple end-to-end APKG import test.
 * Usage:
 *   node server/scripts/testApkgImport.js --file /path/to/one.apkg --file /path/to/two.apkg
 * Options:
 *   --api http://localhost:5001 (default)
 *   --email admin@linguanova.com
 *   --password apav1975
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

const argv = (() => {
  const args = process.argv.slice(2);
  const opts = { files: [], api: process.env.API_URL || 'http://localhost:5001', email: process.env.ADMIN_EMAIL || 'admin@linguanova.com', password: process.env.ADMIN_PASSWORD || 'apav1975' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file' || a === '-f') {
      const p = args[++i];
      if (p) opts.files.push(p);
    } else if (a === '--api') {
      opts.api = args[++i] || opts.api;
    } else if (a === '--email') {
      opts.email = args[++i] || opts.email;
    } else if (a === '--password') {
      opts.password = args[++i] || opts.password;
    }
  }
  return opts;
})();

const log = (...args) => console.log('[TEST/APKG]', ...args);

const main = async () => {
  if (!argv.files || argv.files.length < 2) {
    console.error('Provide at least two --file .apkg paths to test.');
    process.exit(1);
  }

  // Login
  log('Logging in as admin...');
  const loginResp = await fetch(`${argv.api}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: argv.email, password: argv.password })
  });
  const loginData = await loginResp.json();
  if (!loginResp.ok) {
    console.error('Login failed:', loginData);
    process.exit(1);
  }
  const token = loginData.token;
  log('Login ok.');

  const importResults = [];

  for (const f of argv.files) {
    if (!fs.existsSync(f)) {
      console.error('File not found:', f);
      process.exit(1);
    }
    const fd = new FormData();
    fd.append('apkg', fs.createReadStream(f), { filename: path.basename(f) });
    log('Uploading', f);
    const up = await fetch(`${argv.api}/api/upload/apkg`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: fd
    });
    const upData = await up.json();
    if (!up.ok) {
      console.error('Upload failed:', upData);
      process.exit(1);
    }
    const apkgPath = upData?.apkg?.path;
    const baseDir = upData?.apkg?.baseDir;
    log('Importing', f, 'apkgPath:', apkgPath);
    const imp = await fetch(`${argv.api}/api/flashcards/import/apkg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ apkgPath, apkgBaseDir: baseDir, deckStrategy: 'single', onDuplicate: 'overwrite' })
    });
    const impData = await imp.json();
    if (!imp.ok) {
      console.error('Import failed:', impData);
      process.exit(1);
    }
    importResults.push(impData);
  }

  // List decks for the user
  log('Listing decks...');
  const decksResp = await fetch(`${argv.api}/api/flashcards/decks`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const decksData = await decksResp.json();
  if (!decksResp.ok) {
    console.error('List decks failed:', decksData);
    process.exit(1);
  }
  const names = (decksData?.decks || []).map(d => ({ id: d.id, name: d.name }));
  log('Decks:', names);

  // Assert that decks created by imports have distinct names
  const createdNames = importResults.flatMap(r => (r?.results || []).map(x => x?.name)).filter(Boolean);
  const unique = new Set(createdNames);
  if (unique.size !== createdNames.length) {
    console.error('Test FAILED: duplicate deck names detected:', createdNames);
    process.exit(2);
  }
  log('Test OK: unique deck names per APKG import:', createdNames);
};

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});