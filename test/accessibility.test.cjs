'use strict';
// Accessibility that can be checked without a window: the colours of everything that is not text (a field's border, the ring around what has
// the focus), the rules for Windows high contrast, motion, and how the colour-safe colours look with colour blindness. The checks that need
// the real page (names, the order of the keyboard, the high-contrast mode itself) are in the real-app tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { blend, brandTokens, contrast } = require('../src/shared/brand');
const { THEMES } = require('../src/shared/themes');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'style.css'), 'utf8');

// A theme's colours as plain #rrggbb, with any transparency laid over the desk.
const flat = (color, behind) => (color.length < 9 ? color : blend(behind, color.slice(0, 7), parseInt(color.slice(7, 9), 16) / 255));
function colours(theme) {
  const desk = flat(theme.desk, '#ffffff');
  const sheet = flat(theme.sheet, desk);
  const ink = flat(theme.ink, desk);
  return {
    desk, sheet, ink, card: blend(sheet, ink, 0.03), field: blend(sheet, ink, 0.07),
    panel: flat(theme.panel, desk), panelEnd: flat(theme.panelEnd, desk), onPanel: flat(theme.onPanel ?? theme.ink, desk),
    accent: flat(theme.accent, desk), onAccent: flat(theme.onAccent, desk),
  };
}

// The block of a media query, found by counting braces.
function block(opening) {
  const at = css.indexOf(opening);
  assert.ok(at >= 0, `${opening} is in the stylesheet`);
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(css.indexOf('{', at) + 1, i);
    }
  }
  return assert.fail(`${opening} is never closed`);
}

for (const [name, theme] of Object.entries(THEMES)) {
  test(`${name}: a field's border can be seen on the page, a card and a heading, which is how you know where to type`, () => {
    const c = colours(theme);
    // style.css: --field-line is the ink mixed into the page, 66 percent of it. Sepia needs at least 60, and the rest need less.
    const line = blend(c.sheet, c.ink, 0.66);
    for (const [where, ground] of [['the page', c.sheet], ['a card', c.card], ['a field', c.field]]) {
      assert.ok(contrast(line, ground) >= 3, `${name}: a border on ${where} is ${contrast(line, ground).toFixed(2)} to 1, and WCAG asks for 3`);
    }
  });

  test(`${name}: the ring around what has the focus can be seen where it is drawn: on the page, on the panel and on a bar`, () => {
    const c = colours(theme);
    for (const ground of [c.sheet, c.card, c.field]) assert.ok(contrast(c.accent, ground) >= 3, `${name}: the ring on the page and cards: ${contrast(c.accent, ground).toFixed(2)}`);
    for (const ground of [c.panel, c.panelEnd]) assert.ok(contrast(c.onPanel, ground) >= 3, `${name}: the ring on the toolbar and sidebar: ${contrast(c.onPanel, ground).toFixed(2)}`);
    assert.ok(contrast(c.onAccent, c.accent) >= 3, `${name}: the ring on the bars: ${contrast(c.onAccent, c.accent).toFixed(2)}`);
  });
}

test('the ring is as thick as WCAG asks and is drawn in the right colour where the page colour would hide it', () => {
  assert.match(css, /:focus-visible \{ outline: 3px solid var\(--focus\); outline-offset: 2px; \}/);
  assert.match(css, /\.toolbar :focus-visible \{ outline-color: var\(--t-on-panel\); \}/, 'on the toolbar, the colour of its words');
  assert.match(css, /\.side :focus-visible \{ outline-color: var\(--t-on-panel\); \}/, 'on the sidebar, the colour of its words');
  assert.match(css, /\.bar :focus-visible \{ outline-color: var\(--t-on-accent\); \}/, 'on a bar, the colour of its words');
});

test('your own colours keep the ring readable too, on the page, the panel and a bar', () => {
  const sweep = ['#000000', '#ffffff', '#777777', '#ffff00', '#e8590c', '#3b5bdb', '#14432f', '#e6dcc8', '#808080', '#0000ff'];
  for (const [name, theme] of Object.entries(THEMES).filter(([, t]) => !t.flat)) {
    for (const color of sweep) {
      const t = { ...colours(theme), ...Object.fromEntries(Object.entries(brandTokens(theme, { accent: color, panel: color })).map(([k, v]) => [k, v])) };
      const tokens = brandTokens(theme, { accent: color, panel: color });
      assert.ok(contrast(tokens['--t-on-panel'], tokens['--t-panel']) >= 3 && contrast(tokens['--t-on-panel'], tokens['--t-panel-end']) >= 3, `${name} ${color}: panel ring`);
      assert.ok(contrast(tokens['--t-on-accent'], tokens['--t-accent']) >= 3, `${name} ${color}: bar ring`);
      assert.ok(t['--t-accent'] && contrast(t['--t-accent'], colours(theme).sheet) >= 3, `${name} ${color}: page ring`);
    }
  }
});

test('a hint inside a field is readable, not the browser\'s pale grey', () => {
  assert.match(css, /input::placeholder, textarea::placeholder \{ color: var\(--ink-soft\); opacity: 1; \}/);
  for (const [name, theme] of Object.entries(THEMES)) {
    const c = colours(theme);
    assert.ok(contrast(flat(theme.inkSoft, c.desk), c.field) >= 4.5, `${name}: a hint on a field`);
  }
});

test('Windows high contrast has rules of its own that use only the system\'s colours, and show what colour alone showed', () => {
  const forced = block('@media (forced-colors: active)');
  for (const part of [':focus-visible', 'a[aria-current="page"]', '.help-nav button.on', '.palette-item[aria-selected="true"]', '.seg-btn[aria-pressed="true"]', '.swatch', '.count', '.toast', '.bar']) {
    assert.ok(forced.includes(part), `${part} has a rule for forced colours`);
  }
  assert.match(forced, /\.swatch[^{]*\{[^}]*forced-color-adjust: none/, 'a swatch keeps its own colour, because the colour is the point');
  assert.match(forced, /:focus-visible \{ outline: 3px solid Highlight; \}/);
  assert.match(forced, /Highlight; color: HighlightText/, 'the current choice is the system\'s highlight');
  // In this mode the system chooses colours. Anything the stylesheet names is either ignored or wrong, so only system colours may be named.
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|var\(--/i.test(forced.replace(/forced-color-adjust/g, '')), 'no colour of our own, and no variable, in the rules for forced colours');
});

test('a request for more contrast makes the faint lines as strong as the quiet text', () => {
  const more = block('@media (prefers-contrast: more)');
  assert.match(more, /--line: var\(--ink-soft\)/);
});

test('nothing moves unless the person has not asked for less motion', () => {
  const motion = block('@media (prefers-reduced-motion: no-preference)');
  const outside = css.replace(motion, '');
  assert.ok(!/\btransition\s*:|\banimation\s*:|@keyframes|\bscroll-behavior\s*:\s*smooth/.test(outside), 'every transition and animation is inside the no-preference rule');
});

// ---- colour blindness: the status colours in colour-safe mode, as the three common kinds of it show them (Reader's matrices, copied) ----
const KINDS = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
const seen = (color, kind) => { const l = color.map(toLinear); return kind.map((row) => fromLinear(Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))); };
function lab(color) {
  const [r, g, b] = color.map(toLinear);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const difference = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const declared = (selector) => Object.fromEntries([...css.slice(css.indexOf(selector)).split('}')[0].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));

// The words of good news, a check and a problem are what is compared (the chips and the dots beside them also say what they mean).
const pairs = [['good', 'check'], ['good', 'problem'], ['check', 'problem']];
const closest = (colours, matrix) => Math.min(...pairs.map(([a, b]) => difference(seen(rgb(colours[a]), matrix), seen(rgb(colours[b]), matrix))));
// The usual colours, as style.css has them, with the theme's own red for a problem.
const [, usualCheck, usualGood] = /^\s*--check: (#[0-9a-f]{6}); --check-bg: #[0-9a-f]{6}; --good: (#[0-9a-f]{6})/m.exec(css);
const [, darkCheck, darkGood] = /:root\[data-tone="dark"\] \{ --check: (#[0-9a-f]{6}); --check-bg: #[0-9a-f]{6}; --good: (#[0-9a-f]{6})/.exec(css);
const normal = {
  light: { good: usualGood, check: usualCheck, problem: THEMES.light.danger },
  dark: { good: darkGood, check: darkCheck, problem: THEMES.dark.danger },
};

for (const [mode, selector] of [['light', ':root[data-colors="safe"] {'], ['dark', ':root[data-colors="safe"][data-tone="dark"]']]) {
  test(`colour-safe, ${mode}: good news, a check and a problem stay clearly apart with each common kind of colour blindness, and further apart than the usual colours`, () => {
    const safe = declared(selector);
    for (const [kind, matrix] of Object.entries(KINDS)) {
      const apart = closest(safe, matrix);
      assert.ok(apart >= 10, `${mode}, ${kind}: the closest two are ${apart.toFixed(1)} apart, and 10 is where they start to look alike`);
    }
    // The option has to do what it says: with deuteranopia, the usual amber and red are hard to tell apart, and these are not.
    assert.ok(closest(safe, KINDS.deuteranopia) > closest(normal[mode], KINDS.deuteranopia) * 2, `${mode}: colour-safe is much better than the usual colours with deuteranopia`);
    assert.ok(closest(safe, KINDS.protanopia) > closest(normal[mode], KINDS.protanopia), `${mode}: and better with protanopia`);
  });
}
