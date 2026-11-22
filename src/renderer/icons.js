'use strict';
// The toolbar's icons: plain strokes in the text colour, drawn on a 24 by 24 square, the way RT Markdown Reader draws its own. They are
// built as elements (never as HTML), hidden from screen readers (the button carries the name), and take their colour from the button.
(() => {
  const SHAPES = {
    // Go to: lines of a list with a magnifying glass
    search: [['path', { d: 'M4 7h16M4 12h10M4 17h7' }], ['circle', { cx: 17, cy: 16, r: 3 }], ['path', { d: 'M19.2 18.2L21 20' }]],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    // Bring in books: an arrow into a tray
    import: [['path', { d: 'M12 3v12M7 10l5 5 5-5M5 21h14' }]],
    theme: [['path', { d: 'M12 3a9 9 0 1 0 9 9c0-.6-.6-1-1.2-.8A6 6 0 0 1 12.8 4.2c.2-.6-.2-1.2-.8-1.2z' }]],
    preferences: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1' }]],
    help: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8M12 17h.01' }]],
  };

  AD.icon = (name) => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [tag, attributes] of SHAPES[name] ?? []) {
      const shape = document.createElementNS(NS, tag);
      for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, String(value));
      svg.append(shape);
    }
    return svg;
  };
  AD.iconNames = Object.keys(SHAPES);
})();
