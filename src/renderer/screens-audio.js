'use strict';
// The audiobook tracker: every audiobook against every place one is sold.
(() => {
  const { h } = AD;
  const bookLink = (id) => `#/book/${encodeURIComponent(id)}`;
  const VOICE = { human: 'Human voice', synthesized: 'Synthesized voice', cloned: 'Cloned voice' };

  function waitingNote(recording) {
    if (!recording.waiting) return null;
    return recording.replacement
      ? h('span', { class: 'chip planned' }, `to be replaced by ${recording.replacement.read_by || 'a new recording'}${recording.replacement.finished_on ? `, made ${AD.longDate(recording.replacement.finished_on)}` : ''}`)
      : h('span', { class: 'chip check' }, 'to be replaced, nothing made yet');
  }

  function rights(recording) {
    const parts = [];
    if (recording.exclusive) parts.push(`exclusive to ${recording.exclusive_store ?? 'a store'}${recording.exclusive_until ? ` until ${AD.longDate(recording.exclusive_until)}` : ''}`);
    if (recording.royalty_share) parts.push('Royalty Share');
    return parts.length ? h('span', { class: 'note' }, parts.join(', ')) : null;
  }

  function cell(listings, problemKeys) {
    if (!listings.length) return h('span', { class: 'note' }, 'Not listed');
    return h('div', { class: 'stack' }, listings.map((l) => h('div', null,
      h('span', { class: `chip ${l.status}` }, l.status), ' ',
      l.clashes.some((k) => problemKeys.has(k)) ? h('span', { class: 'chip problem' }, 'clash') : null,
      l.recording
        ? h('div', null, h('strong', null, l.recording.read_by || 'Recording'), ' ', h('span', { class: `chip ${l.recording.voice === 'human' ? '' : 'check'}` }, VOICE[l.recording.voice]),
          h('div', null, rights(l.recording)), h('div', null, waitingNote(l.recording)))
        : h('div', { class: 'note' }, l.status === 'live' ? 'No recording named' : ''))));
  }

  AD.routes.audiobooks = async () => {
    const tracker = await AD.call('audiobooks');
    const out = [
      h('h1', null, 'Audiobooks'),
      h('p', { class: 'lead' }, 'Every audiobook on every store: which recording is live, whose voice it is, what rights it has, and which are waiting to be replaced.'),
    ];
    if (!tracker.rows.length) {
      out.push(h('section', { class: 'card empty' }, h('h2', null, 'No audiobooks yet'), h('p', null, 'Open a book and add an audiobook edition. Its recordings and stores will show here.')));
      return out;
    }
    const c = tracker.counts;
    const facts = [
      `${AD.plural(c.titles, 'audiobook')}, ${AD.plural(c.recordings, 'recording')}`,
      c.waiting ? `${c.waiting} waiting to be replaced (${c.waitingWithReplacement} with a replacement made)` : null,
      c.synthesized ? `${AD.plural(c.synthesized, 'recording')} not in a human voice` : null,
      c.unnamed ? `${AD.plural(c.unnamed, 'live listing')} with no recording named` : null,
    ].filter(Boolean);
    out.push(h('section', { class: 'card accent' }, h('p', null, facts.join(' · '))));

    // Only the clashes that are real problems get a flag on a square, as on the book's own grid.
    const problems = new Set((await AD.call('clashes')).filter((x) => x.severity === 'problem').map((x) => x.key));
    out.push(h('div', { class: 'tablewrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Audiobook'), tracker.stores.map((s) => h('th', { scope: 'col' }, s.name)))),
      h('tbody', null, tracker.rows.map((row) => h('tr', null,
        h('th', { scope: 'row' }, h('a', { href: bookLink(row.book.id) }, row.book.title), h('div', { class: 'note' }, row.edition.label)),
        tracker.stores.map((s) => h('td', null, cell(row.cells[s.id], problems)))))))));
    return out;
  };
})();
