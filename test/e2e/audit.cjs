'use strict';
// The accessibility checks that can be made by a program, run inside the real page. `audit(app)` looks at what is on screen right now and
// says what is wrong, in words, with where. It is used on every screen and every window, so a new button without a name, a field without a
// label or a control too small to press fails a test instead of reaching someone who can't see the problem. What it checks:
//   - every button, link and field has a name a screen reader can say (not just an icon, a colour or a placeholder)
//   - every window has a name, every picture has an alt, every landmark is told apart, and the page has one top heading
//   - no id is used twice (a label would then point at the wrong field), and nothing in the tab order is out of its place
//   - nothing that is hidden from a screen reader can still be reached with the keyboard
//   - every button and field is big enough to press (24 by 24 pixels, the WCAG 2.2 minimum)

const IN_PAGE = String.raw`(() => {
  const problems = [];
  const say = (el, what) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const words = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    problems.push(what + ': <' + el.tagName.toLowerCase() + id + cls + '>' + (words ? ' "' + words + '"' : ''));
  };
  const shown = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (node.hasAttribute('hidden') || (node.tagName === 'DIALOG' && !node.open)) return false;
      if (node.hasAttribute('popover') && !node.matches(':popover-open')) return false;
    }
    return el.getClientRects().length > 0;
  };
  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const labelledBy = (el) => clean((el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '));
  const spoken = (el) => {
    const tag = el.tagName.toLowerCase();
    const fromAria = labelledBy(el) || clean(el.getAttribute('aria-label'));
    if (fromAria) return fromAria;
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const labels = [...(el.labels || [])].map((label) => clean(label.textContent)).filter(Boolean);
      return labels.join(' ') || clean(el.getAttribute('title'));
    }
    if (tag === 'img') return el.getAttribute('alt') === null ? '' : 'has alt';
    // A button or a link is named by its words, or by a picture inside it that has an alt, and last of all by its title.
    const alts = [...el.querySelectorAll('img[alt]')].map((img) => clean(img.getAttribute('alt'))).join(' ');
    const text = clean([...el.childNodes].map((node) => (node.nodeType === 3 ? node.textContent : node.nodeType === 1 && !node.matches('svg') ? node.textContent : '')).join(' '));
    return text || alts || clean(el.getAttribute('title'));
  };

  // While a window is open over the page, the page behind it cannot be reached, so only the window is checked.
  const modals = [...document.querySelectorAll('dialog[open]')];
  const scope = modals.length ? modals[modals.length - 1] : document;
  const doers = [...scope.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=combobox], [tabindex="0"]')].filter(shown);
  // WCAG 2.2 (2.5.8): a target is at least 24 by 24, or it is smaller but a 24 pixel circle around its centre touches no other target.
  const boxes = doers.map((el) => el.getBoundingClientRect());
  const near = (box, x, y) => Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom));
  const small = (box) => box.width < 24 || box.height < 24;
  for (const el of doers) {
    if (!spoken(el)) say(el, 'has no name for a screen reader');
    if (el.hasAttribute('tabindex') && Number(el.getAttribute('tabindex')) > 0) say(el, 'has a tab order of its own (tabindex above 0)');
    // Something a screen reader is told to ignore must not be somewhere the keyboard can still land.
    if (el.closest('[aria-hidden="true"]')) say(el, 'is hidden from a screen reader but can be reached');
    const kind = el.tagName === 'INPUT' ? el.type : '';
    const native = kind === 'checkbox' || kind === 'radio' || kind === 'color' || kind === 'range';
    const inline = el.matches('a[href], button.link') && el.closest('p, li, dd, dt, h1, h2, h3, span, td, label');
    if (!native && !inline && !el.disabled) {
      const at = doers.indexOf(el);
      const box = boxes[at];
      if (small(box)) {
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const crowded = boxes.some((other, i) => i !== at && !doers[i].contains(el) && !el.contains(doers[i]) && (near(other, x, y) < 12 || (small(other) && Math.hypot(other.left + other.width / 2 - x, other.top + other.height / 2 - y) < 24)));
        if (crowded) say(el, 'is too small to press and has another control too close (' + Math.round(box.width) + ' by ' + Math.round(box.height) + ', the least is 24 by 24)');
      }
    }
  }

  for (const el of [...document.querySelectorAll('dialog[open]')]) {
    if (!(labelledBy(el) || clean(el.getAttribute('aria-label')))) say(el, 'is a window with no name');
  }
  for (const el of [...scope.querySelectorAll('img')].filter(shown)) {
    if (el.getAttribute('alt') === null) say(el, 'is a picture with no alt');
  }
  for (const el of [...document.querySelectorAll('nav, [role=group][aria-label], [role=region], [role=listbox]')].filter(shown)) {
    if (!spoken(el)) say(el, 'is a region with no name');
  }
  const navs = [...scope.querySelectorAll('nav')].filter(shown);
  if (navs.length > 1) for (const nav of navs) if (!clean(nav.getAttribute('aria-label'))) say(nav, 'is one of several navigation areas but is not told apart');
  for (const el of [...document.querySelectorAll('[role=group]')].filter(shown)) {
    if (!(labelledBy(el) || clean(el.getAttribute('aria-label')))) say(el, 'is a group with no name');
  }

  const seen = new Map();
  for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) || 0) + 1);
  for (const [id, count] of seen) if (count > 1) problems.push('the id "' + id + '" is used ' + count + ' times');

  // The page itself: one top heading in the main part, and a title.
  const tops = [...document.querySelectorAll('main h1')].filter(shown);
  if (tops.length !== 1) problems.push('the page has ' + tops.length + ' top headings, and should have one');
  if (!clean(document.title)) problems.push('the page has no title');
  if (!document.documentElement.lang) problems.push('the page does not say what language it is in');
  return problems;
})()`;

// What is on screen right now, checked. Resolves to a list of problems, empty when there are none.
const audit = (app) => app.run(IN_PAGE);

module.exports = { IN_PAGE, audit };
