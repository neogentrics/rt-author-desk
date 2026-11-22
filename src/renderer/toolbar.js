'use strict';
// The toolbar: icon buttons for what is done most, each with a name that shows when you hover and is read out by a screen reader, and the
// theme button with its pop-up, where it can be reached from every screen. Everything else is in the menus, and any command can be found
// by name from Go to (Ctrl+K, then >). The layout is RT Markdown Reader's. The pop-up is the browser's own (popover), so it closes on
// Escape or a click outside, and the focus goes back to the button.
(() => {
  const { h } = AD;
  const { THEMES } = window.ADThemes;
  const { prettyShortcut } = window.ADPalette;
  const bar = document.getElementById('toolbar');
  const top = document.getElementById('top');

  // One name for the screen reader and for hover, and the shortcut when there is one. A button with its own words keeps just those.
  const tool = ({ id, name, accelerator, icon, onclick, text, primary }) => h('button', {
    type: 'button', id, class: `tb-btn${primary ? ' primary' : ''}`, onclick,
    title: accelerator ? `${name} (${prettyShortcut(accelerator, AD.platform)})` : name,
    'aria-label': text ? null : name,
  }, AD.icon(icon), text ? h('span', null, text) : null);

  function themePopup() {
    const select = h('select', { id: 'tb-theme', autofocus: true, onchange: (e) => AD.setLook({ theme: e.target.value }) },
      AD.themeChoices().map(([key, label]) => h('option', { value: key }, label)));
    const solid = h('button', { type: 'button', class: 'seg-btn', id: 'tb-solid', onclick: () => AD.setLook({ glass: false }) }, 'Solid');
    const glass = h('button', { type: 'button', class: 'seg-btn', id: 'tb-glass', onclick: () => AD.setLook({ glass: true }) }, 'Glass');
    const safe = h('input', { id: 'tb-safe', type: 'checkbox', onchange: (e) => AD.setLook({ colorSafe: e.target.checked }) });
    const note = h('p', { class: 'help', id: 'tb-glass-note' });
    const popup = h('div', { id: 'theme-pop', class: 'popover', popover: 'auto', 'aria-label': 'Theme and look' },
      h('div', { class: 'field' }, h('label', { for: 'tb-theme' }, 'Theme'), select),
      h('div', { class: 'field', role: 'group', 'aria-labelledby': 'tb-look-label' },
        h('span', { id: 'tb-look-label', class: 'label' }, 'Look'), h('span', { class: 'seg' }, solid, glass), note),
      h('div', { class: 'field check' }, safe, h('label', { for: 'tb-safe' }, 'Colour-safe colours')),
      h('p', { class: 'row start' }, h('button', { type: 'button', class: 'link', id: 'tb-more', onclick: () => { popup.hidePopover(); AD.openPreferences(); } }, 'All appearance settings…')));

    // Shows the look as it is now, whenever the pop-up opens and whenever something changes it.
    const show = () => {
      const look = AD.currentLook();
      if (!look) return;
      select.value = look.theme;
      solid.setAttribute('aria-pressed', String(!look.glass));
      glass.setAttribute('aria-pressed', String(Boolean(look.glass)));
      const flat = Boolean(THEMES[AD.themeName(look)].flat);
      glass.disabled = flat;
      note.textContent = flat ? 'High Contrast stays solid, because frosted colour would only make it harder to read.' : '';
      safe.checked = Boolean(look.colorSafe);
    };
    popup.addEventListener('toggle', show);
    document.addEventListener('ad:look', show);
    return popup;
  }

  AD.drawToolbar = () => {
    bar.replaceChildren(
      h('span', { class: 'tb-group' },
        tool({ id: 'tb-goto', name: 'Go to a screen, a book or a command', accelerator: 'CmdOrCtrl+K', icon: 'search', onclick: () => AD.openPalette() }),
        tool({ id: 'tb-new', name: 'New Book', accelerator: 'CmdOrCtrl+N', icon: 'plus', text: 'New Book', primary: true, onclick: () => AD.addBook() }),
        tool({ id: 'tb-import', name: 'Bring in books from a file', accelerator: 'CmdOrCtrl+Shift+I', icon: 'import', onclick: () => AD.importBooks() })),
      h('span', { class: 'tb-spacer' }),
      h('span', { class: 'tb-group' },
        h('button', { type: 'button', id: 'theme-button', class: 'tb-btn', title: 'Theme and look', 'aria-label': 'Theme and look', popovertarget: 'theme-pop' }, AD.icon('theme')),
        tool({ id: 'tb-prefs', name: 'Preferences', accelerator: 'Ctrl+,', icon: 'preferences', onclick: () => AD.openPreferences() }),
        tool({ id: 'tb-help', name: 'Help Center', accelerator: 'F1', icon: 'help', onclick: () => AD.openHelp() })),
      themePopup());
  };

  // The sidebar sits below the bars and the toolbar, whatever height they come to (the toolbar can wrap when the window is narrow).
  const keepBelow = () => document.documentElement.style.setProperty('--bars-h', `${top.offsetHeight}px`);
  new ResizeObserver(keepBelow).observe(top);

  AD.drawToolbar();
  keepBelow();
})();
