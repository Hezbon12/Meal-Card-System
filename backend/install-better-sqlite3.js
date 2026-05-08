'use strict';
/**
 * Downloads the correct prebuilt better-sqlite3 binary for the current
 * Node.js version and platform. Run this after npm install if the binary
 * is missing (e.g. on a fresh server or after a Node upgrade).
 *
 * Usage: node install-better-sqlite3.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkg = require('./node_modules/better-sqlite3/package.json');
const version = pkg.version;
const nodeModules = process.modules || process.versions.modules;
const platform = process.platform;
const arch = process.arch;

const binaryName = `better-sqlite3-v${version}-node-v${nodeModules}-${platform}-${arch}.tar.gz`;
const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/${binaryName}`;
const tmpFile = path.join(require('os').tmpdir(), binaryName);
const destDir = path.join(__dirname, 'node_modules', 'better-sqlite3', 'build', 'Release');

// Check if binary already works
try {
  require('./node_modules/better-sqlite3');
  console.log('✅ better-sqlite3 is already working correctly.');
  process.exit(0);
} catch (e) {
  console.log(`⚠️  better-sqlite3 binary missing or incompatible. Downloading prebuilt binary...`);
  console.log(`   Node modules ABI: ${nodeModules}, Platform: ${platform}-${arch}`);
  console.log(`   URL: ${url}`);
}

// Download the tarball
const file = fs.createWriteStream(tmpFile);
https.get(url, (res) => {
  if (res.statusCode === 302 || res.statusCode === 301) {
    // Follow redirect
    https.get(res.headers.location, (res2) => {
      res2.pipe(file);
      file.on('finish', () => { file.close(); extract(); });
    }).on('error', fail);
  } else if (res.statusCode === 200) {
    res.pipe(file);
    file.on('finish', () => { file.close(); extract(); });
  } else {
    fail(new Error(`HTTP ${res.statusCode} — prebuilt binary not available for this platform.\nTry: npm install --build-from-source`));
  }
}).on('error', fail);

function extract() {
  fs.mkdirSync(destDir, { recursive: true });
  try {
    execSync(`tar -xzf "${tmpFile}" -C "${destDir}" --strip-components=1`);
    fs.unlinkSync(tmpFile);
    // Verify it loads
    require('./node_modules/better-sqlite3');
    console.log('✅ better-sqlite3 binary installed successfully.');
  } catch (e) {
    fail(e);
  }
}

function fail(err) {
  console.error('❌ Failed to install better-sqlite3 binary:', err.message);
  console.error('   Manual fix: node install-better-sqlite3.js');
  console.error('   Or use Node.js 20 LTS which has prebuilt binaries available via npm.');
  process.exit(1);
}
