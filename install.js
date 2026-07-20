#!/usr/bin/env node
'use strict';
// Cross-platform installer for the cloudreve-v4-upload skill.
//
//   node install.js
//
// Mirrors install.sh: resolves the skill source (clones the repo if run
// standalone, or uses the current directory when run from a cloned copy), then
// copies it into the agent's skills directory.
//
// Target: default %USERPROFILE%/.workbuddy/skills/cloudreve-v4-upload
//         (override with the SKILLS_DIR environment variable).
// Requires: `git` on PATH.

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKILL_ID = 'cloudreve-v4-upload';
const REPO = 'https://github.com/ZhengHaoF/cloudreve-v4-skill.git';
const target = process.env.SKILLS_DIR
  ? path.resolve(process.env.SKILLS_DIR)
  : path.join(os.homedir(), '.workbuddy', 'skills', SKILL_ID);

function run(cmd) {
  console.error('$ ' + cmd);
  execSync(cmd, { stdio: 'inherit' });
}

// Resolve source.
let src = null;
let tmpRoot = null;
const selfDir = __dirname;
if (fs.existsSync(path.join(selfDir, 'SKILL.md'))) {
  src = selfDir;
} else {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-install-'));
  const repoDir = path.join(tmpRoot, 'repo');
  run(`git clone --depth 1 "${REPO}" "${repoDir}"`);
  src = repoDir;
}

// Sanity check: the clone must have produced a real working tree.
if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
  console.error(`ERROR: clone produced an empty working tree (no SKILL.md in ${src}).`);
  console.error('       Check your git/network and retry. If the temp dir is restricted, set SKILLS_DIR and clone manually.');
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });

const items = ['SKILL.md', 'README.md', 'README.zh.md', 'scripts', 'references', '.env.example'];
for (const it of items) {
  const s = path.join(src, it);
  const d = path.join(target, it);
  if (fs.existsSync(s)) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.cpSync(s, d, { recursive: true });
  }
}

console.error(`Installed '${SKILL_ID}' to ${target}`);
console.error('Re-open / restart your agent to load it.');

if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
