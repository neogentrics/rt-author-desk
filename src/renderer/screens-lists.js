'use strict';
// The lists around the catalog: clashes, the release calendar, the ISBN register, and stores and names.
(() => {
  const { h } = AD;
  const bookLink = (id) => `#/book/${encodeURIComponent(id)}`;

  AD.routes.clashes = async () => {
    const showAll = sessionStorage.getItem('showDismissed') === '1';
    const clashes = await AD.call('clashes', { includeDismissed: showAll });
    const open = clashes.filter((c) => !c.dismissed);
    const out = [
      h('div', { class: 'row' }, h('h1', null, 'Clashes'),
        h('label', { class: 'row start' }, h('input', { type: 'checkbox', checked: showAll, onchange: (e) => {
          sessionStorage.setItem('showDismissed', e.target.checked ? '1' : '0');
          AD.refresh();
        } }), 'Show the ones I dismissed')),
      h('p', { class: 'lead' }, 'Real problems in your catalog, each with what to do. You can dismiss one, with a reason, and bring it back later.'),
    ];
    if (!clashes.length) {
      out.push(h('section', { class: 'card good' }, h('p', null, 'No clashes. Everything in your catalog agrees with itself.')));
      return out;
    }
    if (!open.length) out.push(h('section', { class: 'card good' }, h('p', null, 'Nothing open. Only dismissed clashes are shown below.')));
    out.push(h('section', { class: 'card' }, h('ul', { class: 'list' }, clashes.map((c) => AD.clashItem(c)))));
    return out;
  };

  AD.routes.calendar = async () => {
    const [events, books, editions] = await Promise.all([AD.call('calendar'), AD.call('books'), AD.call('editionChoices')]);
    const out = [h('h1', null, 'Release calendar'), h('p', { class: 'lead' }, 'Every dated release, soonest first. Set dates on an edition, or on a store listing.')];
    if (!events.length) {
      if (!books.length) {
        out.push(AD.emptyCard('Nothing is dated yet', 'The calendar shows every release date. There are no books yet, so start by adding one, then date one of its editions.',
          h('button', { class: 'primary', onclick: AD.addBook }, 'Add a book')));
      } else if (!editions.length) {
        out.push(AD.emptyCard('Nothing is dated yet', 'A release date belongs to an edition: an ebook, a paperback or an audiobook. Open a book and add one, then date it.',
          h('a', { class: 'button primary', href: '#/books' }, 'Go to your books')));
      } else {
        out.push(AD.emptyCard('Nothing is dated yet', 'The calendar shows every release date, soonest first. Pick an edition and the day it comes out.',
          h('button', { class: 'primary', onclick: AD.dateAnEdition }, 'Date a release')));
      }
      return out;
    }
    const months = new Map();
    for (const event of events) {
      const key = event.date.slice(0, 7);
      months.set(key, [...(months.get(key) ?? []), event]);
    }
    for (const [key, list] of months) {
      const name = new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      out.push(h('section', { class: 'card', 'aria-label': name }, h('h2', null, name),
        h('ul', { class: 'list' }, list.map((e) => h('li', { class: 'row' },
          h('span', null, h('strong', null, AD.longDate(e.date)), ' · ', h('a', { href: bookLink(e.book_id) }, e.title), ` · ${e.format}${e.store ? ` on ${e.store}` : ''}`),
          h('span', { class: 'note' }, AD.days(e.days_away)))))));
    }
    return out;
  };

  async function addIsbn() {
    const names = await AD.call('names');
    const editions = await AD.call('editionChoices');
    const saved = await AD.form({
      title: 'Add an ISBN to your register',
      hint: 'Numbers you own or were given, whether or not a book uses them yet.',
      values: { issuer: 'bought' },
      fields: [
        { name: 'number', label: 'ISBN', required: true },
        { name: 'issuer', label: 'Who issued it', type: 'select', options: [
          { value: 'bought', label: 'You bought it' }, { value: 'store', label: "A store's free ISBN" }, { value: 'given', label: 'Given to you' }], blank: '(choose)' },
        { name: 'store_id', label: 'Which store gave it', type: 'select', options: AD.options(names.stores, (s) => s.name), blank: '(not from a store)' },
        { name: 'edition_id', label: 'Used on', type: 'select', options: AD.options(editions, (e) => e.label), blank: '(not used yet)' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: ({ number, issuer, store_id: storeId, edition_id: editionId, notes }) => AD.call('addIsbn', { number, issuer, storeId, editionId, notes }),
    });
    if (saved) AD.refresh();
  }

  async function assign(isbn) {
    const editions = await AD.call('editionChoices');
    const saved = await AD.form({
      title: `Use ${isbn.shown}`,
      values: { editionId: isbn.edition_id },
      fields: [{ name: 'editionId', label: 'Put it on', type: 'select', options: AD.options(editions, (e) => e.label), blank: '(no edition)' }],
      onSubmit: ({ editionId }) => AD.call('assignIsbn', { isbnId: isbn.id, editionId: editionId ?? null }),
    });
    if (saved) AD.refresh();
  }

  AD.routes.isbns = async () => {
    const isbns = await AD.call('isbnRegister');
    const out = [
      h('div', { class: 'row' }, h('h1', null, 'ISBNs'), h('button', { class: 'primary', onclick: addIsbn }, 'Add an ISBN')),
      h('p', { class: 'lead' }, 'Every ISBN you own or were given, and where it is used. Each number can be in the register only once.'),
    ];
    if (!isbns.length) {
      out.push(AD.emptyCard('No ISBNs yet', 'This is the register of every number you own or were given. Add the ones you have, even before a book uses them.',
        h('button', { class: 'primary', onclick: addIsbn }, 'Add an ISBN')));
      return out;
    }
    const spare = isbns.filter((i) => !i.edition).length;
    if (spare) out.push(h('section', { class: 'card accent' }, h('p', null, `${AD.plural(spare, 'number')} not used on any edition yet.`)));
    out.push(h('div', { class: 'tablewrap' }, h('table', null,
      h('thead', null, h('tr', null, ['ISBN', 'Issued by', 'Used on', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, isbns.map((i) => h('tr', null,
        h('td', { class: 'mono' }, i.shown),
        h('td', null, i.issuer === 'store' ? `${i.store_name ?? 'A store'} (free)` : i.issuer === 'given' ? 'Given to you' : 'You bought it'),
        h('td', null, i.edition ?? h('span', { class: 'note' }, 'Not used yet')),
        h('td', null, h('button', { class: 'small', onclick: () => assign(i) }, i.edition ? 'Move' : 'Use it'))))))));
    return out;
  };

  // A plain record with a name, for series, pen names and publisher names.
  function editName(title, save, record, extra = []) {
    return AD.form({
      title,
      values: record ?? {},
      fields: [{ name: 'name', label: 'Name', required: true }, ...extra, { name: 'notes', label: 'Notes', type: 'textarea' }],
      onSubmit: save,
    }).then((saved) => saved && AD.refresh());
  }

  AD.routes.names = async () => {
    const names = await AD.call('names');
    const dates = [{ name: 'from_date', label: 'Used from', type: 'date' }, { name: 'to_date', label: 'Used until', type: 'date' }];
    const block = (id, heading, rows, saveCall, label, extra = [], describe = () => null) => h('section', { class: 'card', 'aria-labelledby': id },
      h('div', { class: 'row' }, h('h2', { id }, heading), h('button', { onclick: () => editName(`Add ${label}`, (f) => AD.call(saveCall, f), null, extra) }, `Add ${label}`)),
      rows.length ? h('ul', { class: 'list' }, rows.map((r) => h('li', { class: 'row' }, h('span', null, r.name, describe(r) ? h('span', { class: 'note' }, ` · ${describe(r)}`) : null),
        h('button', { class: 'small', onclick: () => editName(`Edit ${label}`, (f) => AD.call(saveCall, f), r, extra) }, 'Edit')))) : h('p', { class: 'note' }, 'None yet.'));

    return [
      h('h1', null, 'Stores and names'),
      h('p', { class: 'lead' }, 'The places you sell, and the names you publish and write under.'),
      h('section', { class: 'card', 'aria-labelledby': 'stores' },
        h('div', { class: 'row' }, h('h2', { id: 'stores' }, 'Stores'),
          h('button', { onclick: () => AD.form({ title: 'Add a store', values: { kind: 'store' }, fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'kind', label: 'What it is', type: 'select', options: [{ value: 'store', label: 'A store' }, { value: 'distributor', label: 'A distributor' }, { value: 'audio', label: 'An audio store' }], blank: '(choose)' }],
          onSubmit: (f) => AD.call('saveStore', f) }).then((saved) => saved && AD.refresh()) }, 'Add a store')),
        h('p', { class: 'note' }, 'Switch a store off if you do not sell there. It then leaves your store grids, unless a book is still listed on it.'),
        h('ul', { class: 'list' }, names.stores.map((s) => h('li', { class: 'row' },
          h('span', null, s.active ? s.name : h('span', { class: 'note' }, `${s.name} (off)`), h('span', { class: 'note' }, ` · ${s.kind === 'audio' ? 'audio store' : s.kind}`)),
          h('span', { class: 'row start' },
            h('button', { class: 'small', onclick: () => AD.act(() => AD.call('saveStore', { id: s.id, active: !s.active })) }, s.active ? 'Switch off' : 'Switch on'),
            s.built_in ? null : h('button', { class: 'small', onclick: () => AD.act(() => AD.call('removeStore', { id: s.id }), 'Removed.') }, 'Remove')))))),
      block('series', 'Series', names.series, 'saveSeries', 'a series'),
      block('pens', 'Pen names', names.penNames, 'savePenName', 'a pen name'),
      block('pubs', 'Publisher names', names.publishers, 'savePublisherName', 'a publisher name', dates,
        (p) => [p.from_date && `from ${p.from_date}`, p.to_date && `until ${p.to_date}`].filter(Boolean).join(' ') || null),
    ];
  };
})();
