'use strict';
// Preferences: how the app looks. Everything changes the moment it's picked, so there is nothing to apply and nothing to lose.
// The themes, Glass and colour-safe colours are the suite's, and so is this way of doing it (RT Story Tracker).
(() => {
  const { h } = AD;
  const { BACKUP_EVERY, DEFAULT_SETTINGS, LIMITS, THEMES, UI_FONTS } = window.ADThemes;

  // Everything out: the library as JSON, a spreadsheet for each kind of thing, and each original report, in a new folder.
  AD.exportAll = async () => {
    try {
      const result = await window.desk.exportAll();
      if (!result.ok) throw new Error(result.message);
      if (!result.value) return;
      const { counts, reports } = result.value;
      AD.toast(`Exported ${AD.plural(counts.books, 'book')}, ${AD.plural(counts.editions, 'edition')} and ${AD.plural(counts.listings, 'listing')}${reports ? `, and ${AD.plural(reports, 'report')}` : ''}. The folder is open.`);
    } catch (problem) {
      AD.toast(problem.message);
    }
  };

  // Backs up now, from the File menu or Go to, without opening Preferences unless a folder is still to be chosen.
  AD.backUpNow = async () => {
    try {
      const status = await window.desk.backupStatus();
      if (!status.ok) throw new Error(status.message);
      if (!status.value.folder) {
        AD.toast('Choose a folder for your backups first.');
        AD.openPreferences();
        return;
      }
      AD.toast('Backing up…');
      const result = await window.desk.backupNow();
      if (!result.ok) throw new Error(result.message);
      AD.toast(`Backed up to ${result.value.file}.`);
    } catch (problem) {
      AD.toast(problem.message);
    }
  };

  AD.openPreferences = async () => {
    document.getElementById('preferences')?.remove();
    let settings = await window.desk.settings();
    // Every change goes through setLook, which tells the page, the menu and anything else showing the look. This window follows it below.
    const change = async (changes) => { await AD.setLook(changes); };

    const field = (label, control, help) => h('div', { class: 'field' }, h('label', { for: control.id }, label), control, help ? h('p', { class: 'help' }, help) : null);
    const options = (table, extra = {}) => [...Object.entries(extra), ...Object.entries(table)].map(([key, item]) => h('option', { value: key }, item.label));
    const themeSelect = h('select', { id: 'pref-theme', onchange: (e) => change({ theme: e.target.value }) }, AD.themeChoices().map(([key, label]) => h('option', { value: key }, label)));
    const fontSelect = h('select', { id: 'pref-font', onchange: (e) => change({ uiFont: e.target.value }) }, options(UI_FONTS));
    const glass = h('input', { id: 'pref-glass', type: 'checkbox', onchange: (e) => change({ glass: e.target.checked }) });
    const safe = h('input', { id: 'pref-safe', type: 'checkbox', onchange: (e) => change({ colorSafe: e.target.checked }) });
    const [low, high] = LIMITS.textSize;
    const size = h('input', { id: 'pref-size', type: 'range', min: String(low), max: String(high), step: '1' });
    size.addEventListener('input', () => change({ textSize: Number(size.value) }));
    const sizeText = h('output', { for: 'pref-size' });
    const glassHelp = h('p', { class: 'help' });

    // ---- Backups ----
    const folder = h('span', { class: 'backup-folder' });
    const every = h('select', { id: 'pref-backup-every', onchange: (e) => change({ backupEvery: e.target.value }) }, options(BACKUP_EVERY));
    const keep = h('input', { id: 'pref-backup-keep', type: 'number', min: String(LIMITS.backupKeep[0]), max: String(LIMITS.backupKeep[1]), onchange: (e) => change({ backupKeep: Number(e.target.value) }) });
    const note = h('p', { class: 'help', role: 'status' });
    const showBackups = async () => {
      folder.textContent = settings.backupFolder || 'No folder chosen yet';
      every.value = settings.backupEvery;
      keep.value = String(settings.backupKeep);
      try {
        const { ok, value, message } = await window.desk.backupStatus();
        if (!ok) throw new Error(message);
        note.textContent = value.error ? `The last backup had a problem. ${value.error}` : value.last ? `Last backup: ${new Date(value.last).toLocaleString()}` : 'No backups yet.';
      } catch (problem) {
        note.textContent = problem.message;
      }
    };
    const chooseFolder = async () => {
      const result = await window.desk.chooseBackupFolder();
      if (!result.ok) { note.textContent = result.message; return; }
      settings = result.value;
      showBackups();
    };
    const backupNow = async () => {
      note.textContent = 'Backing up…';
      const result = await window.desk.backupNow();
      if (result.ok) await showBackups();
      else note.textContent = result.message;
    };
    const restore = async () => {
      const picked = await window.desk.pickBackup();
      if (!picked.ok) { note.textContent = picked.message; return; }
      if (!picked.value) return;
      const b = picked.value;
      const made = new Date(b.createdAt).toLocaleString();
      const yes = await AD.confirm(`This backup was made ${made}${b.version ? ` by version ${b.version}` : ''}. It holds ${AD.plural(b.holds.books, 'book')}, ${AD.plural(b.holds.editions, 'edition')} and ${AD.plural(b.holds.listings, 'listing')}. Restoring replaces your library with it, and the app starts again. Your library as it is now is not deleted: it is kept in a folder beside it, so a restore can be undone.`, 'Restore and restart');
      if (!yes) return;
      const done = await window.desk.restoreBackup();
      if (!done.ok) note.textContent = done.message;
    };

    // The look can also be changed from the View menu while this is open.
    const followMenu = (event) => { settings = event.detail; refresh(); };
    document.addEventListener('ad:look', followMenu);

    const refresh = () => {
      themeSelect.value = settings.theme;
      fontSelect.value = settings.uiFont;
      glass.checked = settings.glass;
      safe.checked = settings.colorSafe;
      size.value = String(settings.textSize);
      sizeText.textContent = `${settings.textSize} px${settings.textSize === DEFAULT_SETTINGS.textSize ? ' (usual)' : ''}`;
      const flat = THEMES[AD.themeName(settings)].flat;
      glass.disabled = Boolean(flat);
      showBackups();
      glassHelp.textContent = flat ? 'High Contrast stays solid, because frosted colour would only make it harder to read.' : 'Frosted panels over colour, with any theme but High Contrast.';
    };

    const dialog = AD.dialog('Preferences', h('div', null,
      h('div', { class: 'prefs-sample', inert: true }, // a picture of the colours: nothing in it can be pressed, focused or read out
        h('span', { class: 'chip live' }, 'live'), h('span', { class: 'chip check' }, 'check'), h('span', { class: 'chip problem' }, 'fix'),
        h('button', { class: 'primary', type: 'button' }, 'A button'), h('a', { href: '#/' }, 'A link')),
      h('section', null,
        h('h3', null, 'Look'),
        field('Theme', themeSelect, 'The same themes as the other Recon Towers apps.'),
        h('div', { class: 'field check' }, glass, h('label', { for: 'pref-glass' }, 'Glass'), glassHelp),
        h('div', { class: 'field check' }, safe, h('label', { for: 'pref-safe' }, 'Colour-safe colours'),
          h('p', { class: 'help' }, 'Blue, orange and purple instead of green, amber and red, so they stay apart with colour blindness.')),
        h('p', { class: 'row start' }, h('button', { type: 'button', id: 'pref-customize', onclick: () => { dialog.close(); AD.openCustomize(); } }, 'Customize Theme…'),
          h('span', { class: 'help' }, 'Your own accent, panel and background colours.'))),
      h('section', null,
        h('h3', null, 'Text'),
        field('Font', fontSelect, 'Atkinson Hyperlegible is made to be easier to read.'),
        h('div', { class: 'field' }, h('label', { for: 'pref-size' }, 'Text size'), h('div', { class: 'prefs-range' }, size, sizeText))),
      h('section', null,
        h('h3', null, 'Backups'),
        h('p', { class: 'help' }, 'A backup is one closed file with your whole library in it, still encrypted, so it is safe in OneDrive or Dropbox. Nothing is backed up until you choose a folder.'),
        h('div', { class: 'row start' }, folder, h('button', { type: 'button', id: 'backup-choose', onclick: chooseFolder }, 'Choose folder…')),
        field('How often', every, 'A backup is only made when something has changed.'),
        field('Keep the newest', keep, 'Older backups in that folder are removed. Only files this app made are ever touched.'),
        h('div', { class: 'row start' }, h('button', { type: 'button', id: 'backup-now', onclick: backupNow }, 'Back up now'), h('button', { type: 'button', id: 'backup-restore', onclick: restore }, 'Restore from a backup…')),
        note),
      h('section', null,
        h('h3', null, 'Get it all out'),
        h('p', { class: 'help' }, 'Everything you have entered, as one JSON file and a spreadsheet for each kind of thing, and each report you imported as it was. It goes into a new folder inside the one you choose. Nothing secret is in it.'),
        h('div', { class: 'row start' }, h('button', { type: 'button', id: 'export-all', onclick: AD.exportAll }, 'Export everything…'))),
      h('div', { class: 'actions' },
        h('button', { type: 'button', onclick: () => change({ theme: DEFAULT_SETTINGS.theme, glass: DEFAULT_SETTINGS.glass, colorSafe: DEFAULT_SETTINGS.colorSafe, uiFont: DEFAULT_SETTINGS.uiFont, textSize: DEFAULT_SETTINGS.textSize, brand: DEFAULT_SETTINGS.brand }) }, 'Back to the usual'),
        h('button', { type: 'button', class: 'primary', onclick: () => dialog.close() }, 'Done'))));
    dialog.id = 'preferences';
    dialog.addEventListener('close', () => document.removeEventListener('ad:look', followMenu));
    refresh();
  };
})();
