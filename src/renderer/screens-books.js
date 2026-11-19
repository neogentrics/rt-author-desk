'use strict';
// Books, and the page for one book: its store grid, its editions, and the forms that change them.
(() => {
  const { h } = AD;
  const cap = (text) => text[0].toUpperCase() + text.slice(1);
  const STATUSES = ['planned', 'in progress', 'live', 'pulled', 'being reworked'];
  const PROGRESS = ['not started', 'draft', 'final'];
  const choices = (values) => values.map((v) => ({ value: v, label: cap(v) }));
  const bookLink = (id) => `#/book/${encodeURIComponent(id)}`;

  AD.routes.books = async () => {
    const books = await AD.call('books');
    const out = [h('div', { class: 'row' }, h('h1', null, 'Books'),
      h('span', { class: 'row start' }, h('button', { onclick: AD.importBooks }, 'Bring in books from a file…'), h('button', { class: 'primary', onclick: AD.addBook }, 'Add a book')))];
    if (!books.length) {
      out.push(AD.emptyCard('No books yet', 'Add a book to start your catalog. A title is enough, and the rest can come later. If you keep a list of your books in a spreadsheet, or in Notion, you can bring it in as a CSV file.',
        h('button', { class: 'primary', onclick: AD.addBook }, 'Add a book'), h('button', { onclick: AD.importBooks }, 'Bring in books from a file…'), AD.tourButton()));
      out.push(await AD.importsCard());
      return out.filter(Boolean);
    }
    out.push(h('div', { class: 'tablewrap' }, h('table', null,
      h('caption', { class: 'note' }, 'Your books, with their series together.'),
      h('thead', null, h('tr', null, ['Title', 'Series', 'Pen name', 'Formats', 'Where it is', 'Clashes'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, books.map((b) => h('tr', null,
        h('td', null, h('a', { href: bookLink(b.id) }, b.title), b.subtitle ? h('span', { class: 'note' }, ` — ${b.subtitle}`) : null),
        h('td', null, b.series_name ? `${b.series_name}${b.series_number ? ` #${b.series_number}` : ''}` : ''),
        h('td', null, b.pen_name ?? ''),
        h('td', null, b.formats.join(', ')),
        h('td', null, h('span', { class: `chip ${b.business_status === 'live' ? 'live' : ''}` }, cap(b.business_status))),
        h('td', null, b.clash_count ? h('span', { class: 'chip problem' }, b.clash_count) : '')))))));
    out.push(await AD.importsCard());
    return out;
  };

  // ---- Forms -------------------------------------------------------------------------------------------------------

  async function editBook(page) {
    const names = await AD.call('names');
    const { book } = page;
    await AD.form({
      title: 'Edit the book',
      values: book,
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'subtitle', label: 'Subtitle' },
        { name: 'series_id', label: 'Series', type: 'select', options: AD.options(names.series, (s) => s.name), blank: '(not in a series)', create: AD.creatable.series },
        { name: 'series_number', label: 'Number in the series' },
        { name: 'pen_name_id', label: 'Pen name', type: 'select', options: AD.options(names.penNames, (p) => p.name), blank: '(none)', create: AD.creatable.penName },
        { name: 'business_status', label: 'Where it is', type: 'select', options: choices(STATUSES), blank: '(choose)' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: (fields) => AD.call('saveBook', fields),
    });
    AD.refresh();
  }

  async function removeBook(page) {
    if (!(await AD.confirm(`Remove "${page.book.title}"? It has no editions, so nothing else is lost.`))) return;
    try {
      await AD.call('removeBook', { id: page.book.id });
      location.hash = '#/books';
    } catch (problem) {
      AD.toast(problem.message);
    }
  }

  async function editionForm(page, edition) {
    const names = await AD.call('names');
    const saved = await AD.form({
      title: edition ? 'Edit the edition' : 'Add an edition',
      values: edition ?? { cover_status: 'not started', files_status: 'not started' },
      fields: [
        { name: 'format', label: 'Format', type: 'select', required: true, blank: '(choose)', options: choices(['ebook', 'paperback', 'hardcover', 'large print', 'audiobook']) },
        { name: 'label', label: 'Name for this edition', help: 'Only needed to tell two of one format apart, such as "second edition".' },
        { name: 'release_date', label: 'Release date', type: 'date' },
        { name: 'page_count', label: 'Pages', type: 'number', help: 'Print and ebook.' },
        { name: 'length_minutes', label: 'Length in minutes', type: 'number', help: 'Audiobook only.' },
        { name: 'trim_size', label: 'Trim size', placeholder: '5.5 x 8.5 in' },
        { name: 'paper', label: 'Paper' },
        { name: 'cover_status', label: 'Cover', type: 'select', options: choices(PROGRESS), blank: '(choose)' },
        { name: 'files_status', label: 'Final files', type: 'select', options: choices(PROGRESS), blank: '(choose)' },
        { name: 'publisher_name_id', label: 'Publisher name', type: 'select', options: AD.options(names.publishers, (p) => p.name), blank: '(none)', create: AD.creatable.publisher },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: (fields) => AD.call('saveEdition', edition ? fields : { ...fields, book_id: page.book.id }),
    });
    if (saved) AD.refresh();
  }

  async function removeEdition(page, edition) {
    const listings = edition.listings.length;
    const message = `Remove this ${edition.format}?${listings ? ` Its ${AD.plural(listings, 'listing')} and prices will go too.` : ''}${edition.isbns.length ? ' Its ISBNs stay in your register.' : ''}`;
    if (!(await AD.confirm(message))) return;
    await AD.act(async () => {
      for (const listing of edition.listings) await AD.call('removeListing', { id: listing.id });
      await AD.call('removeEdition', { id: edition.id });
    }, 'Removed.');
  }

  async function isbnForm(edition) {
    const names = await AD.call('names');
    const saved = await AD.form({
      title: 'Add an ISBN',
      hint: 'Write it any way you like, with or without hyphens. An ISBN-10 is kept as its ISBN-13.',
      values: { issuer: 'bought' },
      fields: [
        { name: 'number', label: 'ISBN', required: true },
        { name: 'issuer', label: 'Who issued it', type: 'select', options: [
          { value: 'bought', label: 'You bought it' }, { value: 'store', label: "A store's free ISBN" }, { value: 'given', label: 'Given to you' }], blank: '(choose)' },
        { name: 'store_id', label: 'Which store gave it', type: 'select', options: AD.options(names.stores, (s) => s.name), blank: '(not from a store)',
          help: 'Needed for a store\'s free ISBN, which can only be used on that store.' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: ({ number, issuer, store_id: storeId, notes }) => AD.call('addIsbn', { number, issuer, storeId, notes, editionId: edition.id }),
    });
    if (saved) AD.refresh();
  }

  async function recordingForm(edition, recording) {
    const names = await AD.call('names');
    const others = edition.recordings.filter((r) => !recording || r.id !== recording.id);
    const saved = await AD.form({
      title: recording ? 'Edit the recording' : 'Add a recording',
      hint: 'One audio version of this book. A store\'s own auto-made voice is a recording too.',
      values: recording ?? { voice: 'human', replacing: 'keep' },
      fields: [
        { name: 'voice', label: 'Voice', type: 'select', required: true, blank: '(choose)', options: [
          { value: 'human', label: 'Human' }, { value: 'synthesized', label: 'Synthesized' }, { value: 'cloned', label: 'Cloned voice (counts as synthesized)' }] },
        { name: 'read_by', label: 'Read by', help: 'The narrator, or the voice and tool that made it.' },
        { name: 'permission_note', label: 'Permission for a cloned voice', type: 'textarea', help: 'Whose voice it is, and the permission you have.' },
        { name: 'rights_holder', label: 'Who holds the rights' },
        { name: 'exclusive', label: 'Tied to an exclusive deal', type: 'checkbox' },
        { name: 'exclusive_store_id', label: 'Exclusive to which store', type: 'select', options: AD.options(names.stores, (s) => s.name), blank: '(none)' },
        { name: 'exclusive_until', label: 'Exclusive until', type: 'date' },
        { name: 'royalty_share', label: 'A Royalty Share contract', type: 'checkbox' },
        { name: 'contract_note', label: 'Contract notes', type: 'textarea' },
        { name: 'replacing', label: 'Replacing', type: 'select', options: [{ value: 'keep', label: 'Keep it' }, { value: 'waiting', label: 'Waiting to be replaced' }], blank: '(choose)' },
        { name: 'replaced_by_id', label: 'Replaced by', type: 'select', options: AD.options(others, (r) => r.read_by || r.voice), blank: '(not yet)' },
        { name: 'replaced_on', label: 'Swapped on', type: 'date' },
        { name: 'length_minutes', label: 'Length in minutes', type: 'number' },
        { name: 'finished_on', label: 'Finished on', type: 'date' },
        { name: 'studio_project', label: 'RT Audio Studio project' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: (fields) => AD.call('saveRecording', recording ? fields : { ...fields, edition_id: edition.id }),
    });
    if (saved) AD.refresh();
  }

  async function listingForm(edition, store, listing, stores) {
    const saved = await AD.form({
      title: listing ? `Edit the listing on ${store.name}` : `List this ${edition.format} on ${store.name}`,
      values: listing ?? { status: 'planned', route: 'direct' },
      fields: [
        { name: 'status', label: 'Status', type: 'select', required: true, blank: '(choose)', options: choices(['planned', 'pre-order', 'live', 'pulled']) },
        { name: 'store_item_id', label: 'Its ID on the store', help: 'An ASIN or a store\'s own number.' },
        { name: 'url', label: 'Link', placeholder: 'https://', type: 'url' },
        { name: 'route', label: 'How it gets there', type: 'select', options: [{ value: 'direct', label: 'Directly, from your own account' }, { value: 'distributor', label: 'Through a distributor' }], blank: '(choose)' },
        { name: 'via_store_id', label: 'Which distributor', type: 'select', options: AD.options(stores.filter((s) => s.id !== store.id), (s) => s.name), blank: '(none)' },
        { name: 'publisher_shown', label: 'Publisher name the store shows' },
        { name: 'program', label: 'Program', help: 'Such as an exclusive term.' },
        { name: 'program_exclusive', label: 'The program is exclusive', type: 'checkbox' },
        { name: 'program_from', label: 'Program starts', type: 'date' },
        { name: 'program_until', label: 'Program ends', type: 'date' },
        { name: 'isbn_id', label: 'ISBN used here', type: 'select', options: AD.options(edition.isbns, (i) => i.shown), blank: '(none)' },
        ...(edition.format === 'audiobook'
          ? [{ name: 'recording_id', label: 'Recording live here', type: 'select', options: AD.options(edition.recordings, (r) => `${r.read_by || 'Recording'} (${r.voice})`), blank: '(none)' }]
          : []),
        { name: 'release_date', label: 'Release date on this store', type: 'date' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: (fields) => AD.call('saveListing', listing ? fields : { ...fields, edition_id: edition.id, store_id: store.id }),
    });
    return saved;
  }

  // ---- The page ----------------------------------------------------------------------------------------------------

  function openCell(page, edition, store, listings) {
    const body = h('div', { class: 'stack' });
    const dialog = AD.dialog(`${cap(edition.format)} on ${store.name}`, body, { wide: true });
    const reopen = () => { dialog.close(); AD.refresh(); };

    for (const listing of listings) {
      body.append(h('section', { class: 'card' },
        h('h3', null, listing.route === 'distributor' ? `Through ${listing.via_name ?? 'a distributor'}` : 'Directly', ' ', h('span', { class: `chip ${listing.status}` }, cap(listing.status))),
        h('dl', { class: 'facts' },
          listing.store_item_id ? [h('dt', null, 'Store ID'), h('dd', { class: 'mono' }, listing.store_item_id)] : null,
          listing.url ? [h('dt', null, 'Link'), h('dd', null, h('a', { href: listing.url, target: '_blank', rel: 'noopener' }, listing.url))] : null,
          listing.program ? [h('dt', null, 'Program'), h('dd', null, `${listing.program}${listing.program_exclusive ? ' (exclusive)' : ''}`)] : null,
          listing.publisher_shown ? [h('dt', null, 'Shows publisher'), h('dd', null, listing.publisher_shown)] : null,
          listing.release_date ? [h('dt', null, 'Release'), h('dd', null, AD.longDate(listing.release_date))] : null),
        h('h3', null, 'Prices today'),
        listing.prices.length
          ? h('ul', { class: 'list' }, listing.prices.map((p) => h('li', { class: 'row' },
            h('span', null, `${p.marketplace}: `, h('strong', { class: 'mono' }, p.shown), h('span', { class: 'note' }, ` since ${p.from_date}`)),
            h('button', { class: 'small', onclick: async () => {
              if (await priceDialog(listing, p)) reopen();
            } }, 'Change'))))
          : h('p', { class: 'note' }, 'No price yet.'),
        h('div', { class: 'row start' },
          h('button', { onclick: async () => { if (await priceDialog(listing, null)) reopen(); } }, 'Set a price'),
          h('button', { onclick: async () => { if (await listingForm(edition, store, listing, page.stores)) reopen(); } }, 'Edit the listing'),
          h('button', { class: 'danger', onclick: async () => {
            if (!(await AD.confirm('Remove this listing and its prices?'))) return;
            try { await AD.call('removeListing', { id: listing.id }); reopen(); } catch (problem) { AD.toast(problem.message); }
          } }, 'Remove'))));
    }
    const routes = new Set(listings.map((l) => l.route));
    if (routes.size < 2) {
      body.append(h('p', null, h('button', { class: listings.length ? '' : 'primary', onclick: async () => {
        if (await listingForm(edition, store, null, page.stores)) reopen();
      } }, listings.length ? (listings[0].route === 'direct' ? 'Also list it through a distributor' : 'Also list it directly') : `List it on ${store.name}`)));
    }
    body.append(h('div', { class: 'actions' }, h('button', { onclick: () => dialog.close() }, 'Done')));
  }

  // A price is always saved whole, so this uses its own small form rather than the changed-fields-only one.
  async function priceDialog(listing, price) {
    return new Promise((resolve) => {
      const error = h('p', { class: 'error', role: 'alert', hidden: true });
      const field = (name, label, value, help, type = 'text') => h('div', { class: 'field' },
        h('label', { for: `p-${name}` }, label), h('input', { id: `p-${name}`, name, type, value: value ?? '', autocomplete: 'off' }), help ? h('p', { class: 'help' }, help) : null);
      const form = h('form', { method: 'dialog', novalidate: true },
        h('p', { class: 'hint' }, 'A new date adds to the history. The same date corrects that day.'),
        field('marketplace', 'Marketplace', price?.marketplace, 'Where this price applies, such as US, UK or DE.'),
        field('currency', 'Currency', price?.currency ?? 'USD', 'Three letters, such as USD, GBP or EUR.'),
        field('amount', 'Price', price?.amount, 'Write it as you would on the store, such as 12.99.'),
        field('fromDate', 'From', AD.todayIso(), null, 'date'),
        error,
        h('div', { class: 'actions' }, h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'), h('button', { class: 'primary', type: 'submit' }, 'Save the price')));
      const dialog = AD.dialog(price ? `Change the ${price.marketplace} price` : 'Set a price', form);
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'saved'));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const value = (name) => form.elements[name].value.trim();
        try {
          await AD.call('setPrice', { listingId: listing.id, marketplace: value('marketplace'), currency: value('currency').toUpperCase(), amount: value('amount'), fromDate: value('fromDate') });
          dialog.close('saved');
        } catch (problem) {
          error.textContent = problem.message;
          error.hidden = false;
        }
      });
      form.elements.marketplace.focus();
    });
  }

  function gridTable(page) {
    const { grid } = page;
    if (!grid.rows.length) return h('p', { class: 'note' }, 'Add an edition first. Then each store will appear here.');
    const clashKeys = new Set(grid.clashes.filter((c) => c.severity === 'problem').map((c) => c.key));
    return h('div', { class: 'tablewrap', tabindex: '0', role: 'region', 'aria-label': 'Where each edition is sold' }, h('table', null,
      h('caption', { class: 'note' }, 'Editions down the side, stores across the top. An empty square is a gap.'),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Edition'), grid.stores.map((s) => h('th', { scope: 'col' }, s.name)))),
      h('tbody', null, grid.rows.map((row) => {
        const edition = page.editions.find((e) => e.id === row.edition.id);
        return h('tr', null,
          h('th', { scope: 'row' }, cap(row.edition.label), row.edition.release_date ? h('span', { class: 'note nowrap' }, ` · ${row.edition.release_date}`) : null),
          grid.stores.map((store) => {
            const here = row.cells[store.id];
            const bad = here.some((c) => c.clashes.some((k) => clashKeys.has(k)));
            const label = here.length ? `${cap(edition.format)} on ${store.name}: ${here.map((c) => c.status).join(', ')}. Open.` : `${cap(edition.format)} is not on ${store.name}. List it.`;
            return h('td', { class: `cell ${here.length ? '' : 'gap'} ${bad ? 'has-problem' : ''}` },
              h('button', { class: 'cellbtn', 'aria-label': label, onclick: () => {
                  // A gap goes straight to the form. A square with listings opens what's there, with its prices.
                  const listings = edition.listings.filter((l) => l.store_id === store.id);
                  if (listings.length) openCell(page, edition, store, listings);
                  else listingForm(edition, store, null, page.stores).then((saved) => saved && AD.refresh());
                } },
                here.length
                  ? [here.map((c) => h('span', { class: 'row start' }, h('span', { class: `chip ${c.status}` }, c.status), c.route === 'distributor' ? h('span', { class: 'note' }, `via ${c.via ?? 'distributor'}`) : null,
                    c.clashes.some((k) => clashKeys.has(k)) ? h('span', { class: 'chip problem' }, 'clash') : null)),
                  here.flatMap((c) => c.prices.map((p) => h('span', { class: 'price mono' }, `${p.marketplace} ${p.shown}`)))]
                  : h('span', { 'aria-hidden': 'true' }, '+')));
          }));
      }))));
  }

  function editionCard(page, edition) {
    const facts = [
      ['Release', edition.release_date && AD.longDate(edition.release_date)],
      ['Pages', edition.page_count], ['Length', edition.length_minutes && `${edition.length_minutes} minutes`],
      ['Trim size', edition.trim_size], ['Paper', edition.paper],
      ['Cover', cap(edition.cover_status)], ['Final files', cap(edition.files_status)],
      ['Publisher name', edition.publisher_name_id && page.names.publishers.find((p) => p.id === edition.publisher_name_id)?.name],
    ].filter(([, value]) => value);
    return h('section', { class: 'card', 'aria-labelledby': `e-${edition.id}` },
      h('div', { class: 'row' }, h('h3', { id: `e-${edition.id}` }, cap(edition.format), edition.label ? ` — ${edition.label}` : ''),
        h('span', { class: 'row start' }, h('button', { class: 'small', onclick: () => editionForm(page, edition) }, 'Edit'),
          h('button', { class: 'small', onclick: () => removeEdition(page, edition) }, 'Remove'))),
      h('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, String(v))])),
      h('h3', null, 'ISBNs'),
      edition.isbns.length
        ? h('ul', { class: 'list' }, edition.isbns.map((i) => h('li', null, h('span', { class: 'mono' }, i.shown), ' ',
          h('span', { class: 'note' }, i.issuer === 'store' ? `free from ${i.store_name ?? 'a store'}` : i.issuer === 'given' ? 'given to you' : 'bought'))))
        : h('p', { class: 'note' }, edition.format === 'ebook' || edition.format === 'audiobook' ? 'None. Many stores do not need one.' : 'None yet.'),
      h('p', null, h('button', { class: 'small', onclick: () => isbnForm(edition) }, 'Add an ISBN')),
      edition.format === 'audiobook' ? [
        h('h3', null, 'Recordings'),
        edition.recordings.length
          ? h('ul', { class: 'list' }, edition.recordings.map((r) => h('li', null,
            h('div', { class: 'row' }, h('span', null, h('strong', null, r.read_by || 'Recording'), ' ', h('span', { class: 'chip' }, r.voice),
              r.exclusive ? h('span', { class: 'chip check' }, `exclusive to ${r.exclusive_store_name ?? 'a store'}${r.exclusive_until ? ` until ${r.exclusive_until}` : ''}`) : null,
              r.replacing === 'waiting' ? h('span', { class: 'chip planned' }, 'waiting to be replaced') : null),
            h('button', { class: 'small', onclick: () => recordingForm(edition, r) }, 'Edit')))))
          : h('p', { class: 'note' }, 'No recording yet.'),
        h('p', null, h('button', { class: 'small', onclick: () => recordingForm(edition, null) }, 'Add a recording')),
      ] : null);
  }

  AD.routes.book = async (id) => {
    const [page, names] = await Promise.all([AD.call('book', { id }), AD.call('names')]);
    page.names = names;
    page.stores = names.stores;
    const { book } = page;
    const clashes = page.grid.clashes;
    return [
      h('p', { class: 'crumb' }, h('a', { href: '#/books' }, '← Books')),
      h('div', { class: 'row' },
        h('div', null, h('h1', null, book.title), book.subtitle ? h('p', { class: 'lead' }, book.subtitle) : null,
          h('p', { class: 'note' }, [page.series_name ? `${page.series_name}${book.series_number ? ` #${book.series_number}` : ''}` : null, page.pen_name].filter(Boolean).join(' · '), ' ',
            h('span', { class: `chip ${book.business_status === 'live' ? 'live' : ''}` }, cap(book.business_status)))),
        h('span', { class: 'row start' }, h('button', { onclick: () => editBook(page) }, 'Edit'), h('button', { onclick: () => removeBook(page) }, 'Remove'))),
      clashes.length ? h('section', { class: `card ${clashes.some((c) => c.severity === 'problem') ? 'problem' : 'check'}`, 'aria-labelledby': 'cl' }, h('h2', { id: 'cl' }, `${AD.plural(clashes.length, 'clash', 'clashes')} on this book`),
        h('ul', { class: 'list' }, clashes.map((c) => AD.clashItem(c, { hideOpen: true })))) : null,
      h('section', { 'aria-labelledby': 'grid' }, h('h2', { id: 'grid' }, 'Where it is sold'), gridTable(page)),
      h('section', { 'aria-labelledby': 'eds' },
        h('div', { class: 'row' }, h('h2', { id: 'eds' }, 'Editions'), h('button', { class: 'primary', onclick: () => editionForm(page, null) }, 'Add an edition')),
        page.editions.length ? h('div', { class: 'editions' }, page.editions.map((e) => editionCard(page, e))) : h('p', { class: 'note' }, 'No editions yet. An edition is one format of the book: ebook, paperback, hardcover, large print or audiobook.')),
      book.notes ? h('section', { class: 'card' }, h('h3', null, 'Notes'), h('p', null, book.notes)) : null,
    ];
  };
})();
