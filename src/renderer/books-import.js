'use strict';
// Bringing books in from a spreadsheet saved as CSV, such as a Notion export. Step one: show the app which column is which. Step two:
// see what it understood, fix any word it didn't know, and read the books it would make. Nothing changes until the last button.
(() => {
  const { h } = AD;
  const STATUSES = [['planned', 'Planned'], ['in progress', 'In progress'], ['live', 'Live'], ['pulled', 'Pulled'], ['being reworked', 'Being reworked']];
  const FORMATS = [['ebook', 'Ebook'], ['paperback', 'Paperback'], ['hardcover', 'Hardcover'], ['large print', 'Large print'], ['audiobook', 'Audiobook']];
  const cap = (text) => text[0].toUpperCase() + text.slice(1);
  const OUTCOME = { new: 'Will be added', exists: 'Already in your library', repeat: 'Repeat in this file', problem: "Can't be used" };

  AD.importBooks = async () => {
    let picked;
    try {
      const result = await window.desk.pickBooksFile();
      if (!result.ok) throw new Error(result.message);
      picked = result.value;
    } catch (problem) {
      AD.toast(problem.message);
      return;
    }
    if (!picked) return;
    openDialog(picked);
  };

  function openDialog(file) {
    const state = { step: 1, mapping: { ...file.guess }, options: { dateOrder: 'month-first', link: 'listing' }, maps: { status: {}, formats: {} }, plan: null, busy: false, error: '' };
    const body = h('div', { class: 'import-body' });
    const dialog = AD.dialog('Bring in your books', body, { wide: true });
    dialog.classList.add('import-dialog');

    const args = () => ({ id: file.id, mapping: state.mapping, options: state.options, maps: state.maps });
    const draw = () => {
      body.replaceChildren(...(state.step === 1 ? stepOne() : stepTwo()), state.error ? h('p', { class: 'error', role: 'alert' }, state.error) : null);
    };
    const fail = (problem) => { state.error = problem.message; state.busy = false; draw(); };

    // ---- Step one: which column is which ----
    function stepOne() {
      const choose = (key) => h('select', { id: `col-${key}`, onchange: (e) => { state.mapping[key] = e.target.value === '' ? null : Number(e.target.value); state.error = ''; draw(); } },
        h('option', { value: '' }, '(not in the file)'),
        file.headers.map((name, at) => h('option', { value: String(at), selected: state.mapping[key] === at }, name)));
      const sample = (key) => {
        const at = state.mapping[key];
        if (at == null) return h('span', { class: 'note' }, '');
        const values = file.sample.map((row) => row[at]).filter(Boolean).slice(0, 3);
        return h('span', { class: 'note' }, values.length ? values.join(' · ') : 'empty in the first rows');
      };
      return [
        h('p', { class: 'hint' }, `${file.fileName} has ${AD.plural(file.rowCount, 'row')}. Show the app which column holds what. It has made a guess, so just correct anything that's wrong.`),
        h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, ['In the app', 'Column in your file', 'What it holds'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, file.fields.map((f) => h('tr', null,
            h('th', { scope: 'row' }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
            h('td', null, choose(f.key)), h('td', null, sample(f.key))))))),
        h('div', { class: 'stack' },
          h('div', { class: 'field' }, h('label', { for: 'opt-date' }, 'Dates such as 3/1/2025 mean'),
            h('select', { id: 'opt-date', onchange: (e) => { state.options.dateOrder = e.target.value; } },
              h('option', { value: 'month-first', selected: state.options.dateOrder === 'month-first' }, 'March 1 (the month comes first)'),
              h('option', { value: 'day-first', selected: state.options.dateOrder === 'day-first' }, 'January 3 (the day comes first)')),
            h('p', { class: 'help' }, 'Dates written out, such as March 1, 2025, need no help.')),
          h('div', { class: 'field' }, h('label', { for: 'opt-link' }, 'An Amazon link'),
            h('select', { id: 'opt-link', onchange: (e) => { state.options.link = e.target.value; } },
              h('option', { value: 'listing', selected: state.options.link === 'listing' }, 'Make a KDP listing for the ebook, with its code'),
              h('option', { value: 'notes', selected: state.options.link === 'notes' }, 'Keep it in the notes')))),
        h('div', { class: 'actions' },
          h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'),
          h('button', { type: 'button', class: 'primary', disabled: state.mapping.title == null || state.busy, onclick: check }, 'Check what it found')),
      ];
    }

    async function check() {
      state.busy = true;
      state.error = '';
      try {
        state.plan = await AD.call('planBooksImport', args());
        state.step = 2;
        state.busy = false;
        draw();
      } catch (problem) { fail(problem); }
    }

    async function replan() {
      try {
        state.plan = await AD.call('planBooksImport', args());
        state.error = '';
        draw();
      } catch (problem) { fail(problem); }
    }

    // ---- Step two: what it understood ----
    function stepTwo() {
      const plan = state.plan;
      const n = plan.counts;
      const parts = [AD.plural(n.new, 'book')];
      const out = [h('p', null, h('strong', null, `${parts[0]} will be added.`), ' ',
        [n.exists && `${n.exists} already in your library`, n.repeat && `${n.repeat} repeated in the file`, n.problem && `${n.problem} can't be used`].filter(Boolean).join(', '))];

      const unknown = plan.unknown.statuses.length + plan.unknown.formats.length;
      if (unknown) out.push(h('p', { class: 'card check' }, `${AD.plural(unknown, 'word')} in your file ${unknown === 1 ? "isn't" : "aren't"} ones the app knows. Say what each means below, or it is left as Planned or left out.`));

      const statusRow = (s) => h('tr', { class: plan.unknown.statuses.includes(s.value) ? 'attention' : '' },
        h('td', null, s.value, h('span', { class: 'note' }, ` · ${AD.plural(s.rows, 'book')}`)),
        h('td', null, h('select', { 'aria-label': `What "${s.value}" means`, onchange: (e) => { state.maps.status[s.value] = e.target.value; replan(); } },
          [...STATUSES.map(([v, label]) => h('option', { value: v, selected: s.mapped === v }, label)), s.mapped ? null : h('option', { value: '', selected: true }, 'Planned (not known)')])));
      if (plan.statuses.length) {
        out.push(h('h3', null, 'Statuses in your file'),
          h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, [h('th', { scope: 'col' }, 'In your file'), h('th', { scope: 'col' }, 'In the app')])), h('tbody', null, plan.statuses.map(statusRow)))));
      }
      const formatRow = (f) => h('tr', { class: plan.unknown.formats.includes(f.value) ? 'attention' : '' },
        h('td', null, f.value, h('span', { class: 'note' }, ` · ${AD.plural(f.rows, 'book')}`)),
        h('td', null, h('select', { 'aria-label': `What "${f.value}" means`, onchange: (e) => { state.maps.formats[f.value] = e.target.value; replan(); } },
          [...FORMATS.map(([v, label]) => h('option', { value: v, selected: f.mapped === v }, label)), h('option', { value: '', selected: !f.mapped }, '(leave out)')])));
      if (plan.formats.length) {
        out.push(h('h3', null, 'Formats in your file'),
          h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, [h('th', { scope: 'col' }, 'In your file'), h('th', { scope: 'col' }, 'In the app')])), h('tbody', null, plan.formats.map(formatRow)))));
      }

      out.push(h('h3', null, 'The books'),
        h('div', { class: 'tablewrap import-list' }, h('table', null,
          h('thead', null, h('tr', null, ['Row', 'Title', 'Series', 'Status', 'Formats', 'Date', 'What happens'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, plan.rows.map((r) => h('tr', { class: r.outcome === 'new' ? '' : 'skipped' },
            h('td', { class: 'num' }, r.row), h('td', null, r.title || h('span', { class: 'note' }, '(none)')), h('td', null, r.series),
            h('td', null, r.status ? cap(r.status) : ''), h('td', null, r.formats.map(cap).join(', ')), h('td', null, r.releaseDate ?? ''),
            h('td', null, OUTCOME[r.outcome], r.reason && r.outcome !== 'exists' ? h('div', { class: 'note' }, r.reason) : null,
              r.warnings.map((w) => h('div', { class: 'note' }, w)))))))),
        plan.more ? h('p', { class: 'note' }, `…and ${AD.plural(plan.more, 'more row')}, which follow the same rules.`) : null);

      out.push(h('div', { class: 'actions' },
        h('button', { type: 'button', onclick: () => { state.step = 1; draw(); } }, 'Back'),
        h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { type: 'button', class: 'primary', disabled: !n.new || state.busy, onclick: accept }, n.new ? `Bring in ${AD.plural(n.new, 'book')}` : 'Nothing to bring in')));
      return out;
    }

    async function accept() {
      state.busy = true;
      try {
        const done = await AD.call('acceptBooksImport', args());
        dialog.close();
        AD.toast(`Brought in ${AD.plural(done.counts.books, 'book')}${done.counts.editions ? ` and ${AD.plural(done.counts.editions, 'edition')}` : ''}. You can undo it from Books.`);
        location.hash = '#/books';
        AD.refresh();
      } catch (problem) { fail(problem); }
    }

    draw();
  }

  // The imports so far, on the Books page, each with a way to take it back.
  AD.importsCard = async () => {
    const list = (await AD.call('booksImports')).filter((i) => i.status === 'accepted');
    if (!list.length) return null;
    return h('section', { class: 'card', 'aria-labelledby': 'imports-h' }, h('h2', { id: 'imports-h' }, 'Books you brought in'),
      h('ul', { class: 'list' }, list.map((i) => h('li', { class: 'row' },
        h('span', null, h('strong', null, i.fileName || 'A file'), h('span', { class: 'note' }, ` · ${AD.longDate(i.on)} · ${AD.plural(i.counts.books, 'book')}`)),
        h('button', { class: 'small', onclick: async () => {
          if (!(await AD.confirm(`This takes back the ${AD.plural(i.counts.books, 'book')} from ${i.fileName || 'this file'}, with their editions and listings. A book you've added to since is left alone.`, 'Undo the import'))) return;
          try {
            const result = await AD.call('undoBooksImport', { id: i.id });
            AD.toast(`Took back ${AD.plural(result.removed, 'book')}.${result.kept.length ? ` Kept ${result.kept.join(', ')}, because you've added to ${result.kept.length === 1 ? 'it' : 'them'}.` : ''}`);
            AD.refresh();
          } catch (problem) { AD.toast(problem.message); }
        } }, 'Undo')))));
  };
})();
