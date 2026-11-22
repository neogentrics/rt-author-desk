'use strict';
// View → Customize Theme: your own accent, panel and background colours, laid over any theme but High Contrast. The layout and the wording
// are RT Markdown Reader's. A colour is tried on the page as it is dragged and kept when it is let go. The words on it change only as much
// as it takes to stay readable (that is worked out in shared/brand.js and tested over a great many colours), so no choice can go wrong.
(() => {
  const { h } = AD;
  const { ACCENTS, BACKGROUNDS, PANELS, cleanBrand, solidSurface } = window.ADBrand;
  const { THEMES } = window.ADThemes;

  const ROWS = [
    { key: 'accent', name: 'Accent colour', noun: 'accent', colors: ACCENTS, start: '#3b5bdb', help: 'Buttons, links and what you have chosen.' },
    { key: 'panel', name: 'Panel colour', noun: 'panel', colors: PANELS, start: '#12355b', help: 'The sidebar and the toolbar.' },
    { key: 'background', name: 'Background colour', noun: 'background', colors: BACKGROUNDS, start: '#0f2a43', help: 'Behind the page.' },
  ];
  const NONE = cleanBrand({});

  AD.openCustomize = () => {
    document.getElementById('customize')?.remove();
    const brandNow = () => cleanBrand(AD.currentLook()?.brand);

    const keep = (key, value) => AD.setLook({ brand: { [key]: value } });
    // While a colour is being dragged it shows on the page without being kept, so there is one save when it is let go and not hundreds.
    const tryOut = (key, value) => AD.applyLook({ ...AD.currentLook(), brand: { ...brandNow(), [key]: value } });

    const swatch = (row, color) => {
      const button = h('button', {
        type: 'button', class: `swatch${color ? '' : ' none'}`, 'data-color': color, 'aria-label': color ? `${row.name} ${color}` : `${row.name}: the theme's own`,
        title: color || "The theme's own", onclick: () => keep(row.key, color),
      });
      if (color) button.style.setProperty('--c', color); // set from the script: the page's policy does not allow a style written into the HTML
      return button;
    };

    const parts = ROWS.map((row) => {
      const picker = h('input', { type: 'color', id: `custom-${row.key}`, value: row.start, 'aria-label': `Custom ${row.noun} colour` });
      picker.addEventListener('input', () => tryOut(row.key, picker.value));
      picker.addEventListener('change', () => keep(row.key, picker.value));
      const swatches = [swatch(row, ''), ...row.colors.map((color) => swatch(row, color))];
      const fieldset = h('fieldset', { class: 'customize-row' },
        h('legend', null, row.name),
        h('div', { class: 'swatches' }, swatches, h('label', { class: 'custom-pick' }, 'Custom', picker)),
        h('p', { class: 'help' }, row.help));
      return { row, picker, swatches, fieldset };
    });

    const note = h('p', { class: 'note', role: 'status' });
    const refresh = () => {
      const look = AD.currentLook();
      const brand = brandNow();
      for (const { row, picker, swatches } of parts) {
        for (const button of swatches) button.setAttribute('aria-pressed', String(button.dataset.color === brand[row.key]));
        picker.value = brand[row.key] || row.start;
      }
      const theme = THEMES[AD.themeName(look)];
      note.textContent = theme.flat
        ? 'You are using High Contrast, which keeps its own colours. Yours apply as soon as you pick another theme.'
        : look.glass && solidSurface(theme, brand) ? 'Glass stays solid while you use your own panel or background colour, because frosted colour could make the words hard to read.' : '';
    };
    const follow = () => refresh();
    document.addEventListener('ad:look', follow);

    const done = h('button', { type: 'button', class: 'primary', id: 'customize-done' }, 'Done');
    const reset = h('button', { type: 'button', id: 'customize-reset', onclick: () => AD.setLook({ brand: NONE }) }, 'Back to the theme\'s own');
    const body = h('div', null,
      h('p', { class: 'hint' }, 'Your colours go on every theme except High Contrast. The words on them change only as much as it takes to stay readable.'),
      h('div', { class: 'customize-sample', inert: true }, // a picture of the colours: nothing in it can be pressed, focused or read out
        h('div', { class: 'panel' }, 'Sidebar'),
        h('div', { class: 'page' }, h('button', { type: 'button', class: 'primary' }, 'A button'), h('a', { href: '#/' }, 'A link'), h('span', { class: 'chip live' }, 'live'))),
      parts.map((part) => part.fieldset), note,
      h('div', { class: 'actions' }, reset, done));
    const dialog = AD.dialog('Customize Theme', body);
    dialog.id = 'customize';
    done.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      document.removeEventListener('ad:look', follow);
      window.desk.settings().then((saved) => AD.applyLook(saved)); // a colour that was only being tried does not stay
    });
    refresh();
  };
})();
