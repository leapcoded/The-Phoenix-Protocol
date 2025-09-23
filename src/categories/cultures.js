import { register } from './registry.js';
import { grid, textInput, textarea, select, getValue, setValue } from './_base.js';
import { parseMedia, serializeMedia, addMediaPreview, renderMediaHtml } from './mediaUtil.js';

const id = 'Cultures';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;

  const govOptions = [
    { value: 'Tribal', label: 'Tribal' },
    { value: 'Monarchy', label: 'Monarchy' },
    { value: 'Democracy', label: 'Democracy' },
    { value: 'Corporate', label: 'Corporate' },
    { value: 'Theocracy', label: 'Theocracy' },
    { value: 'Other', label: 'Other' },
  ];

  const html = grid(
    textInput('cul-origin', 'Origin/Region'),
    textInput('cul-era', 'Era / Age'),
    textInput('cul-population', 'Population (est.)'),
    textInput('cul-language', 'Primary Language')
  ) + grid(
    select('cul-government', 'Government', govOptions),
    // make Dominant Religion an input with datalist to select existing Religions
    `
    <div>
      <label for="cul-religion" class="text-xs text-gray-400">Dominant Religion</label>
      <input id="cul-religion" list="cul-religion-list" type="text" class="w-full p-2 rounded bg-gray-700 text-gray-200 border border-gray-600" placeholder="Choose a religion..." />
      <datalist id="cul-religion-list" data-pagesource="all" data-filter-category="Religions"></datalist>
    </div>
    `
  ) + textarea('cul-customs', 'Customs and Values') + textarea('cul-notables', 'Notable Figures and Institutions');

  const mediaHtml = `
    <div class="col-span-2">
      <label for="cul-media-upload" class="block text-sm font-medium text-gray-300 mb-1">Media (images & documents)</label>
      <div id="cul-media-preview" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-2"></div>
      <input type="file" id="cul-media-upload" multiple accept="image/*,application/pdf" class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700"/>
      <div id="cul-media-progress" class="w-full bg-gray-700 rounded-full h-2.5 mt-2 hidden"><div class="bg-sky-600 h-2.5 rounded-full" style="width: 0%"></div></div>
    </div>`;
  // Add a related religion field (datalist populated by main.js)
  const relatedHtml = `
    <div class="col-span-2">
      <!-- RelatedReligion field removed; using Dominant Religion input (cul-religion) with datalist -->
    </div>`;

  container.innerHTML = html + mediaHtml;
  // cultures extras rendered
  const meta = (ctx && ctx.meta) || {};
  setValue('cul-origin', meta.origin);
  setValue('cul-era', meta.era);
  setValue('cul-population', meta.population);
  setValue('cul-language', meta.language);
  setValue('cul-government', meta.government);
  setValue('cul-religion', meta.religion);
  setValue('cul-customs', meta.customs);
  setValue('cul-notables', meta.notables);
  // legacy related field removed; religion holds the chosen religion name if any

  // populate existing media
  const previewContainer = document.getElementById('cul-media-preview');
  const existing = parseMedia(meta.media);
  existing.forEach(entry => addMediaPreview(entry.type, entry.url, entry.name, previewContainer));

  document.getElementById('cul-media-upload').addEventListener('change', handleMediaUploads);
}

function applyExtrasToMeta(meta) {
  meta.origin = getValue('cul-origin');
  meta.era = getValue('cul-era');
  meta.population = getValue('cul-population');
  meta.language = getValue('cul-language');
  meta.government = getValue('cul-government');
  meta.religion = getValue('cul-religion');
  meta.customs = getValue('cul-customs');
  meta.notables = getValue('cul-notables');
  
  const previewContainer = document.getElementById('cul-media-preview');
  if (previewContainer) {
    const entries = Array.from(previewContainer.querySelectorAll('[data-type][data-url]')).map(el => ({ type: el.dataset.type, url: el.dataset.url, name: el.dataset.name || '' }));
    meta.media = serializeMedia(entries);
  }
  // relatedReligion is already saved from the form input via setValue/getValue elsewhere
}

function renderView(ctx) {
  const { meta } = ctx;
  const blocks = [];
  if (meta.origin) blocks.push(`<div><strong>Origin:</strong> ${meta.origin}</div>`);
  if (meta.era) blocks.push(`<div><strong>Era:</strong> ${meta.era}</div>`);
  if (meta.population) blocks.push(`<div><strong>Population:</strong> ${meta.population}</div>`);
  if (meta.language) blocks.push(`<div><strong>Language:</strong> ${meta.language}</div>`);
  if (meta.government) blocks.push(`<div><strong>Government:</strong> ${meta.government}</div>`);
  if (meta.religion) blocks.push(`<div><strong>Religion:</strong> ${meta.religion}</div>`);
  if (meta.customs) blocks.push(`<div class="mt-2 text-gray-300">${meta.customs}</div>`);
  if (meta.notables) blocks.push(`<div class="mt-2 text-gray-300">${meta.notables}</div>`);
  // Render related religion as internal link if present
  if (meta.religion) {
    const slug = encodeURIComponent(String(meta.religion || '').trim().toLowerCase().replace(/\s+/g, '_'));
    const label = String(meta.religion || '').trim();
    blocks.push(`<div class="mt-2"><strong>Dominant Religion:</strong> <a href="#/page/${slug}" class="internal-link text-sky-400 hover:underline">${label}</a></div>`);
  }

  const mediaArr = parseMedia(meta.media);
  const mediaHtml = renderMediaHtml(mediaArr);

  return (blocks.length || mediaHtml) ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">${blocks.join('')}${mediaHtml ? `<div class="mt-4"><h4 class="text-sm font-semibold text-gray-300 mb-2">Media</h4><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">${mediaHtml}</div></div>` : ''}</div>` : '';
}

async function handleMediaUploads(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  const progressContainer = document.getElementById('cul-media-progress');
  const progressBar = progressContainer.querySelector('div');
  const previewContainer = document.getElementById('cul-media-preview');
  progressContainer.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const { uploadFile } = await import('../firebase.js');
      const isPdf = file.type === 'application/pdf';
      const kind = isPdf ? 'pdf' : 'image';
      const url = await uploadFile(file, `culture-media`, (progress) => {
        const overallProgress = ((i + (progress / 100)) / files.length) * 100;
        progressBar.style.width = `${overallProgress}%`;
      });
      addMediaPreview(kind, url, file.name, previewContainer);
    } catch (err) {
      console.error('Media upload failed', err);
    }
  }

  progressBar.style.width = '100%';
  setTimeout(() => { progressContainer.classList.add('hidden'); progressBar.style.width = '0%'; }, 800);
}

register({ id, label: 'Cultures', schema: { name: 'Cultures' }, renderExtras, applyExtrasToMeta, renderView });
