'use strict';
// The calculator: what a price earns on each copy at every store that has a rate card, and what to charge to earn a given amount on a copy.
// Everything is worked out in the app (calculator.js, in exact whole-cent maths); this screen asks and shows what comes back. It is an
// estimate for planning: the store's own report is what counts, and the screen says so.
(() => {
  const { h } = AD;

  const FORMAT_ORDER = ['ebook', 'paperback', 'hardcover', 'large print', 'audiobook'];
  const FORMAT_NAMES = { ebook: 'Ebook', paperback: 'Paperback', hardcover: 'Hardcover', 'large print': 'Large print', audiobook: 'Audiobook' };
  const formatName = (format) => FORMAT_NAMES[format] ?? format;
  const pad = (n) => String(n).padStart(2, '0');
  const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const dayText = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const percent = (rate) => `${(Number(rate) * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  const takes = (card, what) => card.options.some((o) => (o.deduct ?? []).includes(what));
  const needsPrinting = (card) => takes(card, 'printing');
  const needsSize = (card) => takes(card, 'delivery') || card.options.some((o) => o.price_min_by_file_mb);
  const where = (card) => [card.store, card.channel && card.channel !== card.store ? card.channel : ''].filter(Boolean).join(', ');
  const outside = (url, text) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, text, h('span', { class: 'visually-hidden' }, ' (opens in your browser)'));

  // What was typed is kept for the visit, so going to another screen and back does not lose it.
  const recall = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('calculatorView') ?? 'null');
      if (saved && typeof saved === 'object') return saved;
    } catch { /* what can't be read is the empty form */ }
    return {};
  };
  const remember = (values) => {
    try { sessionStorage.setItem('calculatorView', JSON.stringify(values)); } catch { /* it just isn't kept */ }
  };

  // When a card applies, and where its rates came from, in words.
  function inForce(card) {
    if (card.applies_from && card.applies_until) return `${dayText(card.applies_from)} to ${dayText(card.applies_until)}`;
    if (card.applies_from) return `From ${dayText(card.applies_from)}`;
    if (card.applies_until) return `Until ${dayText(card.applies_until)}`;
    return 'Now';
  }

  // A rate that was read on the store's own page says so, and keeps what to know about it one press away. One that was not says so first,
  // in full, because it is the one to check before relying on it.
  function sourceNote(card) {
    if (card.own) return h('p', { class: 'note' }, 'A card of your own', card.replaces ? ', used in place of the one the app ships for this.' : '.', card.notes ? ` ${card.notes}` : '');
    const source = card.source;
    if (!source) return null;
    const link = source.url ? outside(source.url, source.title) : source.title;
    const when = inForce(card) === 'Now' ? '' : ` In force: ${inForce(card)}.`;
    const note = (source.note ?? '').trim();
    if (!source.verified) return h('p', { class: 'note' }, h('strong', null, 'Not confirmed on the store\'s own page. '), note, ' Source: ', link, '.', when);
    return [
      h('p', { class: 'note' }, 'Rates read on the store\'s own page (', link, ') on ', dayText(source.checked_on), '.', when),
      note ? h('details', null, h('summary', null, 'What to know about these rates'), h('p', { class: 'note' }, note)) : null,
    ];
  }

  const sourceCell = (card) => {
    if (card.own) return 'Your own card';
    if (!card.source) return '';
    return card.source.verified ? ['Read on the store\'s page, ', dayText(card.source.checked_on)] : 'Not confirmed on the store\'s own page yet';
  };


  // "70" or "70%" or "7.5" as the rate the calculator wants (0.70, 0.075), by moving the point, so nothing is ever a floating-point number.
  function percentToRate(text) {
    const t = String(text ?? '').trim().replace(/%$/, '');
    if (!/^\d+(\.\d+)?$/.test(t)) return t; // the app says in words what is wrong with it
    const [whole, fraction = ''] = t.split('.');
    const scale = fraction.length + 2;
    const s = `${whole}${fraction}`.padStart(scale + 1, '0');
    return `${s.slice(0, -scale)}.${s.slice(-scale)}`;
  }

  // A card of your own: new, copied from one the app ships, or one of yours changed. Yours win over the app's for the same store, format,
  // channel and currency, and an update to the app never touches them.
  async function editCard(existing, shipped, done) {
    const { stores } = await AD.call('names');
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const text = (id, value, extra = {}) => h('input', { id, type: 'text', autocomplete: 'off', value: value ?? '', ...extra });
    const row = (label, control, help) => h('div', { class: 'field' }, h('label', { for: control.id }, label), control, help ? h('p', { class: 'help' }, help) : null);
    const store = h('select', { id: 'cc-store' }, stores.filter((s) => s.active !== 0).map((s) => h('option', { value: s.id }, s.name)));
    const name = text('cc-name', existing?.name);
    const kind = text('cc-format', existing?.format, { placeholder: 'ebook, paperback, audiobook…' });
    const channel = text('cc-channel', existing?.channel, { placeholder: 'Amazon.com, Direct, a contract…' });
    const currency = text('cc-currency', existing?.currency ?? 'USD', { maxlength: '3' });
    const from = h('input', { id: 'cc-from', type: 'date', value: existing?.applies_from ?? '' });
    const until = h('input', { id: 'cc-until', type: 'date', value: existing?.applies_until ?? '' });
    const perMb = text('cc-permb', existing?.delivery?.per_mb);
    const minimum = text('cc-min', existing?.delivery?.minimum);
    const notes = h('textarea', { id: 'cc-notes', rows: '2' }, existing?.notes ?? '');
    if (existing) store.value = existing.store_id;
    let basedOn = null;

    const rows = [];
    const optionsBox = h('div');
    const renumber = () => rows.forEach((r, i) => { r.legend.textContent = `Rate ${i + 1}`; r.remove.hidden = rows.length < 2; });
    function addOption(option = {}) {
      const n = rows.length + 1;
      const legend = h('legend', null, `Rate ${n}`);
      const id = (part) => `cc-o${Math.random().toString(36).slice(2, 8)}-${part}`;
      const oName = text(id('name'), option.name, { placeholder: '70% option' });
      const oRate = text(id('rate'), option.rate == null ? '' : percent(option.rate), { inputmode: 'decimal' });
      const oMin = text(id('min'), option.price_min, { inputmode: 'decimal' });
      const oMax = text(id('max'), option.price_max, { inputmode: 'decimal' });
      const printingBox = h('input', { id: id('printing'), type: 'checkbox', checked: (option.deduct ?? []).includes('printing') });
      const deliveryBox = h('input', { id: id('delivery'), type: 'checkbox', checked: (option.deduct ?? []).includes('delivery') });
      const remove = h('button', { type: 'button', class: 'small' }, 'Remove this rate');
      const { name: _n, rate: _r, price_min: _a, price_max: _b, deduct: _d, ...extra } = option; // what the form has no box for (a lowest price by file size) is kept
      const box = h('fieldset', { class: 'card' }, legend,
        h('div', { class: 'row start' }, row('Name', oName), row('Rate, as a percentage of the list price', oRate)),
        h('div', { class: 'row start' }, row('Lowest list price it accepts', oMin), row('Highest list price it accepts', oMax)),
        h('div', { class: 'row start' }, h('label', { class: 'row start' }, printingBox, 'Printing cost comes off'), h('label', { class: 'row start' }, deliveryBox, 'Delivery cost comes off')),
        remove);
      const entry = {
        legend, remove, box,
        read: () => ({
          ...extra, name: oName.value, rate: percentToRate(oRate.value), price_min: oMin.value.trim(), price_max: oMax.value.trim(),
          deduct: [printingBox.checked && 'printing', deliveryBox.checked && 'delivery'].filter(Boolean),
        }),
      };
      remove.addEventListener('click', () => { rows.splice(rows.indexOf(entry), 1); box.remove(); renumber(); });
      rows.push(entry);
      optionsBox.append(box);
      renumber();
    }
    for (const option of existing?.options ?? [{}]) addOption(option);

    // Start from a card the app ships: its rates are copied in, and the card remembers which it came from.
    const start = h('select', { id: 'cc-start' }, h('option', { value: '' }, '(start empty)'), shipped.map((c) => h('option', { value: c.id }, `${where(c)}, ${formatName(c.format)}, ${c.currency}`)));
    start.addEventListener('change', () => {
      const from = shipped.find((c) => c.id === start.value);
      basedOn = from?.id ?? null;
      if (!from) return;
      store.value = from.store_id; kind.value = from.format; channel.value = from.channel; currency.value = from.currency;
      name.value = name.value || `My ${where(from)} rates`;
      perMb.value = from.delivery?.per_mb ?? ''; minimum.value = from.delivery?.minimum ?? '';
      rows.splice(0).forEach((r) => r.box.remove());
      for (const option of from.options) addOption(option);
    });

    const body = h('div', null,
      existing ? null : row('Start from', start, 'Copy the rates of a card the app ships, then change what is different in your contract.'),
      row('What to call it', name),
      h('div', { class: 'row start' }, row('Store', store), row('Format', kind), row('Where', channel, 'The marketplace or the deal, as you write it on a price.'), row('Currency', currency)),
      h('div', { class: 'row start' }, row('In force from', from, 'Leave empty for always.'), row('In force until', until)),
      h('h3', null, 'The rates'), optionsBox,
      h('p', null, h('button', { type: 'button', id: 'cc-add' }, 'Add another rate')),
      h('div', { class: 'row start' }, row('Delivery cost per MB', perMb, 'Only if a rate takes delivery off.'), row('Delivery cost at least', minimum)),
      row('Notes', notes),
      error);
    const save = h('button', { type: 'button', class: 'primary', id: 'cc-save' }, 'Save this card');
    const cancel = h('button', { type: 'button' }, 'Cancel');
    const dialog = AD.dialog(existing ? 'Change your rate card' : 'A rate card of your own', h('div', null, body, h('div', { class: 'actions' }, cancel, save)), { wide: true });
    body.querySelector('#cc-add').addEventListener('click', () => addOption());
    cancel.addEventListener('click', () => dialog.close());
    save.addEventListener('click', async () => {
      error.hidden = true;
      const fields = {
        ...(existing ? { id: existing.id } : {}), ...(basedOn ? { based_on: basedOn } : {}),
        name: name.value, store_id: store.value, format: kind.value, channel: channel.value, currency: currency.value.trim().toUpperCase(),
        applies_from: from.value || null, applies_until: until.value || null, notes: notes.value,
        options: rows.map((r) => r.read()), delivery: perMb.value.trim() || minimum.value.trim() ? { per_mb: perMb.value.trim(), minimum: minimum.value.trim() } : null,
      };
      try {
        await AD.call('saveRateCard', fields);
        dialog.close();
        AD.toast('Saved your rate card.');
        done();
      } catch (problem) {
        error.textContent = problem.message;
        error.hidden = false;
      }
    });
  }

  AD.routes.calculator = async () => {
    const memory = recall();
    const state = { date: todayText(), cards: [] };

    const text = (id, value) => h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', value: value ?? '' });
    const date = h('input', { id: 'calc-date', type: 'date', value: state.date });
    const format = h('select', { id: 'calc-format' });
    const currency = h('select', { id: 'calc-currency' });
    const printing = text('calc-printing', memory.printing);
    const size = text('calc-size', memory.size);
    const price = text('calc-price', memory.price);
    const want = text('calc-want', memory.want);
    const priceLabel = h('label', { for: 'calc-price' }, 'List price');
    const wantLabel = h('label', { for: 'calc-want' }, 'What you want to earn on each copy');

    const field = (label, control, help, hidden = false) => h('div', { class: 'field', hidden }, typeof label === 'string' ? h('label', { for: control.id }, label) : label, control, help ? h('p', { class: 'help' }, help) : null);
    const printingField = field('Printing cost per copy', printing, 'Needed for a printed book. The store\'s own printing cost calculator gives it for your page count and ink.', true);
    const sizeField = field('Ebook file size in MB', size, 'Needed for an ebook. It sets the delivery cost, and the lowest price some rates allow.', true);

    const problem = h('p', { class: 'error', role: 'alert', hidden: true });
    const earnProblem = h('p', { class: 'error', role: 'alert', hidden: true });
    const wantProblem = h('p', { class: 'error', role: 'alert', hidden: true });
    const earnStatus = h('p', { class: 'note', role: 'status' });
    const wantStatus = h('p', { class: 'note', role: 'status' });
    const earnOut = h('div');
    const wantOut = h('div');
    const rates = h('div');

    const save = () => remember({ format: format.value, price: price.value, want: want.value, printing: printing.value, size: size.value });
    const cardsNow = () => state.cards.filter((c) => c.format === format.value && c.currency === currency.value);
    const clearEarn = () => { earnProblem.hidden = true; earnProblem.textContent = ''; earnStatus.textContent = ''; earnOut.replaceChildren(); };
    const clearWant = () => { wantProblem.hidden = true; wantProblem.textContent = ''; wantStatus.textContent = ''; wantOut.replaceChildren(); };
    // What was worked out is no longer true once the book or the date changes, so both answers go.
    const clear = () => { clearEarn(); clearWant(); };

    function showNeeds() {
      const now = cardsNow();
      printingField.hidden = !now.some(needsPrinting);
      sizeField.hidden = !now.some(needsSize);
      priceLabel.textContent = `List price${currency.value ? ` (${currency.value})` : ''}`;
      wantLabel.textContent = `What you want to earn on each copy${currency.value ? ` (${currency.value})` : ''}`;
    }

    function fillCurrencies() {
      const list = [...new Set(state.cards.filter((c) => c.format === format.value).map((c) => c.currency))].sort();
      const keep = list.includes(currency.value) ? currency.value : (list.includes('USD') ? 'USD' : list[0] ?? '');
      currency.replaceChildren(...list.map((c) => h('option', { value: c }, c)));
      currency.value = keep;
      showNeeds();
    }

    function fillFormats() {
      const present = [...new Set(state.cards.map((c) => c.format))];
      const formats = [...FORMAT_ORDER.filter((f) => present.includes(f)), ...present.filter((f) => !FORMAT_ORDER.includes(f))];
      const keep = formats.includes(format.value) ? format.value : (formats.includes(memory.format) ? memory.format : formats[0] ?? '');
      format.replaceChildren(...formats.map((f) => h('option', { value: f }, formatName(f))));
      format.value = keep;
      fillCurrencies();
    }

    function drawRates() {
      rates.replaceChildren(state.cards.length
        ? h('div', { class: 'tablewrap' }, h('table', null,
          h('caption', { class: 'visually-hidden' }, `The rate cards in force on ${dayText(state.date)}`),
          h('thead', null, h('tr', null, ['Where', 'Format', 'Currency', 'In force', 'Rates', 'Where the rates came from', 'Yours'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, state.cards.map((card) => h('tr', null,
            h('th', { scope: 'row' }, where(card), card.own ? [' ', h('span', { class: 'chip check' }, 'yours')] : null),
            h('td', null, formatName(card.format)),
            h('td', null, card.currency),
            h('td', null, inForce(card)),
            h('td', null, card.options.map((o) => `${o.name}: ${percent(o.rate)}`).join('; ')),
            h('td', null, sourceCell(card)),
            h('td', null, card.own ? h('span', { class: 'row start' },
              h('button', { type: 'button', class: 'small', 'aria-label': `Change your card for ${where(card)}, ${formatName(card.format)}`, onclick: () => editCard(card, state.cards.filter((c) => !c.own), load) }, 'Change'),
              h('button', { type: 'button', class: 'small', 'aria-label': `Remove your card for ${where(card)}, ${formatName(card.format)}`, onclick: async () => {
                if (await AD.confirm('This removes your rate card. The calculator goes back to the card the app ships for it, if there is one.')) {
                  try { await AD.call('removeRateCard', { id: card.id }); AD.toast('Removed.'); await load(); } catch (problem) { AD.toast(problem.message); }
                }
              } }, 'Remove')) : ''))))))
        : h('p', { class: 'note' }, 'No rate card applies on this date.'));
    }

    async function load() {
      try {
        state.cards = await AD.call('rateCards', { date: state.date });
        problem.hidden = true;
      } catch (error) {
        state.cards = [];
        problem.textContent = error.message;
        problem.hidden = false;
      }
      fillFormats();
      drawRates();
      clear();
    }

    const args = (card, extra) => ({ storeId: card.store_id, format: card.format, channel: card.channel, currency: card.currency, date: state.date, printingCost: printing.value, fileMb: size.value, ...extra });

    // One call for each card that applies. A card that can't be worked out says why in its own place, unless every card says the same thing,
    // which is then said once (a price that is not a number).
    async function ask(name, extra) {
      const now = cardsNow();
      const results = await Promise.all(now.map(async (card) => {
        try {
          return { card, answer: await AD.call(name, args(card, extra)) };
        } catch (error) {
          return { card, problem: error.message };
        }
      }));
      const messages = new Set(results.filter((r) => r.problem).map((r) => r.problem));
      return { results, common: results.length > 1 && results.every((r) => r.problem) && messages.size === 1 ? [...messages][0] : null };
    }

    const head = (id, card) => h('h3', { id }, where(card), card.own ? [' ', h('span', { class: 'chip check' }, 'your card')] : null);
    const none = (label) => [h('span', { 'aria-hidden': 'true' }, '—'), h('span', { class: 'visually-hidden' }, label)];

    function earnBlock(index, { card, answer, problem: said }) {
      const id = `calc-earn-${index}`;
      if (said) return h('section', { class: 'card', 'aria-labelledby': id }, head(id, card), h('p', { class: 'note' }, said), sourceNote(card));
      return h('section', { class: 'card', 'aria-labelledby': id }, head(id, card),
        h('div', { class: 'tablewrap' }, h('table', null,
          h('caption', { class: 'visually-hidden' }, `What a list price of ${answer.price.shown} earns on each copy, ${where(card)}`),
          h('thead', null, h('tr', null, ['Rate', 'Share of the price', 'Less', 'You earn on each copy', 'Note'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, answer.options.map((o) => h('tr', null,
            h('th', { scope: 'row' }, o.name, answer.options.length > 1 && o.name === answer.best ? [' ', h('span', { class: 'chip live' }, 'Best here')] : null),
            h('td', { class: 'num mono' }, o.gross.shown),
            h('td', null, o.deductions.length ? o.deductions.map((d) => `${d.label} ${d.amount.shown}`).join(', ') : 'Nothing'),
            h('td', { class: 'num mono' }, o.eligible ? o.royalty.shown : none('not at this price')),
            h('td', null, o.eligible ? (BigInt(o.royalty.minor) <= 0n ? 'At this price a copy earns nothing or loses money.' : '') : o.why)))))),
        answer.lines.map((line) => h('p', { class: 'note' }, h('strong', null, 'Worth knowing: '), line.says)),
        sourceNote(card));
    }

    function wantBlock(index, { card, answer, problem: said }) {
      const id = `calc-want-${index}`;
      if (said) return h('section', { class: 'card', 'aria-labelledby': id }, head(id, card), h('p', { class: 'note' }, said), sourceNote(card));
      return h('section', { class: 'card', 'aria-labelledby': id }, head(id, card),
        h('div', { class: 'tablewrap' }, h('table', null,
          h('caption', { class: 'visually-hidden' }, `The price that earns ${answer.wanted.shown} on each copy, ${where(card)}`),
          h('thead', null, h('tr', null, ['Rate', 'Price to charge', 'You earn on each copy', 'Note'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, answer.options.map((o) => h('tr', null,
            h('th', { scope: 'row' }, o.name, answer.options.length > 1 && o.name === answer.cheapest ? [' ', h('span', { class: 'chip live' }, 'Cheapest here')] : null),
            h('td', { class: 'num mono' }, o.possible ? o.price.shown : none('not possible')),
            h('td', { class: 'num mono' }, o.possible ? o.royalty.shown : none('not possible')),
            h('td', null, o.note ?? '')))))),
        sourceNote(card));
    }

    async function workOut() {
      clearEarn();
      save();
      if (!cardsNow().length) { earnProblem.textContent = 'There is no rate card for that format and currency on that date.'; earnProblem.hidden = false; return; }
      const { results, common } = await ask('earn', { price: price.value });
      if (common) { earnProblem.textContent = common; earnProblem.hidden = false; return; }
      earnOut.replaceChildren(...results.map((r, i) => earnBlock(i, r)));
      // The headline, said aloud: the best rate across every store shown.
      let best = null;
      for (const { card, answer } of results) {
        for (const o of answer?.options ?? []) if (o.eligible && (!best || BigInt(o.royalty.minor) > BigInt(best.option.royalty.minor))) best = { card, option: o, price: answer.price };
      }
      earnStatus.textContent = best
        ? `At ${best.price.shown}, the best is ${where(best.card)}, ${best.option.name}: ${best.option.royalty.shown} on each copy.`
        : 'This price does not fit any rate that applies.';
    }

    async function findPrice() {
      clearWant();
      save();
      if (!cardsNow().length) { wantProblem.textContent = 'There is no rate card for that format and currency on that date.'; wantProblem.hidden = false; return; }
      const { results, common } = await ask('priceFor', { want: want.value });
      if (common) { wantProblem.textContent = common; wantProblem.hidden = false; return; }
      wantOut.replaceChildren(...results.map((r, i) => wantBlock(i, r)));
      let cheapest = null;
      for (const { card, answer } of results) {
        for (const o of answer?.options ?? []) if (o.possible && (!cheapest || BigInt(o.price.minor) < BigInt(cheapest.option.price.minor))) cheapest = { card, option: o, wanted: answer.wanted };
      }
      wantStatus.textContent = cheapest
        ? `To earn ${cheapest.wanted.shown} on each copy, the lowest price is ${cheapest.option.price.shown}, at ${where(cheapest.card)}, ${cheapest.option.name}.`
        : `No rate that applies can earn ${want.value} on each copy.`;
    }

    format.addEventListener('change', () => { fillCurrencies(); clear(); save(); });
    currency.addEventListener('change', () => { showNeeds(); clear(); });
    date.addEventListener('change', () => { state.date = date.value || todayText(); load(); });
    for (const el of [price, want]) el.addEventListener('change', save);
    for (const el of [printing, size]) el.addEventListener('change', () => { save(); clear(); }); // the cost and the size are part of both answers

    const section = (id, title, ...children) => h('section', { class: 'card', 'aria-labelledby': id }, h('h2', { id }, title), ...children);
    const asForm = (onSubmit, ...children) => {
      const form = h('form', { novalidate: true }, ...children);
      form.addEventListener('submit', (event) => { event.preventDefault(); onSubmit(); });
      return form;
    };

    await load();
    return [
      h('h1', null, 'Calculator'),
      h('p', { class: 'lead' }, 'What a price earns on each copy, and what to charge to earn what you want. It is an estimate for planning: the store\'s own report is what counts.'),
      problem,
      section('calc-book-h', 'The book and the date',
        h('div', { class: 'row start' },
          field('Format', format),
          field('Currency', currency),
          field('Rates in force on', date, 'A store\'s rates change over time, and the card in force on this date is used.')),
        h('div', { class: 'row start' }, printingField, sizeField)),
      section('calc-earn-h', 'What a price earns',
        asForm(workOut, h('div', { class: 'row start' }, field(priceLabel, price), h('button', { type: 'submit', class: 'primary', id: 'calc-earn' }, 'Work it out')), earnProblem),
        earnStatus, earnOut),
      section('calc-want-h', 'What to charge',
        asForm(findPrice, h('div', { class: 'row start' }, field(wantLabel, want), h('button', { type: 'submit', class: 'primary', id: 'calc-want-go' }, 'Find the price')), wantProblem),
        wantStatus, wantOut),
      section('calc-rates-h', 'The rates behind these numbers',
        h('p', { class: 'note' }, 'Only stores that have a rate card are shown. A rate is added once it has been read from the store\'s own page, and a rate that has not is marked, so you can check it before you rely on it.'),
        rates,
        h('p', null, h('button', { type: 'button', id: 'calc-add-card', onclick: () => editCard(null, state.cards.filter((c) => !c.own), load) }, 'Add a rate card of my own…'))),
    ];
  };
})();
