'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const build = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(build, 'icon.svg'), 'utf8');

function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test('the icon is a round badge in warm colours, not the suite\'s blue and violet rounded square', () => {
  assert.match(svg, /<circle cx="256" cy="256" r="240" fill="url\(#disc\)"/, 'a circle fills the badge');
  assert.ok(!/<rect[^>]*rx="1\d\d"/.test(svg), 'no big rounded square behind it');
  const disc = svg.match(/<linearGradient id="disc"[\s\S]*?<\/linearGradient>/)[0];
  const stops = [...disc.matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
  assert.ok(stops.length >= 2);
  for (const stop of stops) {
    const h = hue(stop);
    assert.ok(h >= 15 && h <= 50, `${stop} is ${h.toFixed(0)}° and should be amber or orange, nowhere near the blues and violets (190° to 290°)`);
  }
});

test('the icon is a ledger: a dark cover, bands on its spine, a ruled label and a ribbon', () => {
  assert.match(svg, /id="cover"/);
  assert.equal((svg.match(/<rect x="148" y="\d+" width="42" height="11"\/>/g) ?? []).length, 3, 'three bands on the spine');
  assert.match(svg, /fill="#fdf3dc"/, 'a label');
  assert.match(svg, /fill="#c9372c"/, 'a ribbon');
});

test('the png is 512 by 512 with a clear background, and the ico holds every size Windows asks for', () => {
  const png = fs.readFileSync(path.join(build, 'icon.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]], [512, 512, 8, 6], 'size, 8 bits, colour type 6 (with transparency)');

  const ico = fs.readFileSync(path.join(build, 'icon.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'it is an icon file');
  const count = ico.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16;
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    const inside = ico.subarray(offset, offset + length);
    assert.equal(inside.subarray(1, 4).toString(), 'PNG', `size ${i} is a png`);
    const width = inside.readUInt32BE(16);
    assert.equal(inside.readUInt32BE(20), width, 'and square');
    assert.equal(ico[entry] || 256, width, 'and the table agrees with it');
    sizes.push(width);
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
});

test('the icon files are made from the svg by a script, which is the only way they change', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'make-icons.cjs'), 'utf8');
  assert.match(script, /build.*icon\.svg/);
  assert.match(script, /icon\.png/);
  assert.match(script, /icon\.ico/);
  assert.match(script, /SIZES = \[16, 24, 32, 48, 64, 128, 256\]/);
  const pkg = require('../package.json');
  assert.equal(pkg.build.directories.buildResources, 'build', 'the installers pick the icons up from here');
});
