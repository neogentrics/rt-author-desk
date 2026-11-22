'use strict';
// Royalties by month, book, edition, store and marketplace. The sales reports' figures are estimates, and what was paid is
// shown on its own, below.
(() => {
  const { h } = AD;
  const CHOICES = [['month', 'Month'], ['book', 'Book'], ['edition', 'Edition'], ['store', 'Store'], ['marketplace', 'Marketplace']];
  const monthName = (period) => new Date(`${period}-15T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  function view() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('royaltyView') ?? 'null');
      if (saved && Array.isArray(saved.by)) return saved;
    } catch { /* a view that can't be read is the default */ }
    return { by: ['month', 'book'], from: null, to: null };
  }
  const remember = (next) => {
    try { sessionStorage.setItem('royaltyView', JSON.stringify(next)); } catch { /* the choice just isn't remembered */ }
    AD.refresh();
  };

  AD.routes.royalties = async () => {
    const choice = view();
    const data = await AD.call('royalties', { by: choice.by, from: choice.from, to: choice.to });
    const out = [
      h('h1', null, 'Royalties'),
      h('p', { class: 'lead' }, 'What your books have earned, added up the way you choose. Each currency is kept on its own.'),
    ];
    if (!data.months.length) {
      out.push(h('section', { class: 'card empty' }, h('h2', null, 'No sales yet'), h('p', null, 'Import a report on the Money screen and your royalties appear here.'),
        h('p', null, h('a', { href: '#/money' }, 'Go to Money'))));
      return out;
    }

    const monthSelect = (name, label, value) => h('label', { class: 'field' }, label,
      h('select', { name, onchange: (e) => remember({ ...choice, [name]: e.target.value || null }) },
        h('option', { value: '' }, name === 'from' ? '(the first)' : '(the last)'),
        data.months.map((m) => h('option', { value: m, selected: m === value }, monthName(m)))));
    out.push(h('section', { class: 'card', 'aria-label': 'Choose what to add up' },
      h('fieldset', { class: 'row start' }, h('legend', null, 'Add up by'),
        CHOICES.map(([key, text]) => h('label', { class: 'row start' }, h('input', { type: 'checkbox', checked: choice.by.includes(key),
          onchange: (e) => remember({ ...choice, by: e.target.checked ? [...choice.by, key] : choice.by.filter((k) => k !== key) }) }), text))),
      h('div', { class: 'row start' }, monthSelect('from', 'From', choice.from), monthSelect('to', 'To', choice.to))));

    if (data.notMatched) {
      out.push(h('section', { class: 'card check' }, h('p', null, `${AD.plural(data.notMatched, 'row')} belong to no book yet, so they're under "Not matched yet". `,
        h('a', { href: '#/money' }, 'Match them on the Money screen'), '.')));
    }

    const { rows, totals } = data.estimated;
    out.push(h('section', { class: 'card', 'aria-labelledby': 'est' }, h('h2', { id: 'est' }, 'Earned, as the sales reports say'),
      h('p', { class: 'note' }, 'These are estimates until a payment report covers them. Copies are copies sold: free copies are counted on their own, and a refund takes one off.'),
      rows.length
        ? h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, data.by.map((d) => h('th', { scope: 'col' }, CHOICES.find(([k]) => k === d)[1])),
            [h('th', { scope: 'col' }, 'Currency'), h('th', { scope: 'col', class: 'num' }, 'Copies'), h('th', { scope: 'col', class: 'num' }, 'Free'), h('th', { scope: 'col', class: 'num' }, 'Earned')])),
          h('tbody', null,
            rows.map((r) => h('tr', null, data.by.map((d) => h('td', null, d === 'month' ? monthName(r.keys.month.label) : r.keys[d].label)),
              [h('td', null, r.currency), h('td', { class: 'num mono' }, r.units), h('td', { class: 'num mono' }, r.free), h('td', { class: 'num mono' }, r.earned.shown)])),
            totals.map((t) => h('tr', { class: 'total' }, h('th', { scope: 'row', colspan: Math.max(data.by.length, 1) }, `Total in ${t.currency}`),
              h('td', null, t.currency), h('td', { class: 'num mono' }, t.units), h('td', { class: 'num mono' }, t.free), h('td', { class: 'num mono' }, t.earned.shown))))))
        : h('p', { class: 'note' }, 'Nothing in that range.')));

    out.push(h('section', { class: 'card', 'aria-labelledby': 'paid' }, h('h2', { id: 'paid' }, 'Paid, as the payment reports say'),
      data.paid.length
        ? [h('p', { class: 'note' }, 'What a store says it paid, by the month the sales were in. A payment knows its month and marketplace, not which book.'),
          h('div', { class: 'tablewrap' }, h('table', null,
            h('thead', null, h('tr', null, ['Month', 'Marketplace', 'Currency', 'Accrued', 'Paid', 'Not paid yet', 'Status'].map((t, i) => h('th', { scope: 'col', class: i > 2 && i < 6 ? 'num' : '' }, t)))),
            h('tbody', null, data.paid.map((p) => h('tr', null, h('td', null, monthName(p.month)), h('td', null, p.marketplace), h('td', null, p.currency),
              h('td', { class: 'num mono' }, p.accrued.shown), h('td', { class: 'num mono' }, p.paid.shown), h('td', { class: 'num mono' }, p.waiting.shown),
              h('td', null, p.statuses.join(', '))))))) ]
        : h('p', { class: 'note' }, 'No payment reports imported for this range yet.')));
    return out;
  };
})();
