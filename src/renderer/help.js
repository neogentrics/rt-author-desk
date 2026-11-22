'use strict';
// The Help Center: short guides, searchable, in a window over whatever you were doing. The guides are data (shared/help.js), and
// what a guide says is shown as text, never as HTML.
(() => {
  const { h } = AD;
  const { GUIDES, SCREENS, searchGuides } = window.ADHelp;

  // **bold** and [words](help:guide), [words](go:screen), [words](tour:start), turned into elements.
  AD.inline = (text, act) => String(text).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/).filter(Boolean).map((part) => {
    if (part.startsWith('**')) return h('strong', null, part.slice(2, -2));
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (!link) return part;
    const [, label, target] = link;
    return h('button', { type: 'button', class: 'link', onclick: () => act(target) }, label);
  });

  AD.openHelp = (slug = '') => {
    document.getElementById('help')?.remove();
    let current = slug && GUIDES.some((g) => g.slug === slug) ? slug : '';
    const search = h('input', { type: 'search', id: 'help-search', placeholder: 'Search the guides', 'aria-label': 'Search the guides', autocomplete: 'off' });
    const nav = h('nav', { class: 'help-nav', 'aria-label': 'Guides' });
    const page = h('article', { class: 'help-page', tabindex: '-1' });
    const none = h('p', { class: 'note' }, 'Nothing matches that. Try one word, such as isbn or price.');

    const act = (target) => {
      const [kind, value] = target.split(':');
      if (kind === 'help') show(value);
      else if (kind === 'go' && SCREENS.includes(value)) { dialog.close(); location.hash = value === 'desk' ? '#/' : `#/${value}`; }
      else if (kind === 'tour') { dialog.close(); AD.startTour(); }
    };

    const block = (b) => {
      const inline = (t) => AD.inline(t, act);
      if (b.type === 'h') return h('h3', null, b.text);
      if (b.type === 'ul') return h('ul', { class: 'plain' }, b.items.map((t) => h('li', null, inline(t))));
      if (b.type === 'ol') return h('ol', { class: 'plain' }, b.items.map((t) => h('li', null, inline(t))));
      if (b.type === 'note') return h('p', { class: 'card accent help-note' }, inline(b.text));
      return h('p', null, inline(b.text));
    };

    function show(to) {
      const guide = GUIDES.find((g) => g.slug === to);
      current = guide ? guide.slug : '';
      if (!guide) {
        page.replaceChildren(
          h('h2', null, 'How can we help?'),
          h('p', { class: 'lead' }, 'Short guides for everything the app does. Search, or pick one from the list.'),
          h('p', { class: 'row start' },
            h('button', { type: 'button', class: 'primary', onclick: () => act('tour:start') }, 'Take the tour of a made-up catalog'),
            h('button', { type: 'button', onclick: () => show('getting-started') }, 'Getting started')),
          h('h3', null, 'Common questions'),
          ...GUIDES.find((g) => g.slug === 'faq').blocks.map(block));
      } else {
        page.replaceChildren(h('h2', null, guide.title), h('p', { class: 'lead' }, guide.summary), ...guide.blocks.map(block));
      }
      page.scrollTop = 0;
      list(search.value);
    }

    function list(query) {
      const found = searchGuides(query).filter((g) => g.slug !== 'faq' || query.trim());
      nav.replaceChildren(
        h('button', { type: 'button', class: !current && !query.trim() ? 'on' : '', onclick: () => { search.value = ''; show(''); } }, 'Help Center home'),
        ...(found.length ? found.map((g) => h('button', { type: 'button', class: g.slug === current ? 'on' : '', 'aria-current': g.slug === current ? 'page' : null, onclick: () => show(g.slug) }, g.title)) : [none]));
    }

    search.addEventListener('input', () => {
      list(search.value);
      const first = searchGuides(search.value)[0];
      if (search.value.trim() && first) show(first.slug);
    });

    const dialog = AD.dialog('Help Center', h('div', { class: 'help-body' }, search, nav, page), { wide: true });
    dialog.id = 'help';
    dialog.classList.add('help-dialog');
    show(current);
    search.focus();
  };
})();
