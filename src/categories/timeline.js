import { register } from './registry.js';
import { textInput, textarea, grid, getValue, setValue } from './_base.js';

const id = 'Timeline';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = grid(
    textInput('tl-era', 'Era / Calendar System'),
    textInput('tl-date', 'Date (e.g., 2187-04-12)'),
  ) + textarea('tl-tags', 'Tags', 'comma separated (e.g., act i, conflict)');
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('tl-era', meta.era);
  setValue('tl-date', meta.date);
  setValue('tl-tags', meta.tags);
}

function applyExtrasToMeta(meta) {
  meta.era = getValue('tl-era');
  meta.date = getValue('tl-date');
  meta.tags = getValue('tl-tags');
}

function renderView(ctx) {
  const { meta } = ctx;
  const pieces = [];
  if (meta.era) pieces.push(`<span class="px-2 py-0.5 bg-amber-800 text-amber-100 rounded text-xs mr-2">${meta.era}</span>`);
  if (meta.date) pieces.push(`<span class="px-2 py-0.5 bg-gray-700 text-gray-200 rounded text-xs">${meta.date}</span>`);
  return pieces.length ? `<div class="mt-3">${pieces.join('')}</div>` : '';
}

register({ id, label: 'Timeline', schema: { name: 'Timeline' }, renderExtras, applyExtrasToMeta, renderView });
