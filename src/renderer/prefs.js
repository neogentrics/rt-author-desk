'use strict';
// Preferences: how the app looks. Everything changes the moment it's picked, so there is nothing to apply and nothing to lose.
// The themes, Glass and colour-safe colours are the suite's, and so is this way of doing it (RT Story Tracker).
(() => {
  const { h } = AD;
  const { DEFAULT_SETTINGS, LIMITS, THEMES, UI_FONTS } = window.ADThemes;

  AD.openPreferences = async () => {
    document.getElementById('preferences')?.remove();
    let settings = await window.desk.settings();
    const change = async (changes) => {
      settings = await window.desk.saveSettings(changes);
      AD.applyLook(settings);
      refresh();
    };

    const field = (label, control, help) => h('div', { class: 'field' }, h('label', { for: control.id }, label), control, help ? h('p', { class: 'help' }, help) : null);
    const options = (table, extra = {}) => [...Object.entries(extra), ...Object.entries(table)].map(([key, item]) => h('option', { value: key }, item.label));
    const themeSelect = h('select', { id: 'pref-theme', onchange: (e) => change({ theme: e.target.value }) }, options(THEMES, { system: { label: 'Same as this computer' } }));
    const fontSelect = h('select', { id: 'pref-font', onchange: (e) => change({ uiFont: e.target.value }) }, options(UI_FONTS));
    const glass = h('input', { id: 'pref-glass', type: 'checkbox', onchange: (e) => change({ glass: e.target.checked }) });
    const safe = h('input', { id: 'pref-safe', type: 'checkbox', onchange: (e) => change({ colorSafe: e.target.checked }) });
    const [low, high] = LIMITS.textSize;
    const size = h('input', { id: 'pref-size', type: 'range', min: String(low), max: String(high), step: '1' });
    size.addEventListener('input', () => change({ textSize: Number(size.value) }));
    const sizeText = h('output', { for: 'pref-size' });
    const glassHelp = h('p', { class: 'help' });

    const refresh = () => {
      themeSelect.value = settings.theme;
      fontSelect.value = settings.uiFont;
      glass.checked = settings.glass;
      safe.checked = settings.colorSafe;
      size.value = String(settings.textSize);
      sizeText.textContent = `${settings.textSize} px${settings.textSize === DEFAULT_SETTINGS.textSize ? ' (usual)' : ''}`;
      const flat = THEMES[AD.themeName(settings)].flat;
      glass.disabled = Boolean(flat);
      glassHelp.textContent = flat ? 'High Contrast stays solid, because frosted colour would only make it harder to read.' : 'Frosted panels over colour, with any theme but High Contrast.';
    };

    const dialog = AD.dialog('Preferences', h('div', null,
      h('div', { class: 'prefs-sample', 'aria-label': 'A sample of the colours' },
        h('span', { class: 'chip live' }, 'live'), h('span', { class: 'chip check' }, 'check'), h('span', { class: 'chip problem' }, 'fix'),
        h('button', { class: 'primary', type: 'button' }, 'A button'), h('a', { href: '#/' }, 'A link')),
      h('section', null,
        h('h3', null, 'Look'),
        field('Theme', themeSelect, 'The same themes as the other Recon Towers apps.'),
        h('div', { class: 'field check' }, glass, h('label', { for: 'pref-glass' }, 'Glass'), glassHelp),
        h('div', { class: 'field check' }, safe, h('label', { for: 'pref-safe' }, 'Colour-safe colours'),
          h('p', { class: 'help' }, 'Blue, orange and purple instead of green, amber and red, so they stay apart with colour blindness.'))),
      h('section', null,
        h('h3', null, 'Text'),
        field('Font', fontSelect, 'Atkinson Hyperlegible is made to be easier to read.'),
        h('div', { class: 'field' }, h('label', { for: 'pref-size' }, 'Text size'), h('div', { class: 'prefs-range' }, size, sizeText))),
      h('div', { class: 'actions' },
        h('button', { type: 'button', onclick: () => change(DEFAULT_SETTINGS) }, 'Back to the usual'),
        h('button', { type: 'button', class: 'primary', onclick: () => dialog.close() }, 'Done'))));
    dialog.id = 'preferences';
    refresh();
  };
})();
