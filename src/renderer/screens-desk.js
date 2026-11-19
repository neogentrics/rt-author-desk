'use strict';
// The Desk: what needs you today. It opens on what to do, not on totals.
(() => {
  const { h } = AD;

  AD.todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  AD.options = (rows, label) => rows.map((row) => ({ value: row.id, label: label(row) }));

  // "New series…", "New pen name…" and "New publisher name…" in a form's drop-down, so none of them has to be made somewhere else first.
  // A series made beside a pen name is linked to it, and the pen name is made first (priority) so there is an id to link to.
  const realId = (value) => (value && value !== '__new__' ? value : null);
  AD.creatable = {
    series: {
      label: 'New series…', noun: 'series', placeholder: 'Name of the series', priority: 1,
      make: async (name, all) => (await AD.call('saveSeries', { name, ...(realId(all.pen_name_id) ? { pen_name_id: all.pen_name_id } : {}) })).id,
    },
    penName: { label: 'New pen name…', noun: 'pen name', placeholder: 'The name you write under', make: async (name) => (await AD.call('savePenName', { name })).id },
    publisher: { label: 'New publisher name…', noun: 'publisher name', placeholder: 'The name you publish under', make: async (name) => (await AD.call('savePublisherName', { name })).id },
  };

  // One clash: what's wrong, what to do, and a way to dismiss it with a reason (or bring it back).
  AD.clashItem = (clash, { hideOpen = false } = {}) => {
    const dismiss = () => AD.form({
      title: 'Dismiss this',
      hint: clash.title,
      fields: [{ name: 'reason', label: 'Why is this fine?', type: 'textarea', required: true, help: 'You will be able to read this later.' }],
      submit: 'Dismiss',
      onSubmit: ({ reason }) => AD.call('dismissClash', { key: clash.key, reason }),
    }).then((saved) => saved && AD.refresh());
    return h('li', null,
      h('h3', null, h('span', { class: `chip ${clash.severity}` }, clash.severity === 'problem' ? 'Fix' : 'Check'), ' ', clash.title),
      h('p', null, clash.detail),
      h('p', { class: 'action' }, clash.action),
      clash.dismissed ? h('p', { class: 'note' }, `Dismissed: ${clash.dismissed.reason} `,
        h('button', { class: 'link', onclick: () => AD.act(() => AD.call('restoreClash', { key: clash.key }), 'Brought back.') }, 'Bring it back')) : null,
      h('p', { class: 'row start' },
        clash.book_id && !hideOpen ? h('a', { class: 'button small', href: `#/book/${encodeURIComponent(clash.book_id)}` }, 'Open the book') : null,
        clash.dismissed ? null : h('button', { class: 'small', onclick: dismiss }, 'Dismiss…')));
  };

  AD.addBook = async () => {
    const names = await AD.call('names');
    let created = null;
    const saved = await AD.form({
      title: 'Add a book',
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'subtitle', label: 'Subtitle' },
        { name: 'series_id', label: 'Series', type: 'select', options: AD.options(names.series, (s) => s.name), blank: '(not in a series)', create: AD.creatable.series },
        { name: 'series_number', label: 'Number in the series', placeholder: '1' },
        { name: 'pen_name_id', label: 'Pen name', type: 'select', options: AD.options(names.penNames, (p) => p.name), blank: '(none)', create: AD.creatable.penName },
        { name: 'business_status', label: 'Where it is', type: 'select', blank: 'Planned',
          options: ['planned', 'in progress', 'live', 'pulled', 'being reworked'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
      ],
      onSubmit: async (fields) => { created = await AD.call('saveBook', fields); },
    });
    if (saved && created) location.hash = `#/book/${encodeURIComponent(created.id)}`;
  };

  // An empty screen says what it is for and what to do, and has the button that does it.
  AD.emptyCard = (title, text, ...actions) => h('section', { class: 'card empty' },
    h('h2', null, title), h('p', { class: 'lead' }, text),
    actions.length ? h('p', { class: 'row' }, actions) : null);
  AD.tourButton = () => h('button', { type: 'button', onclick: () => AD.startTour() }, 'Take a tour of a made-up catalog');

  // Gives one of your editions a release date, from the Calendar, without finding the book first.
  AD.dateAnEdition = async () => {
    const editions = await AD.call('editionChoices');
    const saved = await AD.form({
      title: 'Date a release',
      hint: 'Pick the edition and the day it comes out. It then shows on the calendar and the Desk.',
      fields: [
        { name: 'edition', label: 'Edition', type: 'select', required: true, blank: '(choose)', options: AD.options(editions, (e) => e.label) },
        { name: 'release_date', label: 'Release date', type: 'date', required: true },
      ],
      onSubmit: ({ edition, release_date: day }) => AD.call('saveEdition', { id: edition, release_date: day }),
    });
    if (saved) AD.refresh();
  };

  // Adds an audiobook to a book you already have, from the Audiobooks screen, then opens the book to go on from there.
  AD.addAudiobook = async () => {
    const books = await AD.call('books');
    let made = null;
    const saved = await AD.form({
      title: 'Add an audiobook',
      hint: 'Pick the book. You can add its recording, its stores and its rights on the book\'s page.',
      fields: [
        { name: 'book_id', label: 'Book', type: 'select', required: true, blank: '(choose)', options: AD.options(books, (b) => b.title) },
        { name: 'length_minutes', label: 'Length in minutes', type: 'number' },
      ],
      onSubmit: async (fields) => { made = await AD.call('saveEdition', { ...fields, format: 'audiobook' }); },
    });
    if (saved && made) location.hash = `#/book/${encodeURIComponent(made.book_id)}`;
  };

  AD.routes[''] = async () => {
    const home = await AD.call('desk');
    const out = [h('h1', null, 'Your desk')];

    if (home.isEmpty) {
      out.push(h('section', { class: 'card empty' },
        h('h2', null, 'Start your catalog'),
        h('p', { class: 'lead' }, 'Add a book, then its editions, where it is sold and what it costs. Your desk will show what needs you.'),
        h('p', { class: 'row' }, h('button', { class: 'primary', onclick: AD.addBook }, 'Add your first book'), AD.tourButton())));
      return out;
    }

    out.push(h('p', { class: 'lead' }, home.problems.length
      ? `${AD.plural(home.problems.length, 'thing')} to fix.`
      : home.nextRelease ? 'Nothing is broken.' : 'Nothing needs you today.'));

    const next = home.nextRelease;
    if (next) {
      out.push(h('section', { class: `card ${next.blockers.length ? 'problem' : 'good'}`, 'aria-labelledby': 'next' },
        h('h2', { id: 'next' }, 'Next release'),
        h('p', null, h('a', { href: `#/book/${encodeURIComponent(next.book_id)}` }, next.title), ` · ${next.format}${next.store ? ` on ${next.store}` : ''}`),
        h('p', null, `${AD.longDate(next.date)}, ${AD.days(next.days_away)}.`),
        next.blockers.length
          ? h('ul', { class: 'list' }, next.blockers.map((b) => h('li', null, h('strong', null, 'In the way: '), b.title, h('p', { class: 'action' }, b.action))))
          : h('p', { class: 'note' }, 'Nothing is in its way.')));
    }

    // The next release already shows what is in its way, so it isn't listed a second time.
    const shown = new Set((next?.blockers ?? []).map((b) => b.key));
    const needs = home.problems.filter((c) => !shown.has(c.key));
    if (needs.length) {
      out.push(h('section', { class: 'card problem', 'aria-labelledby': 'fix' }, h('h2', { id: 'fix' }, 'Needs you'),
        h('ul', { class: 'list' }, needs.map((c) => AD.clashItem(c)))));
    }
    const later = home.comingSoon.filter((r) => !next || r.listing_id !== next.listing_id || r.edition_id !== next.edition_id || r.date !== next.date);
    if (later.length) {
      out.push(h('section', { class: 'card', 'aria-labelledby': 'soon' }, h('h2', { id: 'soon' }, 'Coming up in the next 30 days'),
        h('ul', { class: 'list' }, later.map((r) => h('li', null,
          h('a', { href: `#/book/${encodeURIComponent(r.book_id)}` }, r.title), ` · ${r.format}${r.store ? ` on ${r.store}` : ''} · ${AD.longDate(r.date)} (${AD.days(r.days_away)})`)))));
    }
    if (home.lastMonth) {
      const month = new Date(`${home.lastMonth.period}-15T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      out.push(h('section', { class: 'card', 'aria-labelledby': 'last' }, h('h2', { id: 'last' }, `Last month: ${month}`),
        h('p', null, home.lastMonth.earned.map((e, i) => [i ? ' and ' : '', h('strong', { class: 'mono' }, e.shown)]), ' earned'),
        h('p', { class: 'note' }, 'This is what the sales reports say, which the store calls an estimate. ', h('a', { href: '#/royalties' }, 'See the royalties'), '.')));
    }
    if (home.toCheck.length) {
      out.push(h('section', { class: 'card check', 'aria-labelledby': 'look' }, h('h2', { id: 'look' }, 'Worth a look'),
        h('ul', { class: 'list' }, home.toCheck.map((c) => AD.clashItem(c)))));
    }
    if (!home.problems.length && !home.toCheck.length && !next) {
      out.push(h('section', { class: 'card good' }, h('p', null, 'No releases are dated, and nothing clashes. Add a release date to an edition and it will show here.')));
    }
    return out;
  };
})();
