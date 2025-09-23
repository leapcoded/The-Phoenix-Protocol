import { register } from './registry.js';

const id = 'Encyclopedia';

function renderExtras() {
  const container = document.getElementById('wiki-editor-category-extras');
  if (container) container.innerHTML = '';
}

function applyExtrasToMeta() {}

function renderView() { return ''; }

register({ id, label: 'Encyclopedia', schema: { name: 'Encyclopedia', fields: [] }, renderExtras, applyExtrasToMeta, renderView });
