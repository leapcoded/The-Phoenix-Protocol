import { register } from './registry.js';
import { textarea, getValue, setValue } from './_base.js';

const id = 'Research';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  container.innerHTML = textarea('res-refs', 'References/Links', 'One per line');
  const meta = (ctx && ctx.meta) || {};
  setValue('res-refs', meta.refs);
}

function applyExtrasToMeta(meta) {
  meta.refs = getValue('res-refs');
}

function renderView(ctx) {
  const { meta } = ctx;
  const lines = String(meta.refs || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if (!lines.length) return '';
  return `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">
    <div class="text-sm text-gray-300">References</div>
    <ul class="list-disc ml-5 text-gray-300">${lines.map(l=>`<li>${l}</li>`).join('')}</ul>
  </div>`;
}

register({ id, label: 'Research', schema: { name: 'Research' }, renderExtras, applyExtrasToMeta, renderView });
