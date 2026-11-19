'use strict';
// The Trash: what was removed waits here for 30 days, and comes back exactly as it was.
(() => {
  const { h } = AD;
  const KIND = { book: 'Book', edition: 'Edition', listing: 'Listing' };

  AD.routes.trash = async () => {
    const items = await AD.call('trash');
    const out = [
      h('div', { class: 'row' }, h('h1', null, 'Trash'),
        items.length ? h('button', { class: 'danger', onclick: async () => {
          if (await AD.confirm(`This removes ${AD.plural(items.length, 'thing')} for good. It can't be undone.`, 'Empty the Trash')) AD.act(async () => AD.toast(`Removed ${AD.plural(await AD.call('emptyTrash'), 'thing')} for good.`));
        } }, 'Empty the Trash') : null),
      h('p', { class: 'lead' }, 'Books, editions and listings you remove wait here for 30 days. Bring one back and it returns exactly as it was, with its prices, recordings and numbers.'),
    ];
    if (!items.length) {
      out.push(AD.emptyCard('The Trash is empty', 'Nothing you remove is lost straight away: it waits here for 30 days first.'));
      return out;
    }
    out.push(h('section', { class: 'card' }, h('ul', { class: 'list' }, items.map((i) => h('li', null,
      h('div', { class: 'row' },
        h('span', null, h('span', { class: 'chip' }, KIND[i.kind]), ' ', h('strong', null, i.label),
          h('span', { class: 'note' }, ` · removed ${AD.longDate(i.removedOn)} · ${i.daysLeft === 0 ? 'removed for good today' : `${AD.plural(i.daysLeft, 'day')} left`}`)),
        h('span', { class: 'row start' },
          h('button', { class: 'small', disabled: !i.restorable, onclick: () => AD.act(async () => { const back = await AD.call('restoreTrash', { id: i.id }); AD.toast(`Brought back ${back.label}.`); }) }, 'Bring it back'),
          h('button', { class: 'small', onclick: async () => { if (await AD.confirm(`Remove "${i.label}" for good? It can't be undone.`, 'Remove for good')) AD.act(() => AD.call('deleteTrash', { id: i.id }), 'Removed for good.'); } }, 'Delete now'))),
      i.restorable ? null : h('p', { class: 'note' }, i.why))))));
    return out;
  };
})();
