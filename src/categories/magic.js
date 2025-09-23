import { register } from './registry.js';
import { textarea, textInput, grid, getValue, setValue } from './_base.js';

const id = 'Magic';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = grid(
    textInput('mag-source', 'Source of Magic'),
    textInput('mag-limits', 'Limitations')
  ) + textarea('mag-rules', 'Rules', 'Outline the system rules');
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('mag-source', meta.source);
  setValue('mag-limits', meta.limits);
  setValue('mag-rules', meta.rules);
}

function applyExtrasToMeta(meta) {
  meta.source = getValue('mag-source');
  meta.limits = getValue('mag-limits');
  meta.rules = getValue('mag-rules');
}

function renderView(ctx) {
  const { meta } = ctx;
  const blocks = [];
  if (meta.source) blocks.push(`<div><strong>Source:</strong> ${meta.source}</div>`);
  if (meta.limits) blocks.push(`<div><strong>Limits:</strong> ${meta.limits}</div>`);
  if (meta.rules) blocks.push(`<div class="mt-2 text-gray-300">${meta.rules}</div>`);
  return blocks.length ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">${blocks.join('')}</div>` : '';
}

register({ id, label: 'Magic', schema: { name: 'Magic' }, renderExtras, applyExtrasToMeta, renderView });
