import { register } from './registry.js';
import { textInput, textarea, grid, getValue, setValue } from './_base.js';

const id = 'Species';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = grid(
    textInput('sp-class', 'Classification'),
    textInput('sp-home', 'Homeworld/Origin')
  ) + textarea('sp-traits', 'Traits');
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('sp-class', meta.classification);
  setValue('sp-home', meta.home);
  setValue('sp-traits', meta.traits);
  // wire homepage/homeworld input to a datalist filtered to Locations
  const homeEl = document.getElementById('sp-home'); if (homeEl) { homeEl.setAttribute('list','sp-home-list'); }
  if (!document.getElementById('sp-home-list')) { const dl = document.createElement('datalist'); dl.id = 'sp-home-list'; dl.dataset.pagesource = 'all'; dl.dataset.filterCategory = 'Locations'; document.body.appendChild(dl); }
}

function applyExtrasToMeta(meta) {
  meta.classification = getValue('sp-class');
  meta.home = getValue('sp-home');
  meta.traits = getValue('sp-traits');
}

function renderView(ctx) {
  const { meta } = ctx;
  const blocks = [];
  if (meta.classification) blocks.push(`<div><strong>Classification:</strong> ${meta.classification}</div>`);
  if (meta.home) blocks.push(`<div><strong>Home:</strong> ${meta.home}</div>`);
  if (meta.traits) blocks.push(`<div class="mt-2 text-gray-300">${meta.traits}</div>`);
  return blocks.length ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">${blocks.join('')}</div>` : '';
}

register({ id, label: 'Species', schema: { name: 'Species' }, renderExtras, applyExtrasToMeta, renderView });
