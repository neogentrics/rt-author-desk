'use strict';
// The router: the address after # picks the screen, and every screen is a function in AD.routes that returns what to show.
(() => {
  const { h } = AD;
  const view = document.getElementById('view');
  const nav = document.getElementById('nav');
  let drawing = 0;
  let lastHash = null;

  // The sidebar, the View menu and Go to all read the same list of screens.
  const { SCREENS } = window.ADScreens;
  const LINKS = SCREENS.map((screen) => [screen.hash, screen.label]);
  const EARLY = new Set(SCREENS.filter((screen) => screen.early).map((screen) => screen.hash));

  function where() {
    const [, name = '', id] = (location.hash || '#/').split('/');
    return { name: name === 'book' || LINKS.some(([key]) => key === name) ? name : '', id: id ? decodeURIComponent(id) : null };
  }

  function drawNav(current, problems, binned = 0) {
    const section = current === 'book' ? 'books' : current;
    nav.replaceChildren(...LINKS.map(([key, text]) => h('li', null,
      h('a', { href: `#/${key}`, 'aria-current': key === section ? 'page' : null },
        text, key === 'clashes' && problems ? h('span', { class: 'count', 'aria-label': `${problems} to fix` }, problems) : null,
        key === 'trash' && binned ? h('span', { class: 'tally', 'aria-label': `${binned} in the Trash` }, binned) : null,
        // Money is the next release's work, started early. It is real and tested, and it says so.
        EARLY.has(key) ? h('span', { class: 'tally', title: 'Early: part of the next release, the money' }, 'early') : null))));
  }

  AD.refresh = async function refresh() {
    const mine = ++drawing;
    const { name, id } = where();
    const moved = location.hash !== lastHash;
    lastHash = location.hash;
    try {
      const [content, clashes, binned] = await Promise.all([AD.routes[name](id), AD.call('clashes'), AD.call('trash')]);
      if (mine !== drawing) return; // a newer draw has started, so this one is out of date
      drawNav(name, clashes.filter((c) => c.severity === 'problem').length, binned.length);
      view.replaceChildren(...[].concat(content).filter(Boolean)); // a screen may leave a section out as null
      if (moved) {
        view.scrollTo(0, 0);
        view.focus();
      }
      document.title = `${view.querySelector('h1')?.textContent || 'RT Author Desk'} · RT Author Desk`;
    } catch (problem) {
      if (mine !== drawing) return;
      drawNav(name, 0);
      view.replaceChildren(h('h1', null, 'That did not work'), h('p', { class: 'error', role: 'alert' }, problem.message),
        h('p', null, h('a', { href: '#/' }, 'Back to the Desk')));
    }
  };

  window.addEventListener('hashchange', AD.refresh);

  // The menu bar names what to do, and this does it.
  window.desk.onMenu((name, where) => {
    if (name === 'preferences') AD.openPreferences();
    else if (name === 'help') AD.openHelp(where);
    else if (name === 'tour') AD.startTour();
    else if (name === 'update-status') { AD.state.update = where; AD.drawBars(); }
    else if (name === 'new-book') AD.addBook();
    else if (name === 'import-books') AD.importBooks();
    else if (name === 'export-all') AD.exportAll();
    else if (name === 'backup-now') AD.backUpNow();
    else if (name === 'palette') AD.openPalette(where ?? '');
    else if (name === 'look') {
      // The look was changed from the menu, so the page follows it, and so does Preferences if it is open.
      AD.applyLook(where);
      document.dispatchEvent(new CustomEvent('ad:look', { detail: where }));
    } else if (name === 'go') {
      const screen = SCREENS.find((item) => item.key === where);
      if (screen) location.hash = screen.hash ? `#/${screen.hash}` : '#/';
    }
  });

  (async () => {
    // How it looks comes first, so nothing is drawn in the wrong colours.
    let settings = null;
    try {
      settings = await window.desk.settings();
      AD.applyLook(settings);
    } catch { /* the stylesheet's own colours are fine */ }
    try {
      const info = await window.desk.info();
      const { library } = info;
      AD.platform = info.platform;
      AD.state.update = info.update ?? AD.state.update;
      AD.state.sample = Boolean(info.sample);
      AD.drawBars();
      if (!library.ok) {
        drawNav('', 0);
        view.replaceChildren(h('h1', null, 'Your library could not be opened'), h('p', { class: 'error', role: 'alert' }, library.message),
          h('p', { class: 'note' }, 'Nothing has been changed. Your files are still where they were.'));
        return;
      }
    } catch (problem) {
      view.replaceChildren(h('h1', null, 'Something went wrong'), h('p', { class: 'error', role: 'alert' }, problem.message));
      return;
    }
    await AD.refresh();
    if (!AD.state.sample) AD.maybeWelcome(settings);
  })();
})();
