'use strict';
// The window's small toolkit. Every element is built with h(), which sets text as text and never as HTML, so a title
// such as "<b>x</b>" is shown as typed. Everything the window asks of the app goes through call().
(() => {
  const AD = (window.AD = { routes: {} });

  AD.h = function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
      if (value === false || value == null) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    const add = (child) => {
      if (Array.isArray(child)) child.forEach(add);
      else if (child != null && child !== false) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    };
    children.forEach(add);
    return el;
  };
  const { h } = AD;

  // Asks the app to do something. A problem the person can fix throws an Error whose message is plain words.
  AD.call = async (name, args) => {
    const result = await window.desk.call(name, args);
    if (!result.ok) throw new Error(result.message);
    return result.value;
  };

  AD.toast = (message) => {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(AD.toast.timer);
    AD.toast.timer = setTimeout(() => { el.hidden = true; }, 4000);
  };

  // A dialog that closes itself and is removed once it's done. Each has its own title id, because one can open over another (a price
  // over a store's square), and a shared id would give the top one the name of the one beneath it.
  let dialogs = 0;
  AD.dialog = (title, body, { wide = false } = {}) => {
    dialogs += 1;
    const titleId = `dialog-title-${dialogs}`;
    const dialog = h('dialog', { class: wide ? 'wide' : '', 'aria-labelledby': titleId },
      h('h2', { id: titleId }, title), body);
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  };

  // A form in a dialog. `fields` are { name, label, type, options, help, required }. The form sends only what was
  // filled in when making something new, and only what changed when editing, so the change log stays meaningful and the
  // database's own defaults apply to anything left blank.
  // A select can offer to make something new right where it is chosen: `create: { label, noun, placeholder, make(name, all) }`.
  // Choosing it opens a box for the name. The new record is made when the form is saved, and if saving then fails, the same name
  // is reused on the next try, so nothing is made twice.
  const NEW = '__new__';
  AD.form = ({ title, fields, values = {}, submit = 'Save', onSubmit, hint }) => new Promise((resolve) => {
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const newBoxes = {};
    const made = new Map();
    const controls = fields.map((field) => {
      const id = `f-${field.name}`;
      const current = values[field.name] ?? (field.type === 'checkbox' ? false : '');
      let control;
      if (field.type === 'select') {
        control = h('select', { id, name: field.name, onchange: field.create ? () => {
          const box = newBoxes[field.name];
          box.hidden = control.value !== NEW;
          if (!box.hidden) box.focus();
        } : null }, [
          h('option', { value: '' }, field.blank ?? '(none)'),
          ...field.options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(current) }, o.label)),
          field.create ? h('option', { value: NEW }, field.create.label) : null,
        ]);
        if (field.create) {
          newBoxes[field.name] = h('input', { id: `${id}-new`, type: 'text', hidden: true, placeholder: field.create.placeholder ?? 'Name', 'aria-label': field.create.label, autocomplete: 'off' });
        }
      } else if (field.type === 'textarea') {
        control = h('textarea', { id, name: field.name, rows: 3 }, String(current));
      } else if (field.type === 'checkbox') {
        control = h('input', { id, name: field.name, type: 'checkbox', checked: Boolean(current) });
      } else {
        control = h('input', { id, name: field.name, type: field.type ?? 'text', value: current, required: field.required, inputmode: field.type === 'number' ? 'numeric' : null, placeholder: field.placeholder, autocomplete: 'off' });
      }
      const label = h('label', { for: id }, field.label, field.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null);
      return h('div', { class: field.type === 'checkbox' ? 'field check' : 'field' },
        field.type === 'checkbox' ? [control, label] : [label, control], newBoxes[field.name] ?? null, field.help ? h('p', { class: 'help' }, field.help) : null);
    });
    const save = h('button', { type: 'submit', class: 'primary' }, submit);
    const cancel = h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel');
    const form = h('form', { method: 'dialog', novalidate: true }, hint ? h('p', { class: 'hint' }, hint) : null, controls, error, h('div', { class: 'actions' }, cancel, save));
    const dialog = AD.dialog(title, form);
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'saved'));

    const read = () => {
      const out = {};
      for (const field of fields) {
        const el = form.elements[field.name];
        let value;
        if (field.type === 'checkbox') value = el.checked;
        else if (field.type === 'number') value = el.value.trim() === '' ? null : Number(el.value);
        else if (field.type === 'select' || field.type === 'date') value = el.value === '' ? null : el.value;
        else value = el.value.trim();
        out[field.name] = value;
      }
      return out;
    };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const missing = fields.find((f) => f.required && (read()[f.name] === null || read()[f.name] === ''));
      if (missing) {
        error.textContent = `${missing.label} is needed.`;
        error.hidden = false;
        form.elements[missing.name].focus();
        return;
      }
      const all = read();
      const editing = values.id != null;
      const payload = editing ? { id: values.id } : {};
      const pending = fields.filter((f) => f.create && all[f.name] === NEW).sort((a, b) => (a.create.priority ?? 0) - (b.create.priority ?? 0));
      for (const field of pending) {
        if (!newBoxes[field.name].value.trim()) {
          error.textContent = `Give the new ${field.create.noun ?? 'one'} a name.`;
          error.hidden = false;
          newBoxes[field.name].focus();
          return;
        }
      }
      const fill = () => {
        for (const field of fields) {
          const now = all[field.name];
          if (editing) {
            const text = field.type === 'text' || field.type === 'textarea' || field.type === undefined;
            const before = field.type === 'checkbox' ? Boolean(values[field.name]) : (values[field.name] ?? (text ? '' : null));
            if (now !== before) payload[field.name] = now;
          } else if (now !== '' && now !== null && now !== false) {
            payload[field.name] = now;
          }
        }
      };
      save.disabled = true;
      try {
        for (const field of pending) {
          const name = newBoxes[field.name].value.trim();
          let record = made.get(field.name);
          if (!record || record.name !== name) {
            record = { name, id: await field.create.make(name, all) };
            made.set(field.name, record);
          }
          all[field.name] = record.id;
        }
        fill();
        await onSubmit(payload);
        dialog.close('saved');
      } catch (problem) {
        error.textContent = problem.message;
        error.hidden = false;
        save.disabled = false;
      }
    });
    form.elements[fields[0].name]?.focus();
  });

  // "Are you sure?", for things that remove something.
  AD.confirm = (message, yes = 'Remove') => new Promise((resolve) => {
    const dialog = AD.dialog('Are you sure?', h('div', null,
      h('p', null, message),
      h('div', { class: 'actions' },
        h('button', { type: 'button', onclick: () => dialog.close('no') }, 'Cancel'),
        h('button', { type: 'button', class: 'danger', onclick: () => dialog.close('yes') }, yes))));
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'));
  });

  // Runs an action, then redraws the screen. A problem is shown in words instead of being lost.
  AD.act = async (action, done) => {
    try {
      await action();
      if (done) AD.toast(done);
      await AD.refresh();
    } catch (problem) {
      AD.toast(problem.message);
    }
  };

  AD.plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  AD.days = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? `in ${n} days` : `${-n} day${n === -1 ? '' : 's'} ago`);
  AD.longDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
})();
