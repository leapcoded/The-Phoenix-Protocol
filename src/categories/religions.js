import { register } from './registry.js';
import { textInput, textarea, grid, select, getValue, setValue } from './_base.js';
import { parseMedia, serializeMedia, addMediaPreview, renderMediaHtml } from './mediaUtil.js';

const id = 'Religions';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;

  const html = grid(
    textInput('rel-pantheon', 'Pantheon / Central Focus'),
    textInput('rel-clergy', 'Clergy / Orders')
  ) + grid(
    textInput('rel-scripture', 'Scripture / Sacred Texts'),
    textInput('rel-holidays', 'Major Holidays')
  ) + textarea('rel-tenets', 'Key Tenets (summary)') + textarea('rel-rituals', 'Rituals/Practices');

  const mediaHtml = `
    <div class="col-span-2">
      <label for="rel-media-upload" class="block text-sm font-medium text-gray-300 mb-1">Media (images, audio & docs)</label>
      <div id="rel-media-preview" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-2"></div>
      <input type="file" id="rel-media-upload" multiple accept="image/*,audio/*,application/pdf" class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700"/>
      <div id="rel-media-progress" class="w-full bg-gray-700 rounded-full h-2.5 mt-2 hidden"><div class="bg-sky-600 h-2.5 rounded-full" style="width: 0%"></div></div>
    </div>`;
  const relatedHtml = `
    <div class="col-span-2">
      <label for="rel-related-culture" class="text-xs text-gray-400">Related Culture</label>
      <input id="rel-related-culture" list="rel-related-culture-list" type="text" class="w-full p-2 rounded bg-gray-700 text-gray-200 border border-gray-600" placeholder="Choose a culture..." />
  <datalist id="rel-related-culture-list" data-pagesource="all" data-filter-category="Cultures"></datalist>
    </div>`;

  container.innerHTML = html + mediaHtml + relatedHtml;
  const meta = (ctx && ctx.meta) || {};
  // religions extras rendered
  setValue('rel-pantheon', meta.pantheon);
  setValue('rel-clergy', meta.clergy);
  setValue('rel-scripture', meta.scripture);
  setValue('rel-holidays', meta.holidays);
  setValue('rel-tenets', meta.tenets);
  setValue('rel-rituals', meta.rituals);
  setValue('rel-related-culture', meta.relatedCulture);

  const previewContainer = document.getElementById('rel-media-preview');
  const existing = parseMedia(meta.media);
  existing.forEach(entry => addMediaPreview(entry.type, entry.url, entry.name, previewContainer));

  document.getElementById('rel-media-upload').addEventListener('change', handleMediaUploads);
}

function applyExtrasToMeta(meta) {
  meta.pantheon = getValue('rel-pantheon');
  meta.clergy = getValue('rel-clergy');
  meta.scripture = getValue('rel-scripture');
  meta.holidays = getValue('rel-holidays');
  meta.tenets = getValue('rel-tenets');
  meta.rituals = getValue('rel-rituals');
  meta.relatedCulture = getValue('rel-related-culture');

  const previewContainer = document.getElementById('rel-media-preview');
  if (previewContainer) {
     const entries = Array.from(previewContainer.querySelectorAll('[data-type][data-url]')).map(el => ({ type: el.dataset.type, url: el.dataset.url, name: el.dataset.name || '' }));
     meta.media = serializeMedia(entries);
  }
  // relatedCulture is saved via getValue elsewhere; keep value if present
}

function renderView(ctx) {
  const { meta } = ctx;
  const blocks = [];
  if (meta.pantheon) blocks.push(`<div><strong>Pantheon/Focus:</strong> ${meta.pantheon}</div>`);
  if (meta.clergy) blocks.push(`<div><strong>Clergy/Orders:</strong> ${meta.clergy}</div>`);
  if (meta.scripture) blocks.push(`<div><strong>Scripture:</strong> ${meta.scripture}</div>`);
  if (meta.holidays) blocks.push(`<div><strong>Holidays:</strong> ${meta.holidays}</div>`);
  if (meta.tenets) blocks.push(`<div class="mt-2 text-gray-300">${meta.tenets}</div>`);
  if (meta.rituals) blocks.push(`<div class="mt-2 text-gray-300">${meta.rituals}</div>`);
  // Render related culture as internal link if present
  if (meta.relatedCulture) {
    const slug = encodeURIComponent(String(meta.relatedCulture || '').trim().toLowerCase().replace(/\s+/g, '_'));
    const label = String(meta.relatedCulture || '').trim();
    blocks.push(`<div class="mt-2"><strong>Related Culture:</strong> <a href="#/page/${slug}" class="internal-link text-sky-400 hover:underline">${label}</a></div>`);
  }

  const mediaArr = parseMedia(meta.media);
  const mediaHtml = renderMediaHtml(mediaArr);

  return (blocks.length || mediaHtml) ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">${blocks.join('')}${mediaHtml ? `<div class="mt-4"><h4 class="text-sm font-semibold text-gray-300 mb-2">Media</h4><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">${mediaHtml}</div></div>` : ''}</div>` : '';
}

// Using shared addMediaPreview from mediaUtil

async function handleMediaUploads(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  const progressContainer = document.getElementById('rel-media-progress');
  const progressBar = progressContainer.querySelector('div');
  const previewContainer = document.getElementById('rel-media-preview');
  progressContainer.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const { uploadFile } = await import('../firebase.js');
      const kind = file.type.startsWith('audio') ? 'audio' : (file.type === 'application/pdf' ? 'pdf' : 'image');
      const url = await uploadFile(file, `religion-media`, (progress) => {
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

register({ id, label: 'Religions', schema: { name: 'Religions' }, renderExtras, applyExtrasToMeta, renderView });
