'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Settings } = require('../src/main/settings');
const { ACCENTS, BACKGROUNDS, PANELS, blend, brandTokens, cleanBrand, contrast, hasBrand, inkFor, mergeBrand, solidSurface } = require('../src/shared/brand');
const { DEFAULT_SETTINGS, THEMES, cleanSettings } = require('../src/shared/themes');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const OPEN = Object.entries(THEMES).filter(([, theme]) => !theme.flat);

// The same colours every time: the ones people pick, the extremes, the greys where black and white are equally poor, and a few hundred more.
function colours() {
  let seed = 20261122;
  const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hex = (n) => `#${Math.floor(n).toString(16).padStart(6, '0')}`;
  const greys = [0x00, 0x33, 0x55, 0x66, 0x70, 0x77, 0x7b, 0x80, 0x88, 0x99, 0xaa, 0xcc, 0xee, 0xff].map((v) => hex(v * 0x010101));
  const named = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffa500', '#800080'];
  return [...new Set([...ACCENTS, ...PANELS, ...BACKGROUNDS, ...greys, ...named, ...Array.from({ length: 300 }, () => hex(random() * 0x1000000))])];
}
const COLOURS = colours();

// What a theme's page and cards are, flattened the way the other contrast tests do it.
const flat = (color, behind) => (color.length < 9 ? color : blend(behind, color.slice(0, 7), parseInt(color.slice(7, 9), 16) / 255));
function ground(theme) {
  const desk = flat(theme.desk, '#ffffff');
  const sheet = flat(theme.sheet, desk);
  const ink = flat(theme.ink, desk);
  return { desk, sheet, ink, card: blend(sheet, ink, 0.03), field: blend(sheet, ink, 0.07) };
}
const washOf = (value) => {
  const [, colour, percent] = /^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, transparent\)$/.exec(value) ?? [];
  assert.ok(colour, `${value} is a wash of one colour`);
  return { colour, share: Number(percent) / 100 };
};

test('the colours are kept as #rrggbb in lower case, and anything else is the theme\'s own', () => {
  assert.deepEqual(cleanBrand({ accent: '#ABCDEF', panel: '#123456', background: '#00FF00' }), { accent: '#abcdef', panel: '#123456', background: '#00ff00' });
  for (const bad of ['red', '#fff', '#12345', '#1234567', 'rgb(1,2,3)', '#12345g', ' #123456', '#123456 ', 'url(x)', '#123456; color: red', 5, null, undefined, {}, [], true]) {
    assert.deepEqual(cleanBrand({ accent: bad }), { accent: '', panel: '', background: '' }, String(bad));
  }
  assert.deepEqual(cleanBrand('nothing'), { accent: '', panel: '', background: '' });
  assert.deepEqual(cleanBrand([['accent', '#123456']]), { accent: '', panel: '', background: '' });
  assert.equal(hasBrand({ accent: '', panel: '', background: '' }), false);
  assert.equal(hasBrand({ accent: '#123456' }), true);
});

test('a change names only the colours it changes, and a bad one leaves that colour as it was', () => {
  const now = { accent: '#3b5bdb', panel: '#12355b', background: '' };
  assert.deepEqual(mergeBrand(now, { background: '#0f2a43' }), { accent: '#3b5bdb', panel: '#12355b', background: '#0f2a43' });
  assert.deepEqual(mergeBrand(now, { accent: '' }), { accent: '', panel: '#12355b', background: '' }, 'empty is the theme\'s own');
  assert.deepEqual(mergeBrand(now, { accent: 'zzz', panel: 5, background: '#abc' }), now, 'bad ones change nothing');
  assert.deepEqual(mergeBrand(now, { accent: '#ABCDEF' }).accent, '#abcdef');
  for (const nonsense of [5, null, undefined, 'x', [], [['accent', '#123456']]]) assert.deepEqual(mergeBrand(now, nonsense), now);
  assert.deepEqual(mergeBrand(undefined, { accent: '#123456' }), { accent: '#123456', panel: '', background: '' });
});

test('with no colours chosen, or on High Contrast, or with no theme, nothing is changed', () => {
  for (const [, theme] of OPEN) assert.deepEqual(brandTokens(theme, {}), {});
  assert.deepEqual(brandTokens(THEMES.contrast, { accent: '#ff00ff', panel: '#00ff00', background: '#0000ff' }), {}, 'High Contrast keeps its own colours');
  assert.deepEqual(brandTokens(undefined, { accent: '#ff00ff' }), {});
  assert.deepEqual(brandTokens(THEMES.light, { accent: 'nonsense' }), {});
});

test('only a few named variables are ever set, each to a colour worked out from a checked hex', () => {
  const allowed = new Set(['--t-accent', '--t-on-accent', '--t-panel', '--t-panel-end', '--t-panel-edge', '--t-on-panel', '--t-on-panel-soft', '--t-hover', '--t-chip', '--t-desk', '--t-desk-image']);
  const colour = /^(#[0-9a-f]{6}|color-mix\(in srgb, #[0-9a-f]{6} \d+%, transparent\)|transparent|linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6}\))$/;
  for (const [name, theme] of OPEN) {
    for (const c of COLOURS.filter((_, at) => at % 7 === 0)) {
      for (const tokens of [brandTokens(theme, { accent: c }), brandTokens(theme, { panel: c }), brandTokens(theme, { background: c }), brandTokens(theme, { accent: c, panel: c, background: c })]) {
        for (const [variable, value] of Object.entries(tokens)) {
          assert.ok(allowed.has(variable), `${name}: ${variable}`);
          assert.match(value, colour, `${name} ${c}: ${variable}`);
        }
      }
    }
  }
});

test('an accent colour can always be read as a link on the page and the cards, in every theme, and as the words on a button', () => {
  let changed = 0;
  let kept = 0;
  for (const [name, theme] of OPEN) {
    const { sheet, card, field } = ground(theme);
    const glass = (theme.deskStops ?? []).map((stop) => blend(stop, sheet, 0.86));
    for (const c of COLOURS) {
      const tokens = brandTokens(theme, { accent: c });
      const accent = tokens['--t-accent'];
      for (const [label, stop] of [['the page', sheet], ['a card', card], ['a field', field], ...glass.map((g) => ['glass', g])]) {
        assert.ok(contrast(accent, stop) >= 4.5, `${name}, ${c} as ${accent} on ${label}: ${contrast(accent, stop).toFixed(2)}`);
      }
      assert.ok(contrast(tokens['--t-on-accent'], accent) >= 4.5, `${name}, ${c}: words on a button ${contrast(tokens['--t-on-accent'], accent).toFixed(2)}`);
      assert.ok(['#000000', '#ffffff'].includes(tokens['--t-on-accent']));
      if (accent === c) kept += 1; else changed += 1;
    }
  }
  assert.ok(kept > 0 && changed > 0, `some colours are fine as they are (${kept}) and some are changed (${changed})`);
});

test('a colour that already reads is not touched', () => {
  assert.equal(brandTokens(THEMES.light, { accent: '#3b5bdb' })['--t-accent'], '#3b5bdb');
  assert.equal(brandTokens(THEMES.dark, { accent: '#ffe08a' })['--t-accent'], '#ffe08a');
  assert.notEqual(brandTokens(THEMES.light, { accent: '#ffff00' })['--t-accent'], '#ffff00', 'yellow on white is changed');
  assert.notEqual(brandTokens(THEMES.dark, { accent: '#000080' })['--t-accent'], '#000080', 'navy on a dark page is changed');
});

test('a panel colour always has words, quiet words, a hover and a count that can be read on it, from its top to its bottom', () => {
  for (const c of COLOURS) {
    const tokens = brandTokens(THEMES.light, { panel: c });
    const panel = tokens['--t-panel'];
    const end = tokens['--t-panel-end'];
    assert.equal(panel, c);
    for (const [label, text] of [['words', tokens['--t-on-panel']], ['quiet words', tokens['--t-on-panel-soft']]]) {
      for (const stop of [panel, end]) assert.ok(contrast(text, stop) >= 4.5, `${c}: ${label} ${text} on ${stop}: ${contrast(text, stop).toFixed(2)}`);
    }
    for (const wash of ['--t-hover', '--t-chip']) {
      const { colour, share } = washOf(tokens[wash]);
      for (const stop of [panel, end]) {
        const under = blend(stop, colour, share);
        assert.ok(contrast(tokens['--t-on-panel'], under) >= 4.5, `${c}: words on the ${wash} over ${stop}: ${contrast(tokens['--t-on-panel'], under).toFixed(2)}`);
      }
    }
    assert.ok(/^#[0-9a-f]{6}$/.test(tokens['--t-panel-edge']));
  }
});

test('the washes are as strong as they can be: full on an easy panel, weaker where the words would stop being readable, and turned around where there is no room', () => {
  assert.equal(brandTokens(THEMES.light, { panel: '#12355b' })['--t-hover'], 'color-mix(in srgb, #ffffff 14%, transparent)');
  assert.equal(brandTokens(THEMES.light, { panel: '#12355b' })['--t-chip'], 'color-mix(in srgb, #ffffff 22%, transparent)');
  let full = 0;
  let weaker = 0;
  let turned = 0;
  for (const c of COLOURS) {
    const { colour, share } = washOf(brandTokens(THEMES.light, { panel: c })['--t-chip']);
    if (colour !== inkFor([c])) {
      turned += 1;
      assert.equal(share, 0.22, `${c}: turned around, and at full strength`);
    } else if (share < 0.22) weaker += 1;
    else full += 1;
  }
  assert.ok(full > 0 && weaker > 0 && turned > 0, `every way is used by some colour (${full} full, ${weaker} weaker, ${turned} turned)`);
});

test('a background colour sets the desk and a soft gradient from it, and nothing else', () => {
  for (const c of COLOURS.slice(0, 40)) {
    const tokens = brandTokens(THEMES.sepia, { background: c });
    assert.deepEqual(Object.keys(tokens).sort(), ['--t-desk', '--t-desk-image']);
    assert.equal(tokens['--t-desk'], c);
    assert.match(tokens['--t-desk-image'], new RegExp(`^linear-gradient\\(135deg, ${c}, #[0-9a-f]{6}\\)$`));
  }
});

test('the three together set what each sets alone', () => {
  const all = brandTokens(THEMES.mist, { accent: '#0b7285', panel: '#14432f', background: '#123a2c' });
  assert.deepEqual({ ...brandTokens(THEMES.mist, { accent: '#0b7285' }), ...brandTokens(THEMES.mist, { panel: '#14432f' }), ...brandTokens(THEMES.mist, { background: '#123a2c' }) }, all);
});

test('a theme with a see-through panel, and every theme whatever its colours, is handled without being changed', () => {
  const before = JSON.stringify(THEMES);
  for (const [, theme] of OPEN) brandTokens(theme, { accent: '#ff0000', panel: '#00ff00', background: '#0000ff' });
  assert.equal(JSON.stringify(THEMES), before, 'the themes are not touched');
  const aero = brandTokens(THEMES.aero, { accent: '#e8590c' });
  assert.ok(contrast(aero['--t-accent'], blend('#8fbbe2', '#ffffff', 0.86)) >= 4.5);
  assert.deepEqual(brandTokens(THEMES.aero, { accent: '#e8590c' }), aero, 'the same answer every time');
});

test('frosted glass is turned off while your own panel or background colour is used, but not for an accent, and never for High Contrast', () => {
  assert.equal(solidSurface(THEMES.light, { panel: '#12355b' }), true);
  assert.equal(solidSurface(THEMES.light, { background: '#12355b' }), true);
  assert.equal(solidSurface(THEMES.light, { accent: '#12355b' }), false);
  assert.equal(solidSurface(THEMES.light, {}), false);
  assert.equal(solidSurface(THEMES.contrast, { panel: '#12355b' }), false);
});

test('the colours are part of the settings: nothing by default, one at a time, bad ones ignored, and kept in the file', () => {
  assert.deepEqual(DEFAULT_SETTINGS.brand, { accent: '', panel: '', background: '' });
  assert.deepEqual(cleanSettings({ brand: { accent: '#ABCDEF', panel: 'red' } }).brand, { accent: '#abcdef', panel: '', background: '' });
  assert.deepEqual(cleanSettings({ brand: 'nonsense' }).brand, DEFAULT_SETTINGS.brand);
  const root = temp();
  const settings = new Settings(root);
  settings.save({ brand: { accent: '#3b5bdb' } });
  settings.save({ brand: { panel: '#12355b' } });
  settings.save({ brand: 5 });
  settings.save({ brand: { accent: 'zzz', background: '<script>' } });
  assert.deepEqual(settings.values.brand, { accent: '#3b5bdb', panel: '#12355b', background: '' }, 'one at a time, and nonsense changes nothing');
  assert.deepEqual(new Settings(root).values.brand, { accent: '#3b5bdb', panel: '#12355b', background: '' }, 'kept in the file');
  settings.saveFromWindow({ brand: { accent: '' } });
  assert.deepEqual(settings.values.brand, { accent: '', panel: '#12355b', background: '' }, 'the window can change them');
  settings.save({ brand: { accent: '', panel: '', background: '' }, theme: 'sepia' });
  assert.deepEqual(settings.values.brand, DEFAULT_SETTINGS.brand, 'and take them all off at once');
  assert.equal(settings.values.theme, 'sepia');
});
