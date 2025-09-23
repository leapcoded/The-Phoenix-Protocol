import { register } from './registry.js';
import { textarea, getValue, setValue } from './_base.js';

const id = 'Philosophies';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  container.innerHTML = textarea('phi-core', 'Core Tenets');
  const meta = (ctx && ctx.meta) || {};
  setValue('phi-core', meta.core);
}

function applyExtrasToMeta(meta) {
  meta.core = getValue('phi-core');
}

function renderView(ctx) {
  const { meta } = ctx;
  if (!meta.core) return '';
  return `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">
    <div class="text-sm text-gray-300">Core Tenets</div>
    <div class="mt-1 text-gray-200">${meta.core}</div>
  </div>`;
}

register({ id, label: 'Philosophies', schema: { name: 'Philosophies' }, renderExtras, applyExtrasToMeta, renderView });
