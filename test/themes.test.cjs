'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Settings } = require('../src/main/settings');
const { DEFAULT_SETTINGS, LIMITS, THEMES, UI_FONTS, cleanSettings } = require('../src/shared/themes');

const renderer = path.join(__dirname, '..', 'src', 'renderer');
const css = fs.readFileSync(path.join(renderer, 'style.css'), 'utf8');

// WCAG contrast, on the real values. A colour with transparency is laid over what's behind it first.
function channels(hex) {
  const values = [1, 3, 5, 7].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return { rgb: values.slice(0, 3), alpha: Number.isNaN(values[3]) ? 1 : values[3] };
}
function solid(hex, behind) {
  const { rgb, alpha } = channels(hex);
  if (alpha === 1) return rgb;
  const under = channels(behind).rgb;
  return rgb.map((value, at) => value * alpha + under[at] * (1 - alpha));
}
const mix = (a, b, share) => a.map((value, at) => value * (1 - share) + b[at] * share); // share of b
function luminance(rgb) {
  const linear = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
function hue([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

for (const [name, theme] of Object.entries(THEMES)) {
  test(`${name}: every text colour can be read, on the page, the cards and the panel`, () => {
    const on = (color) => solid(color, theme.desk);
    const sheet = on(theme.sheet);
    const ink = on(theme.ink);
    // The cards and the fields sit a little off the page, toward the ink, as style.css works them out.
    const card = mix(sheet, ink, 0.03);
    const field = mix(sheet, ink, 0.07);
    const pairs = [
      ['text on the page', ink, sheet, 7],
      ['quiet text on the page', on(theme.inkSoft), sheet, 4.5],
      ['text on a card', ink, card, 7],
      ['quiet text on a card', on(theme.inkSoft), card, 4.5],
      ['quiet text on a field or heading', on(theme.inkSoft), field, 4.5],
      ['links on the page', on(theme.accent), sheet, 4.5],
      ['links on a card', on(theme.accent), card, 4.5],
      ['panel text', on(theme.onPanel ?? theme.ink), on(theme.panel), 4.5],
      ['panel text, lower down', on(theme.onPanel ?? theme.ink), on(theme.panelEnd), 4.5],
      ['quiet panel text', on(theme.onPanelSoft ?? theme.inkSoft), on(theme.panel), 4.5],
      ['quiet panel text, lower down', on(theme.onPanelSoft ?? theme.inkSoft), on(theme.panelEnd), 4.5],
      ['buttons', on(theme.onAccent), on(theme.accent), 4.5],
      ['warnings', on(theme.danger), on(theme.dangerBg), 4.5],
    ];
    for (const [label, text, ground, least] of pairs) {
      const ratio = contrast(text, ground);
      assert.ok(ratio >= least, `${name}, ${label}: ${ratio.toFixed(2)} is under ${least}`);
    }
  });
}

// Glass lays the panel and the page over the colours behind them, so the text is measured on the worst of those.
for (const [name, theme] of Object.entries(THEMES).filter(([, item]) => !item.flat)) {
  test(`${name}: can still be read as glass`, () => {
    const over = (color, share, stop) => {
      const under = channels(stop).rgb;
      return solid(color, stop).map((value, at) => value * share + under[at] * (1 - share));
    };
    for (const stop of theme.deskStops) {
      for (const panel of [theme.panel, theme.panelEnd]) {
        const ratio = contrast(solid(theme.onPanelSoft ?? theme.inkSoft, stop), over(panel, 0.72, stop));
        assert.ok(ratio >= 4.5, `${name}, quiet panel text over ${stop}: ${ratio.toFixed(2)}`);
      }
      const ratio = contrast(solid(theme.ink, stop), over(theme.sheet, 0.86, stop));
      assert.ok(ratio >= 7, `${name}, the page over ${stop}: ${ratio.toFixed(2)}`);
    }
  });
}

test('only High Contrast is one flat colour', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    assert.equal(theme.panel === theme.panelEnd && theme.barStart === theme.barEnd, Boolean(theme.flat), name);
  }
});

test('all the suite\'s themes are here', () => {
  assert.deepEqual(Object.keys(THEMES), ['light', 'dark', 'sepia', 'mist', 'slate', 'forest', 'dusk', 'blue', 'red', 'yellow',
    'blueOrange', 'plum', 'evergreen', 'aero', 'contrast']);
});

// The status colours live in style.css, so that is where they are measured.
function cssColors(selector) {
  const line = css.split('\n').find((l) => l.startsWith(selector));
  assert.ok(line, `style.css has no ${selector}`);
  return Object.fromEntries([...line.matchAll(/--([a-z-]+): (#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
}
test('good news, a check and a problem can be read in every mode', () => {
  const base = css.slice(css.indexOf('--check: #'), css.indexOf('}', css.indexOf('--check: #')));
  const light = Object.fromEntries([...base.matchAll(/--([a-z-]+): (#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const sets = {
    'light': light,
    'dark': cssColors(':root[data-tone="dark"]'),
    'colour-safe light': cssColors(':root[data-colors="safe"] {'),
    'colour-safe dark': cssColors(':root[data-colors="safe"][data-tone="dark"]'),
  };
  for (const [mode, c] of Object.entries(sets)) {
    for (const [fg, bg] of [['good', 'good-bg'], ['check', 'check-bg'], ['problem', 'problem-bg']]) {
      if (!c[fg] || !c[bg]) continue; // the light set gets its problem colours from the theme
      const ratio = contrast(channels(c[fg]).rgb, channels(c[bg]).rgb);
      assert.ok(ratio >= 4.5, `${mode}, ${fg}: ${ratio.toFixed(2)}`);
    }
  }
  assert.ok(sets['colour-safe light'].problem);
});

test('colour-safe colours are blue, orange and purple, never red and green', () => {
  for (const selector of [':root[data-colors="safe"] {', ':root[data-colors="safe"][data-tone="dark"]']) {
    const c = cssColors(selector);
    const h = (name) => hue(channels(c[name]).rgb);
    assert.ok(h('good') > 190 && h('good') < 250, `good is blue (${h('good').toFixed(0)}°)`);
    assert.ok(h('problem') > 10 && h('problem') < 35, `problem is orange (${h('problem').toFixed(0)}°)`);
    assert.ok(h('check') > 290 && h('check') < 335, `check is purple (${h('check').toFixed(0)}°)`);
  }
});

test('settings survive anything in the file, and anything the window sends', () => {
  assert.deepEqual(cleanSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(cleanSettings({ theme: 'nope', uiFont: 'constructor', textSize: 900, glass: 'yes', colorSafe: 1 }), DEFAULT_SETTINGS);
  assert.deepEqual(cleanSettings({ theme: '__proto__', uiFont: '__proto__' }), DEFAULT_SETTINGS);
  assert.equal(cleanSettings({ theme: 'plum' }).theme, 'plum');
  assert.equal(cleanSettings({ theme: 'system' }).theme, 'system');
  assert.equal(cleanSettings({ glass: true, colorSafe: true }).glass, true);
  assert.equal(cleanSettings({ colorSafe: true }).colorSafe, true);
  assert.equal(cleanSettings({ textSize: '17' }).textSize, 17);
  assert.equal(cleanSettings({ textSize: LIMITS.textSize[1] + 1 }).textSize, DEFAULT_SETTINGS.textSize);
  assert.ok(UI_FONTS.inter && UI_FONTS.atkinson);
});

test('settings are kept in a file beside the library, and a damaged file just means the usual look', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
  fs.writeFileSync(path.join(root, 'settings.json'), 'not json');
  const settings = new Settings(root);
  assert.deepEqual(settings.values, DEFAULT_SETTINGS);
  settings.save({ theme: 'sepia', textSize: 18, colorSafe: true });
  assert.deepEqual(new Settings(root).values, { ...DEFAULT_SETTINGS, theme: 'sepia', textSize: 18, colorSafe: true });
  settings.save({ theme: 'nope', textSize: 'huge' });
  assert.equal(new Settings(root).values.theme, 'sepia', 'a bad value changes nothing');
  assert.equal(new Settings(root).values.textSize, 18, 'and so does the next one');
  settings.save({ theme: 'system', textSize: DEFAULT_SETTINGS.textSize });
  assert.equal(new Settings(root).values.theme, 'system', 'but going back to the usual is allowed');
  settings.save({ theme: 'sepia', unknownSetting: 1, __proto__: { theme: 'dark' } });
  assert.deepEqual(Object.keys(new Settings(root).values).sort(), Object.keys(DEFAULT_SETTINGS).sort(), 'nothing else gets in');
  settings.save(null);
  assert.equal(new Settings(root).values.theme, 'sepia');
});

test('every file the page loads is in the build, fonts included', () => {
  const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const files = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map((m) => m[1]).filter((f) => !f.startsWith('http'));
  assert.ok(files.includes('fonts.css') && files.includes('../shared/themes.js') && files.includes('look.js') && files.includes('prefs.js'));
  const fonts = [...fs.readFileSync(path.join(renderer, 'fonts.css'), 'utf8').matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(fonts.length, 6);
  for (const file of [...files, ...fonts]) assert.ok(fs.existsSync(path.join(renderer, file)), `${file} is missing`);
  assert.match(html, /font-src 'self'/, 'the policy lets the app load its own fonts');
  assert.ok(!/style="/.test(html), 'no inline styles, which the policy would block');
});

test('the window can change how things look, but not where backups go', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
  const settings = new Settings(root);
  settings.save({ backupFolder: '/chosen/in/the/dialog', backupEvery: 'day' });
  settings.saveFromWindow({ theme: 'plum', backupFolder: '/somewhere/else', backupEvery: 'hour', backupKeep: 7, welcomed: true });
  assert.deepEqual([settings.values.theme, settings.values.backupFolder, settings.values.backupEvery, settings.values.backupKeep, settings.values.welcomed],
    ['plum', '/chosen/in/the/dialog', 'hour', 7, true]);
  assert.doesNotThrow(() => settings.saveFromWindow(null));
  assert.equal(cleanSettings({ backupEvery: 'fortnightly', backupKeep: 0, backupFolder: 5 }).backupEvery, 'off');
  assert.equal(cleanSettings({ backupKeep: 0 }).backupKeep, DEFAULT_SETTINGS.backupKeep);
  assert.equal(cleanSettings({ backupFolder: 'x'.repeat(2000) }).backupFolder, '');
});
