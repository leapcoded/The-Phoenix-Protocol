import { register } from './registry.js';
import { grid, textInput, textarea, select, getValue, setValue } from './_base.js';

const id = 'Items';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;

  const rarityOptions = [
    { value: 'Common', label: 'Common' },
    { value: 'Uncommon', label: 'Uncommon' },
    { value: 'Rare', label: 'Rare' },
    { value: 'Epic', label: 'Epic' },
    { value: 'Legendary', label: 'Legendary' },
    { value: 'Unique', label: 'Unique' },
  ];

  const html = grid(
    textInput('it-type', 'Item Type'),
    textInput('it-origin', 'Origin / Maker'),
    select('it-rarity', 'Rarity', rarityOptions),
    textInput('it-value', 'Value'),
    textInput('it-arc', 'Related Arc', 'text', 'e.g., The Dragon\'s Demise')
  ) + textarea('it-properties', 'Properties/Abilities');
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('it-type', meta.type);
  setValue('it-origin', meta.origin);
  setValue('it-rarity', meta.rarity);
  setValue('it-value', meta.value);
  setValue('it-arc', meta.relatedArc);
  setValue('it-properties', meta.properties);

  // wire origin input to a datalist filtered to Locations
  const originEl = document.getElementById('it-origin'); if (originEl) { originEl.setAttribute('list','it-origin-list'); }
  if (!document.getElementById('it-origin-list')) { const dl = document.createElement('datalist'); dl.id = 'it-origin-list'; dl.dataset.pagesource = 'all'; dl.dataset.filterCategory = 'Locations'; document.body.appendChild(dl); }

  // wire related arc input to a datalist filtered to Arcs
  const arcEl = document.getElementById('it-arc'); if (arcEl) { arcEl.setAttribute('list','it-arc-list'); }
  if (!document.getElementById('it-arc-list')) { const dl = document.createElement('datalist'); dl.id = 'it-arc-list'; dl.dataset.pagesource = 'all'; dl.dataset.filterCategory = 'Arcs'; document.body.appendChild(dl); }
}

function applyExtrasToMeta(meta) {
  meta.type = getValue('it-type');
  meta.origin = getValue('it-origin');
  meta.rarity = getValue('it-rarity');
  meta.value = getValue('it-value');
  meta.relatedArc = getValue('it-arc');
  meta.properties = getValue('it-properties');
}

function renderView(ctx) {
  const { meta } = ctx;
  const blocks = [];
  if (meta.type) blocks.push(`<div><strong>Type:</strong> ${meta.type}</div>`);
  if (meta.rarity) blocks.push(`<div><strong>Rarity:</strong> ${meta.rarity}</div>`);
  if (meta.value) blocks.push(`<div><strong>Value:</strong> ${meta.value}</div>`);
  if (meta.origin) blocks.push(`<div><strong>Origin:</strong> ${meta.origin}</div>`);
  if (meta.relatedArc) {
      const arcSlug = encodeURIComponent(String(meta.relatedArc || '').trim().toLowerCase().replace(/\s+/g, '_'));
      blocks.push(`<div><strong>Related Arc:</strong> <a href="#/page/${arcSlug}" class="text-sky-400 hover:underline">${meta.relatedArc}</a></div>`);
  }
  if (meta.properties) blocks.push(`<div class="mt-2 text-gray-300">${meta.properties}</div>`);
  return blocks.length ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">${blocks.join('')}</div>` : '';
}

register({ id, label: 'Items', schema: { name: 'Items' }, renderExtras, applyExtrasToMeta, renderView });
