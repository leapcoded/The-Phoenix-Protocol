// Lightweight helpers and default behaviors for categories

export function textInput(id, label, placeholder = '') {
  return `
  <div>
    <label for="${id}" class="text-xs text-gray-400">${label}</label>
    <input id="${id}" type="text" class="w-full p-2 rounded bg-gray-700 text-gray-200 border border-gray-600" placeholder="${placeholder}" />
  </div>`;
}

export function textarea(id, label, placeholder = '') {
  return `
  <div>
    <label for="${id}" class="text-xs text-gray-400">${label}</label>
    <textarea id="${id}" class="w-full p-2 rounded bg-gray-700 text-gray-200 border border-gray-600" rows="3" placeholder="${placeholder}"></textarea>
  </div>`;
}

export function select(id, label, options) {
  const opts = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  return `
  <div>
    <label for="${id}" class="text-xs text-gray-400">${label}</label>
    <select id="${id}" class="w-full p-2 rounded bg-gray-700 text-gray-200 border border-gray-600">${opts}</select>
  </div>`;
}

export function grid(...children) {
  return `<div class="grid md:grid-cols-2 gap-3">${children.join('')}</div>`;
}

export function getValue(elId) {
  const el = document.getElementById(elId);
  return el ? el.value.trim() : '';
}

export function setValue(elId, val) {
  const el = document.getElementById(elId);
  if (el) el.value = val || '';
}
