'use strict';
// Go to (Ctrl+K): a box over the page. Type a few letters to jump to a screen or a book, or start with > to run any command from the
// menus by name, so the menus can stay short. The layout and wording are RT Markdown Reader's quick open. It's a native dialog, so the
// page behind it can't be reached while it's open, Escape closes it, and focus goes back to where it was.
(() => {
  const { h } = AD;
  const { SCREENS } = window.ADScreens;
  const { prettyShortcut, readQuery, search } = window.ADPalette;

  const screens = SCREENS.map((screen) => ({ kind: 'screen', label: screen.label, detail: screen.early ? 'Screen · early' : 'Screen', hash: screen.hash }));

  // The letters that matched are marked, so it is clear why a result is there.
  const marked = (label, hits) => {
    const set = new Set(hits);
    return [...label].map((letter, at) => (set.has(at) ? h('b', null, letter) : letter));
  };

  AD.openPalette = (initial = '') => {
    const open = document.getElementById('palette');
    if (open) {
      const field = open.querySelector('input');
      field.value = initial;
      field.dispatchEvent(new Event('input'));
      field.focus();
      return;
    }

    let places = screens;
    let commands = null; // until the menus have been asked
    let shown = [];
    let selected = 0;

    const input = h('input', {
      id: 'palette-input', type: 'text', role: 'combobox', autocomplete: 'off', spellcheck: 'false', placeholder: 'Go to a screen or a book, or type > for a command…',
      'aria-label': 'Go to a screen or a book, or type > for a command', 'aria-autocomplete': 'list', 'aria-controls': 'palette-list', 'aria-expanded': 'true',
    });
    const list = h('ul', { id: 'palette-list', role: 'listbox', 'aria-label': 'Matches' });
    const status = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
    const hint = h('p', { class: 'palette-hint' }, 'Type to find a screen or a book · > for a command · ↑ ↓ Enter · Esc');
    const dialog = h('dialog', { class: 'palette', id: 'palette', 'aria-label': 'Go to' }, input, list, status, hint);

    const empty = () => {
      const { mode } = readQuery(input.value);
      if (mode === 'commands') return commands === null ? 'Loading commands…' : 'No matching commands.';
      return 'Nothing matches. Try fewer letters.';
    };

    function draw() {
      const { mode, text } = readQuery(input.value);
      shown = search(mode === 'commands' ? commands ?? [] : places, text);
      selected = Math.min(selected, Math.max(0, shown.length - 1));
      list.replaceChildren(...(shown.length
        ? shown.map(({ item, hits }, at) => h('li', {
          id: `palette-opt-${at}`, role: 'option', class: `palette-item kind-${item.kind}`, 'aria-selected': String(at === selected), onclick: () => choose(at),
        }, h('span', { class: 'pi-label' }, marked(item.label, hits)), h('span', { class: 'pi-detail' }, item.detail ?? '')))
        : [h('li', { class: 'palette-empty', role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false' }, empty())]));
      input.setAttribute('aria-activedescendant', shown.length ? `palette-opt-${selected}` : '');
      status.textContent = shown.length ? AD.plural(shown.length, 'match', 'matches') : empty();
      list.children[selected]?.scrollIntoView({ block: 'nearest' });
    }

    function choose(at) {
      const pick = shown[at]?.item;
      if (!pick) return;
      dialog.close();
      if (pick.kind === 'screen') location.hash = pick.hash ? `#/${pick.hash}` : '#/';
      else if (pick.kind === 'book') location.hash = `#/book/${encodeURIComponent(pick.id)}`;
      else window.desk.runCommand(pick.key);
    }

    input.addEventListener('input', () => { selected = 0; draw(); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(shown.length - 1, selected + 1); draw(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(0, selected - 1); draw(); }
      else if (event.key === 'Enter') { event.preventDefault(); choose(selected); }
      else if (event.key === 'Tab') event.preventDefault(); // the box is the only thing to reach while it is open
    });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }); // a click outside it
    dialog.addEventListener('close', () => dialog.remove());

    document.body.append(dialog);
    dialog.showModal();
    input.value = initial;
    draw();
    input.focus();

    // The books and the commands arrive a moment later, and the list fills in when they do.
    AD.call('books').then((rows) => {
      places = [...screens, ...rows.map((book) => ({ kind: 'book', label: book.title || 'Untitled', detail: [book.series_name, book.pen_name].filter(Boolean).join(' · ') || 'Book', id: book.id }))];
      draw();
    }).catch(() => { /* the screens are still there */ });
    window.desk.commands().then((list2) => {
      const state = (command) => (command.kind === 'checkbox' ? (command.checked ? 'On' : 'Off') : command.kind === 'radio' && command.checked ? 'Current' : '');
      commands = list2.map((command) => ({
        kind: 'command', key: command.key, label: command.label,
        detail: [command.path, prettyShortcut(command.accelerator, AD.platform), state(command)].filter(Boolean).join('  ·  '),
      }));
      draw();
    }).catch(() => { commands = []; draw(); });
  };
})();
