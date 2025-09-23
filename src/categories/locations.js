import { register } from './registry.js';
import { grid, textInput, textarea, getValue, setValue } from './_base.js';
import { parseMedia, serializeMedia, addMediaPreview } from './mediaUtil.js';

const id = 'Locations';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = grid(
    textInput('loc-region', 'Region / Planet'),
    textInput('loc-type', 'Type (City, Station, etc.)'),
    textInput('loc-population', 'Population'),
    textInput('loc-affiliation', 'Controlling Faction / Owner'),
  ) + textarea('loc-coords', 'Coordinates', 'Lat,Long or grid coords') + textarea('loc-notes', 'Notes', 'Climate, culture, hazards...') + `
  <div class="col-span-2">
    <label for="loc-gallery-upload" class="block text-sm font-medium text-gray-300 mb-1">Image Gallery</label>
    <div id="loc-gallery-preview" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-2"></div>
    <input type="file" id="loc-gallery-upload" multiple accept="image/*" class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700"/>
    <div id="loc-gallery-progress" class="w-full bg-gray-700 rounded-full h-2.5 mt-2 hidden"><div class="bg-sky-600 h-2.5 rounded-full" style="width: 0%"></div></div>
  </div>`;
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('loc-region', meta.region);
  setValue('loc-type', meta.type);
  setValue('loc-population', meta.population);
  setValue('loc-affiliation', meta.affiliation);
  setValue('loc-coords', meta.coords);
  setValue('loc-notes', meta.notes);
  // Populate existing gallery images (migrated to media JSON)
  const previewContainer = document.getElementById('loc-gallery-preview');
  const existing = parseMedia(meta.media);
  if (previewContainer) existing.filter(e=>e && e.type==='image').forEach(entry => addMediaPreview(entry.type, entry.url, entry.name, previewContainer));

  // Attach event listener for uploads
  const uploadEl = document.getElementById('loc-gallery-upload');
  if (uploadEl) uploadEl.addEventListener('change', handleGalleryUploads);

}
function applyExtrasToMeta(meta) {
  meta.region = getValue('loc-region');
  meta.type = getValue('loc-type');
  meta.population = getValue('loc-population');
  meta.affiliation = getValue('loc-affiliation');
  meta.coords = getValue('loc-coords');
  meta.notes = getValue('loc-notes');

  // Collect gallery entries from the preview container and serialize to meta.media
  const previewContainer = document.getElementById('loc-gallery-preview');
  if (previewContainer) {
    const entries = Array.from(previewContainer.querySelectorAll('[data-type][data-url]')).map(el => ({ type: el.dataset.type || 'image', url: el.dataset.url, name: el.dataset.name || '' }));
    meta.media = serializeMedia(entries);
  }
}

function renderView(ctx) {
  const { meta } = ctx;
  const items = [];
  if (meta.region) items.push(`<div><strong>Region:</strong> ${meta.region}</div>`);
  if (meta.type) items.push(`<div><strong>Type:</strong> ${meta.type}</div>`);
  if (meta.population) items.push(`<div><strong>Population:</strong> ${meta.population}</div>`);
  if (meta.affiliation) items.push(`<div><strong>Affiliation:</strong> ${meta.affiliation}</div>`);
  if (meta.coords) items.push(`<div><strong>Coordinates:</strong> ${meta.coords}</div>`);
  if (meta.notes) items.push(`<div class="mt-2 text-gray-300">${meta.notes}</div>`);
  const mediaArr = parseMedia(meta.media);
  const galleryImages = mediaArr.filter(e=>e && e.type==='image').map(entry => `
  <div class="w-full aspect-square bg-gray-900 rounded-lg overflow-hidden">
    <img src="${entry.url}" alt="Location image" class="w-full h-full object-cover" />
  </div>
  `).join('');

  return items.length || galleryImages ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">${items.join('')}${galleryImages ? `<div class="mt-4"><h4 class="text-sm font-semibold text-gray-300 mb-2">Gallery</h4><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">${galleryImages}</div></div>` : ''}</div>` : '';
}

// Use shared addMediaPreview from mediaUtil

async function handleGalleryUploads(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const progressContainer = document.getElementById('loc-gallery-progress');
  const progressBar = progressContainer ? progressContainer.querySelector('div') : null;
  const previewContainer = document.getElementById('loc-gallery-preview');
    
  if (progressContainer) progressContainer.classList.remove('hidden');
    
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
  try {
      // Dynamically import uploadFile to avoid import-time cycles
      const { uploadFile } = await import('../firebase.js');
      const url = await uploadFile(file, 'location-gallery', (progress) => {
        const overallProgress = ((i + (progress / 100)) / files.length) * 100;
        progressBar.style.width = `${overallProgress}%`;
      });
  if (previewContainer) addMediaPreview('image', url, file.name, previewContainer);
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
      // Optionally show an error message to the user
    }
  }

  if (progressBar) progressBar.style.width = '100%';
  setTimeout(() => {
    if (progressContainer) progressContainer.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    // Clear file input so same files can be selected again if needed
    const uploadEl = document.getElementById('loc-gallery-upload'); if (uploadEl) uploadEl.value = '';
  }, 1000);
}

register({ id, label: 'Locations', schema: { name: 'Locations' }, renderExtras, applyExtrasToMeta, renderView });
