'use strict';
// Match your columns: a report from a store the app has no reader for. Step one: say which store it is from and show the app which column is
// which (it guesses first, and recognizes a layout it has kept). Step two: see what it would do, every row accounted for, and keep the columns
// for next time. Nothing is saved until the last button, and a cell that can't be read stops it and names the row.
(() => {
  const { h } = AD;
  const OUTCOMES = [
    ['imported', 'new rows to save'],
    ['duplicate', 'already in your library'],
    ['set aside', 'set aside'],
    ['not a sale', 'headings, empty lines, totals and notes'],
  ];

  AD.matchColumns = async () => {
    let picked;
    try {
      const result = await window.desk.pickColumnsFile();
      if (!result.ok) throw new Error(result.message);
      picked = result.value;
    } catch (problem) {
      AD.toast(problem.message);
      return;
    }
    if (!picked) return;
    const { stores } = await AD.call('names');
    openDialog(picked, stores.filter((s) => s.active !== 0));
  };

  function openDialog(file, stores) {
    const state = {
      step: 1, sheet: file.sheets[0], storeId: '', mapping: { ...file.sheets[0].guess }, headerRow: null, dateOrder: 'month-first', decimal: '.', currency: '', period: '',
      note: '', preview: null, remember: true, layoutName: '', busy: false, error: '',
    };
    const body = h('div', { class: 'import-body' });
    const dialog = AD.dialog('Match your columns', body, { wide: true });
    dialog.classList.add('import-dialog');

    // A layout kept for this file's headings fills the form in. One that has changed is said, with which columns.
    const apply = () => {
      const [first] = state.sheet.recognized;
      state.note = '';
      if (first) {
        Object.assign(state, { storeId: first.storeId, mapping: { ...first.mapping }, dateOrder: first.options.dateOrder, decimal: first.options.decimal, currency: first.options.currency ?? '', layoutName: first.name });
        // A layout known from a real report is said to be one, and what the report lacks is asked for.
        state.note = first.builtIn ? `This is the ${first.name}, so the columns are filled in. ${first.ask}` : `This looks like your layout "${first.name}" for ${first.storeName}, so the columns are filled in. Check them, then go on.`;
      } else if (state.sheet.changed.length) {
        const c = state.sheet.changed[0];
        state.note = `Your layout "${c.name}" for ${c.storeName} doesn't fit this file any more: no column called ${c.gone.map((g) => `"${g}"`).join(' or ')}${c.added.length ? ` (new: ${c.added.map((a) => `"${a}"`).join(', ')})` : ''}. Match the columns again, and the new layout replaces it.`;
        state.storeId = c.storeId;
        state.layoutName = c.name;
      }
    };
    apply();

    const fail = (problem) => { state.error = problem.message; state.busy = false; draw(); };
    const options = () => ({ headerRow: state.headerRow ?? state.sheet.headerRow, dateOrder: state.dateOrder, decimal: state.decimal, currency: state.currency, period: state.period });
    const args = () => ({ id: file.id, sheet: state.sheet.name, storeId: state.storeId, mapping: state.mapping, options: options(), remember: state.remember, layoutName: state.layoutName });

    const draw = () => {
      // A step lists its parts, some of them lists or nothing at all; what is not a part is left out, so "null" is never written on the page.
      const parts = (state.step === 1 ? stepOne() : stepTwo()).flat().filter(Boolean);
      body.replaceChildren(...parts, ...(state.error ? [h('p', { class: 'error', role: 'alert' }, state.error)] : []));
    };

    async function reread(sheet, headerRow) {
      try {
        state.sheet = await AD.call('columnsFor', { id: file.id, sheet, headerRow });
        state.headerRow = headerRow ?? null;
        state.mapping = { ...state.sheet.guess };
        state.error = '';
        apply();
      } catch (problem) { state.error = problem.message; }
      draw();
    }

    function stepOne() {
      const sheet = state.sheet;
      const choose = (field) => h('select', { id: `mc-${field.key}`, onchange: (e) => { state.mapping[field.key] = e.target.value === '' ? null : Number(e.target.value); state.error = ''; if (field.key === 'date') draw(); } },
        h('option', { value: '' }, '(not in the file)'),
        sheet.headers.map((name, i) => (name ? h('option', { value: String(i), selected: state.mapping[field.key] === i }, name) : null)));
      const row = (field) => h('div', { class: 'field' }, h('label', { for: `mc-${field.key}` }, field.label, field.required ? ' (needed)' : ''), choose(field));
      const select = (id, label, value, choices, onchange, help) => h('div', { class: 'field' }, h('label', { for: id }, label),
        h('select', { id, onchange: (e) => onchange(e.target.value) }, choices.map(([v, text]) => h('option', { value: v, selected: v === value }, text))), help ? h('p', { class: 'help' }, help) : null);

      const go = h('button', { type: 'button', class: 'primary', id: 'mc-go', disabled: state.busy, onclick: async () => {
        state.busy = true; state.error = ''; draw();
        try {
          state.preview = await AD.call('previewColumns', args());
          state.step = 2; state.busy = false; draw();
        } catch (problem) { fail(problem); }
      } }, 'See what this does');

      return [
        h('p', { class: 'hint' }, 'For a store the app has no reader for yet. Say which store this is, and which column is which. Nothing is saved until the last step.'),
        h('p', { class: 'note' }, `${file.fileName} · ${AD.plural(sheet.rowCount, 'row')}`),
        state.note ? h('p', { class: 'card check', role: 'status' }, state.note) : null,
        h('div', { class: 'row start' },
          select('mc-store', 'Which store is it from?', state.storeId, [['', '(choose)'], ...stores.map((s) => [s.id, s.name])], (v) => { state.storeId = v; state.error = ''; }),
          file.sheets.length > 1 ? select('mc-sheet', 'Which sheet holds the sales?', sheet.name, file.sheets.map((s) => [s.name, s.name]), (v) => reread(v, null)) : null),
        h('div', { class: 'field' }, h('label', { for: 'mc-header' }, 'The headings are on row'),
          h('input', { id: 'mc-header', type: 'text', inputmode: 'numeric', value: String(state.headerRow ?? sheet.headerRow ?? ''), onchange: (e) => reread(sheet.name, e.target.value.trim() ? Number(e.target.value) : null) }),
          h('p', { class: 'help' }, 'The first line with anything in it, unless you say otherwise. Change it if the report has a title above the headings.')),
        h('div', { class: 'tablewrap' }, h('table', { class: 'sample' },
          h('caption', { class: 'visually-hidden' }, 'The headings and the first rows of the file'),
          h('thead', null, h('tr', null, sheet.headers.map((name, i) => h('th', { scope: 'col' }, name || `Column ${i + 1}`)))),
          h('tbody', null, sheet.sample.map((cells) => h('tr', null, sheet.headers.map((_, i) => h('td', null, cells[i] ?? ''))))))),
        h('fieldset', { class: 'card' }, h('legend', null, 'Which column is which'), file.fields.map(row)),
        sheet.headers.length && state.mapping.date == null ? h('div', { class: 'field' }, h('label', { for: 'mc-period' }, 'The month this report covers'),
          h('input', { id: 'mc-period', type: 'month', value: state.period, onchange: (e) => { state.period = e.target.value; } }),
          h('p', { class: 'help' }, 'The report has no date column, so every row is put in this month.')) : null,
        h('div', { class: 'row start' },
          h('div', { class: 'field' }, h('label', { for: 'mc-fixed-currency' }, 'Currency of the whole file'), h('input', { id: 'mc-fixed-currency', type: 'text', maxlength: '3', value: state.currency, onchange: (e) => { state.currency = e.target.value.trim().toUpperCase(); } }),
            h('p', { class: 'help' }, 'Only if there is no currency column, such as USD.')),
          select('mc-order', 'A date such as 03/04/2026 is', state.dateOrder, [['month-first', 'March 4 (month first)'], ['day-first', '3 April (day first)']], (v) => { state.dateOrder = v; }),
          select('mc-decimal', 'A number is written', state.decimal, [['.', '1,234.56'], [',', '1.234,56']], (v) => { state.decimal = v; })),
        h('div', { class: 'actions' }, h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'), go),
      ];
    }

    function stepTwo() {
      const p = state.preview;
      const remember = h('input', { type: 'checkbox', id: 'mc-remember', checked: state.remember, onchange: (e) => { state.remember = e.target.checked; draw(); } });
      const name = h('input', { type: 'text', id: 'mc-name', value: state.layoutName || `${p.store} report`, onchange: (e) => { state.layoutName = e.target.value; } });
      const go = h('button', { type: 'button', class: 'primary', id: 'mc-import', disabled: state.busy || Boolean(p.alreadyImported), onclick: async () => {
        state.busy = true; state.error = ''; draw();
        try {
          // The choice of keeping the layout, and its name, were made after the preview, so it is read again with them before it is accepted.
          state.layoutName = name.value;
          const again = await AD.call('previewColumns', args());
          const done = await AD.call('acceptReport', { previewId: again.previewId });
          dialog.close();
          AD.toast(`Imported ${AD.plural(done.newRows, 'row')}${done.layoutKept ? ', and kept the columns for next time' : ''}.`);
          AD.refresh();
        } catch (problem) { fail(problem); }
      } }, 'Import');
      return [
        h('p', null, h('strong', null, p.store), ' · ', p.kindLabel),
        h('p', { class: 'note' }, p.fileName),
        p.alreadyImported ? h('p', { class: 'error', role: 'alert' }, `You already imported this exact file on ${AD.longDate(p.alreadyImported.on)}. There is nothing to do.`) : null,
        p.period ? h('p', null, `${AD.longDate(p.period.start)} to ${AD.longDate(p.period.end)}`) : null,
        h('p', null, `${AD.plural(p.rowsInFile, 'row')} in the file. Every one is accounted for:`),
        h('ul', { class: 'plain' }, OUTCOMES.filter(([key]) => p.counts[key]).map(([key, text]) => h('li', null, `${p.counts[key]} ${text}`))),
        p.totals.length ? h('p', null, 'What you earned adds up to ', p.totals.map((t, i) => [i ? ' and ' : '', h('strong', { class: 'mono' }, t.shown)]), '. Each currency is kept on its own.') : null,
        p.notes.map((note) => h('p', { class: 'card check' }, note)),
        p.needsMatching.length ? h('p', { class: 'note' }, `${AD.plural(p.needsMatching.length, 'item')} can't be matched to a book yet. They're kept, and you'll be asked about each one once.`) : null,
        h('div', { class: 'field check' }, remember, h('label', { for: 'mc-remember' }, 'Keep these columns, so the next report from this store is read the same way')),
        state.remember ? h('div', { class: 'field' }, h('label', { for: 'mc-name' }, 'What to call this layout'), name) : null,
        h('div', { class: 'actions' }, h('button', { type: 'button', id: 'mc-back', onclick: () => { state.step = 1; state.error = ''; draw(); } }, 'Back'), go),
      ];
    }

    draw();
  }
})();
