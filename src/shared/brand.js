'use strict';
// Customize Theme: your own accent, panel and background colours, laid over any theme but High Contrast. The colour maths is RT Markdown
// Reader's (src/renderer/brand.js), copied: whatever colour is picked, the text on it is changed only as much as it takes to be read, so
// no choice can leave something unreadable, and a test measures that over a great many colours. Kept apart from the window so it can be
// tested on its own, and so the window can only ever set the few variables named here, each to a colour worked out from a checked hex.
(function defineBrand(root) {
  const HEX = /^#[0-9a-f]{6}$/i;
  const KEYS = ['accent', 'panel', 'background'];
  const WHITE = '#ffffff';
  const BLACK = '#000000';

  /** The custom colours as the app keeps them: each one a #rrggbb in lower case, or empty for the theme's own. Anything else is empty. */
  function cleanBrand(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return Object.fromEntries(KEYS.map((key) => [key, typeof source[key] === 'string' && HEX.test(source[key]) ? source[key].toLowerCase() : '']));
  }
  /**
   * A change to the custom colours laid over the ones there are. A change names only the colours it changes. A colour that is not a
   * #rrggbb (and not empty, which means the theme's own) is ignored, so a bad request leaves that colour as it was.
   */
  function mergeBrand(current, change) {
    const merged = cleanBrand(current);
    if (!change || typeof change !== 'object' || Array.isArray(change)) return merged;
    for (const key of KEYS) {
      const value = change[key];
      if (value === '' || (typeof value === 'string' && HEX.test(value))) merged[key] = value.toLowerCase();
    }
    return merged;
  }
  const hasBrand = (brand) => KEYS.some((key) => HEX.test(brand?.[key] || ''));

  // ---- colour maths ----
  const channels = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const toHex = (values) => `#${values.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  /** `share` of the way from a to b. */
  const blend = (a, b, share) => {
    const to = channels(b);
    return toHex(channels(a).map((v, at) => v + (to[at] - v) * share));
  };
  const luminance = (hex) => {
    const [r, g, b] = channels(hex).map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  /** A theme's colour with its transparency (#rrggbbaa) laid over what is behind it, as a plain #rrggbb. */
  const opaque = (color, behind) => {
    if (color.length < 9) return color;
    const alpha = parseInt(color.slice(7, 9), 16) / 255;
    return blend(behind, color.slice(0, 7), alpha);
  };
  /** How well a colour reads on the worst of several. */
  const worst = (color, stops) => Math.min(...stops.map((stop) => contrast(color, stop)));
  /** Black or white, whichever reads better. One of them always reaches 4.5. */
  const inkFor = (stops) => (worst(WHITE, stops) >= worst(BLACK, stops) ? WHITE : BLACK);
  /** The colour itself if it reads on all of these, otherwise as little of the ink as it takes. */
  const readable = (color, stops, ink) => {
    for (let step = 0; step < 20; step += 1) {
      const mixed = blend(color, ink, step / 20);
      if (worst(mixed, stops) >= 4.5) return mixed;
    }
    return ink;
  };
  /** The ink faded towards the panel, as far as it can go and still be read. */
  const faded = (ink, stops, amount) => {
    for (let share = amount; share > 0; share -= 0.05) {
      const mixed = blend(ink, stops[0], share);
      if (worst(mixed, stops) >= 4.5) return mixed;
    }
    return ink;
  };
  /**
   * A wash over the panel for a hover or a count, as strong as `most` percent. It goes toward the ink, as far as `text` can still be read
   * on it. A middle-grey panel has no room for that, so there it goes the other way, away from the ink, which only makes the text clearer.
   */
  const wash = (stops, ink, text, most) => {
    for (let percent = most; percent > 0; percent -= 1) {
      if (stops.every((stop) => contrast(text, blend(stop, ink, percent / 100)) >= 4.5)) return `color-mix(in srgb, ${ink} ${percent}%, transparent)`;
    }
    return `color-mix(in srgb, ${ink === WHITE ? BLACK : WHITE} ${most}%, transparent)`;
  };

  /**
   * The CSS variables that put the custom colours on a theme, as { '--t-accent': '#...' }. Nothing for High Contrast, which keeps its own
   * colours because plain contrast is the point of it, and nothing when no colour is set.
   */
  function brandTokens(theme, input) {
    const brand = cleanBrand(input);
    if (!theme || theme.flat || !hasBrand(brand)) return {};
    const out = {};
    const desk = opaque(theme.desk, WHITE);
    const sheet = opaque(theme.sheet, desk);
    const ink = opaque(theme.ink, desk);

    if (brand.accent) {
      // It has to be read as a link on the page and the cards, and as a ring around a focused button, so it is measured on those. Glass
      // lets a little of the desk through the page, so the page over each of the desk's colours counts too.
      const stops = [sheet, blend(sheet, ink, 0.03), blend(sheet, ink, 0.07), ...(theme.deskStops ?? []).map((stop) => blend(stop, sheet, 0.86))];
      const color = readable(brand.accent, stops, ink);
      out['--t-accent'] = color;
      out['--t-on-accent'] = inkFor([color]);
    }

    if (brand.panel) {
      const text = inkFor([brand.panel]);
      const shade = blend(brand.panel, text === WHITE ? BLACK : WHITE, 0.14);
      const stops = [brand.panel, shade];
      const onPanel = faded(text, stops, 0.06);
      out['--t-panel'] = brand.panel;
      out['--t-panel-end'] = shade;
      out['--t-panel-edge'] = blend(brand.panel, text, 0.24);
      out['--t-on-panel'] = onPanel;
      out['--t-on-panel-soft'] = faded(text, stops, 0.16);
      out['--t-hover'] = wash(stops, text, onPanel, 14);
      out['--t-chip'] = wash(stops, text, onPanel, 22);
    }

    if (brand.background) {
      const c = brand.background;
      out['--t-desk'] = c;
      out['--t-desk-image'] = `linear-gradient(135deg, ${c}, ${blend(c, inkFor([c]) === WHITE ? BLACK : WHITE, 0.14)})`;
    }
    return out;
  }

  /** Frosted panels would take on whatever is behind them, which could leave their text unreadable over a colour that was chosen. */
  const solidSurface = (theme, input) => {
    const brand = cleanBrand(input);
    return !theme?.flat && Boolean(brand.panel || brand.background);
  };

  /** The colours people often pick, shown as swatches. They are Reader's. */
  const ACCENTS = ['#3b5bdb', '#0b7285', '#2b8a3e', '#e8590c', '#c2255c', '#7048e8', '#1d2330'];
  const PANELS = ['#1d2330', '#12355b', '#14432f', '#3d1f5c', '#6b1d2a', '#e6dcc8', '#dbe4f0'];
  const BACKGROUNDS = ['#14161c', '#0f2a43', '#123a2c', '#2d1a47', '#4d1518', '#efe6d4', '#e1e8f1'];

  const brandApi = { ACCENTS, BACKGROUNDS, KEYS, PANELS, blend, brandTokens, cleanBrand, contrast, hasBrand, inkFor, mergeBrand, solidSurface };
  // The main process and the tests load this as a module, and the window loads it as a plain script.
  if (typeof module !== 'undefined' && module.exports) module.exports = brandApi;
  else root.ADBrand = brandApi;
})(typeof window !== 'undefined' ? window : globalThis);
