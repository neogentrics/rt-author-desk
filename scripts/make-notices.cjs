'use strict';
// Keeps the second half of THIRD_PARTY_NOTICES.md true: the packages the main components depend on, which also ship inside the app, each with
// its own license. They are read from package-lock.json, so a new dependency can't be added without its license being listed. Run `npm run
// notices` after changing a dependency. A test fails when the file is out of date, and says to run this.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const BEGIN = '<!-- begin: made by npm run notices -->';
const END = '<!-- end: made by npm run notices -->';

// What ships inside the app: the production packages, less the ones the build leaves out whole (see "files" in package.json).
function shipped() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const left = new Set(pkg.build.files.map((p) => /^!node_modules\/([^/]+)\/\*\*$/.exec(p)?.[1]).filter(Boolean));
  return Object.entries(lock.packages)
    .filter(([key, value]) => key && !value.dev && !value.devOptional)
    .map(([key, value]) => ({ name: key.replace(/^.*node_modules\//, ''), version: value.version, license: value.license || 'unknown' }))
    .filter((item) => !left.has(item.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The packages the hand-written table above already lists are not repeated.
function listed(text) {
  const before = text.slice(0, text.indexOf(BEGIN));
  return new Set([...before.matchAll(/^\| ([^|(]+?)(?: \(| \|)/gm)].map((m) => m[1].trim().toLowerCase()));
}

function rest(text) {
  const have = listed(text);
  return shipped().filter((item) => !have.has(item.name.toLowerCase()));
}

function section(items) {
  return [BEGIN, '| Package | Version | License |', '|---|---|---|', ...items.map((i) => `| ${i.name} | ${i.version} | ${i.license} |`), END].join('\n');
}

function update(text) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < start) throw new Error('THIRD_PARTY_NOTICES.md has lost the markers that say where the generated list goes.');
  return `${text.slice(0, start)}${section(rest(text))}${text.slice(end + END.length)}`;
}

module.exports = { BEGIN, END, rest, section, shipped, update };

if (require.main === module) {
  const file = path.join(root, 'THIRD_PARTY_NOTICES.md');
  const text = fs.readFileSync(file, 'utf8');
  const next = update(text);
  fs.writeFileSync(file, next);
  console.log(next === text ? 'THIRD_PARTY_NOTICES.md was already up to date.' : 'THIRD_PARTY_NOTICES.md is up to date now.');
}
