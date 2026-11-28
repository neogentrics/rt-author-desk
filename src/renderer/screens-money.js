'use strict';
// Money: bring in a store's report, match what can't be matched, and see what was earned against what was paid.
(() => {
  const { h } = AD;
  const monthName = (period) => new Date(`${period}-15T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  const OUTCOMES = [
    ['imported', 'new rows to save'],
    ['replaced', 'already here and now paid, to be updated'],
    ['duplicate', 'already here, or repeated on another sheet'],
    ['set aside', 'set aside'],
    ['not a sale', 'headings, totals and definitions'],
  ];

  // A reader's question: which payee is you, and which way a date is written. Answering reads the file again.
  function questions(preview, replace) {
    const { payees, dateOrder } = preview.ask;
    const boxes = (payees ?? []).map((p, i) => {
      const box = h('input', { type: 'checkbox', id: `payee-${i}`, checked: p.chosen });
      return { name: p.name, box, row: h('div', { class: 'field check' }, box, h('label', { for: `payee-${i}` }, `${p.name} (${AD.plural(p.rows, 'line')})`)) };
    });
    const order = dateOrder ? h('select', { id: 'report-date-order' },
      [['', '(choose)'], ['month-first', 'Month first'], ['day-first', 'Day first']].map(([v, text]) => h('option', { value: v, selected: v === (dateOrder.chosen ?? '') }, text))) : null;
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const say = (text) => { error.textContent = text; error.hidden = false; };
    const use = h('button', { type: 'button', id: 'report-answer', class: preview.needs ? 'primary' : '' }, preview.needs ? 'Go on' : 'Use this choice');
    use.addEventListener('click', async () => {
      const mine = boxes.filter((b) => b.box.checked).map((b) => b.name);
      if (boxes.length && !mine.length) { say('Tick the payee that is you.'); return; }
      if (order && !order.value) { say('Say whether the month or the day comes first.'); return; }
      use.disabled = true;
      try {
        replace(await AD.call('reviewReport', { previewId: preview.previewId, ...(boxes.length ? { payees: mine } : {}), ...(order ? { dateOrder: order.value } : {}) }));
      } catch (problem) {
        say(problem.message);
        use.disabled = false;
      }
    });
    return h('div', { class: 'card check stack' },
      boxes.length ? h('fieldset', null, h('legend', null, 'Which payee is you?'),
        h('p', { class: 'note' }, "A sale with more than one payee is in the report once for each. Only your lines are saved. Tick every name that is you."),
        boxes.map((b) => b.row)) : null,
      order ? h('div', { class: 'field' }, h('label', { for: 'report-date-order' }, `In this report, is the date "${dateOrder.example}" written month first or day first?`), order) : null,
      error, use);
  }

  // What the file holds, before anything is saved. A report whose own total doesn't match its rows can only be taken in
  // by someone who says they know, and the mismatch stays on it afterwards.
  function showPreview(preview) {
    const know = h('input', { type: 'checkbox', id: 'know' });
    const go = h('button', { type: 'button', class: 'primary', id: 'report-import', disabled: Boolean(preview.needs) || preview.problems.length > 0 || Boolean(preview.alreadyImported) }, 'Import');
    if (preview.problems.length) know.addEventListener('change', () => { go.disabled = !know.checked; });
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const dialog = AD.dialog('Import this report?', h('div', { class: 'stack' },
      h('p', null, h('strong', null, preview.store), ' · ', preview.kindLabel),
      h('p', { class: 'note' }, preview.fileName),
      preview.alreadyImported ? h('p', { class: 'error', role: 'alert' }, `You already imported this exact file on ${AD.longDate(preview.alreadyImported.on)}. There is nothing to do.`) : null,
      preview.ask && !preview.alreadyImported ? questions(preview, (next) => { dialog.close(); showPreview(next); }) : null,
      preview.period ? h('p', null, `${AD.longDate(preview.period.start)} to ${AD.longDate(preview.period.end)}`) : null,
      preview.needs ? null : h('p', null, `${AD.plural(preview.rowsInFile, 'row')} in the file. Every one is accounted for:`),
      h('ul', { class: 'plain' }, OUTCOMES.filter(([key]) => preview.counts[key]).map(([key, text]) => h('li', null, `${preview.counts[key]} ${text}`))),
      preview.totals.length ? h('p', null, preview.totalsNote ? 'The sales add up to ' : 'The report adds up to ', preview.totals.map((t, i) => [i ? ' and ' : '', h('strong', { class: 'mono' }, t.shown)]), `. ${preview.totalsNote ?? "These are the store's estimates until a payment report covers them."}`) : null,
      preview.notes.map((note) => h('p', { class: 'note' }, note)),
      preview.needsMatching.length ? h('p', { class: 'note' }, `${AD.plural(preview.needsMatching.length, 'item')} can't be matched to a book yet. They're kept, and you'll be asked about each one once.`) : null,
      preview.problems.length ? h('div', { class: 'card problem' },
        h('h3', null, "This report doesn't add up"),
        preview.problems.map((p) => h('p', null, p)),
        h('div', { class: 'field check' }, know, h('label', { for: 'know' }, "I know. Import it anyway, and keep a note on it that the totals didn't match."))) : null,
      error,
      h('div', { class: 'actions' }, h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'), go)));
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        const done = await AD.call('acceptReport', { previewId: preview.previewId, knowingMismatch: know.checked });
        dialog.close();
        AD.toast(`Imported ${AD.plural(done.newRows, 'row')}${done.updatedRows ? `, and updated ${done.updatedRows} now paid` : ''}.`);
        AD.refresh();
      } catch (problem) {
        error.textContent = problem.message;
        error.hidden = false;
        go.disabled = false;
      }
    });
  }

  AD.showReportPreview = showPreview;

  async function choose() {
    try {
      const result = await window.desk.pickReport();
      if (!result.ok) throw new Error(result.message);
      if (result.value) showPreview(result.value);
    } catch (problem) {
      AD.toast(problem.message);
    }
  }

  async function match(item, editions) {
    const saved = await AD.form({
      title: `Which book is ${item.storeItem}?`,
      hint: `${item.title} · ${AD.plural(item.rows, 'row')}. You'll only be asked once.`,
      fields: [{ name: 'editionId', label: 'Edition', type: 'select', options: editions.map((e) => ({ value: e.id, label: e.label })), blank: '(choose)', required: true }],
      submit: 'Match',
      onSubmit: ({ editionId }) => AD.call('matchItem', { storeId: item.storeId, storeItem: item.storeItem, editionId }),
    });
    if (saved) AD.refresh();
  }

  AD.routes.money = async () => {
    const [earnings, imports, matching, readers, editions] = await Promise.all([
      AD.call('earnings'), AD.call('imports'), AD.call('needsMatching'), AD.call('readers'), AD.call('editionChoices'),
    ]);
    const out = [
      h('div', { class: 'row' }, h('h1', null, 'Money'), h('span', { class: 'row start' }, h('button', { class: 'primary', onclick: choose }, 'Import a report'), h('button', { type: 'button', id: 'match-columns', onclick: () => AD.matchColumns() }, 'Match your columns…'))),
      h('p', { class: 'lead' }, 'Download a report from a store, then choose it here. Every row is accounted for, and importing a file twice does no harm. A store the app cannot read yet? Use Match your columns.'),
    ];

    for (const warning of earnings.warnings) {
      out.push(h('section', { class: 'card problem', role: 'alert' },
        h('h2', null, "A report you imported doesn't match its own total"),
        h('p', { class: 'note' }, warning.fileName),
        warning.problems.map((p) => h('p', null, p)),
        h('p', { class: 'note' }, 'It stays flagged until you undo that import. Ask the store for a fresh copy if the figures matter.')));
    }

    if (matching.length) {
      out.push(h('section', { class: 'card check', 'aria-labelledby': 'matching' },
        h('h2', { id: 'matching' }, 'Which book is this?'),
        h('p', { class: 'note' }, 'These rows are kept, and counted in the totals, but no book owns them yet. Answer once for each and it is remembered.'),
        h('ul', { class: 'list' }, matching.map((item) => h('li', { class: 'row' },
          h('span', null, h('strong', null, item.title || '(no title)'), ' ', h('span', { class: 'mono' }, item.storeItem), h('span', { class: 'note' }, ` · ${item.storeName} · ${AD.plural(item.rows, 'row')}`)),
          h('button', { class: 'small', onclick: () => match(item, editions) }, 'Match…'))))));
    }

    out.push(h('section', { class: 'card', 'aria-labelledby': 'earned' }, h('h2', { id: 'earned' }, 'Earned and paid'),
      earnings.currencies.length
        ? [h('p', { class: 'note' }, "Earned is what the sales reports say. Paid is what a payment report says reached you, or, for Lulu, what its sales report marks as paid. Each currency is kept on its own, because a month earned in pounds isn't added to one earned in dollars."),
          earnings.currencies.map((c) => h('div', { class: 'stack' },
            h('h3', null, c.currency),
            h('div', { class: 'tablewrap' }, h('table', null,
              h('thead', null, h('tr', null, ['Month', 'Earned', 'Paid', 'Not paid yet', 'Payment status'].map((t, i) => h('th', { scope: 'col', class: i && i < 4 ? 'num' : '' }, t)))),
              h('tbody', null, c.months.map((m) => h('tr', null,
                h('td', null, monthName(m.period)),
                h('td', { class: 'num mono' }, m.earned.shown),
                h('td', { class: 'num mono' }, m.paid.shown),
                h('td', { class: 'num mono' }, m.owed.shown),
                h('td', null, m.paymentSeen ? (m.statuses.join(', ') || 'seen') : h('span', { class: 'note' }, 'none yet')))),
                h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Total'), h('td', { class: 'num mono' }, c.totals.earned.shown),
                  h('td', { class: 'num mono' }, c.totals.paid.shown), h('td', { class: 'num mono' }, c.totals.owed.shown), h('td'))))))) ]
        : h('p', { class: 'note' }, 'Nothing yet. Import a report and your earnings appear here.')));

    if (earnings.converted.length) {
      out.push(h('section', { class: 'card', 'aria-labelledby': 'converted' }, h('h2', { id: 'converted' }, "In the currency you're paid in"),
        h('p', { class: 'note' }, 'Lulu also says what each line comes to in the currency it pays you in. For a paid line that is what it says it paid. For the rest it is only an estimate, which changes with exchange rates.'),
        h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, ['Currency', 'Paid', 'Not paid yet (estimate)'].map((t, i) => h('th', { scope: 'col', class: i ? 'num' : '' }, t)))),
          h('tbody', null, earnings.converted.map((c) => h('tr', null, h('td', null, c.currency), h('td', { class: 'num mono' }, c.paid.shown), h('td', { class: 'num mono' }, c.estimate.shown))))))));
    }

    out.push(h('section', { class: 'card', 'aria-labelledby': 'imports' }, h('h2', { id: 'imports' }, 'Imports'),
      imports.length
        ? h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, ['File', 'Report', 'Period', 'Rows', 'Imported', ''].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, imports.map((r) => h('tr', null,
            h('td', null, r.fileName || '(unnamed)', r.status === 'undone' ? h('span', { class: 'chip pulled' }, 'undone') : null,
              r.problems.length ? h('div', null, h('span', { class: 'chip problem' }, "totals didn't match")) : null),
            h('td', null, r.store, h('div', { class: 'note' }, r.kindLabel)),
            h('td', null, r.periodStart ? `${monthName(r.periodStart.slice(0, 7))}${r.periodEnd.slice(0, 7) !== r.periodStart.slice(0, 7) ? ` to ${monthName(r.periodEnd.slice(0, 7))}` : ''}` : ''),
            h('td', null, `${r.rowsInFile} (${r.counts.imported ?? 0} saved${r.counts.replaced ? `, ${r.counts.replaced} updated` : ''})`),
            h('td', null, AD.longDate(r.importedOn)),
            h('td', null, r.status === 'accepted'
              ? h('button', { class: 'small', onclick: async () => { if (await AD.confirm(`This takes back every row from ${r.fileName || 'this file'}. You can import the file again later.`, 'Undo the import')) AD.act(() => AD.call('undoReport', { id: r.id }), 'Import undone.'); } }, 'Undo')
              : null))))))
        : h('p', { class: 'note' }, 'No reports imported yet.'),
      h('h3', null, 'Which stores it can read'),
      h('ul', { class: 'list' }, readers.map((r) => h('li', null, h('strong', null, r.name), ' ',
        r.ready ? h('span', { class: 'chip live' }, 'ready') : h('span', { class: 'chip planned' }, 'waiting'),
        h('span', { class: 'note' }, ` ${r.ready ? r.reads : r.waiting}`))))));
    return out;
  };
})();
