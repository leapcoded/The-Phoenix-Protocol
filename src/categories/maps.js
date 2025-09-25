import { register } from './registry.js';
import { grid, textInput, textarea, getValue, setValue } from './_base.js';
import { parseMap, serializeMap, pixelToNorm, normToPixel, uploadMapImage } from './mapUtil.js';
import { deletePage, deleteFile } from '../firebase.js';

const id = 'Maps';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;

  const html = `
    <div class="col-span-2">
      <label class="block text-sm font-medium text-gray-300 mb-1">Map Image</label>
      <div id="map-image-preview" class="w-full bg-gray-800 rounded mb-2" style="height:320px;position:relative;overflow:hidden;border:1px solid #333"></div>
      <input type="file" id="map-image-upload" accept="image/*" class="block w-full text-sm text-gray-400" />
      <div id="map-image-upload-progress" class="mt-2" style="display:none;">
        <div style="height:6px; background:#0f172a; border:1px solid #334155; border-radius:999px; overflow:hidden;">
          <div id="map-image-upload-progress-bar" style="height:100%; width:0%; background:linear-gradient(90deg, #22c55e, #16a34a);"></div>
        </div>
        <div id="map-image-upload-progress-text" class="text-xs mt-1" style="color:#a3e635;">Uploading 0%</div>
      </div>
      <div class="mt-2">Click on the map to place markers. Use mouse to pan and wheel to zoom.</div>
    </div>
  `;

  container.innerHTML = grid(html);

  const meta = (ctx && ctx.meta) || {};
  const mapObj = parseMap(meta.map);

  const preview = document.getElementById('map-image-preview');
  setupMapCanvas(preview, mapObj);

  const uploadEl = document.getElementById('map-image-upload');
  const upWrap = document.getElementById('map-image-upload-progress');
  const upBar = document.getElementById('map-image-upload-progress-bar');
  const upText = document.getElementById('map-image-upload-progress-text');
  if (uploadEl) uploadEl.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    // read image to get natural size then upload
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.readAsDataURL(file);
    img.onload = async () => {
      try {
        const pageSlug = (window.currentPage || '').toString().trim().toLowerCase().replace(/\s+/g,'_') || 'map';
        if (upWrap) upWrap.style.display = '';
        const url = await uploadMapImage(file, pageSlug, (p)=>{
          if (upBar) upBar.style.width = Math.round(p) + '%';
          if (upText) upText.textContent = 'Uploading ' + Math.round(p) + '%';
        });
        mapObj.imageUrl = url;
        mapObj.imageSize = { width: img.naturalWidth, height: img.naturalHeight };
        // re-init canvas with new image
        setupMapCanvas(preview, mapObj);
        if (upWrap) upWrap.style.display = 'none';
      } catch (err) { console.error('map upload failed', err); }
    };
  });
}

function applyExtrasToMeta(meta) {
  const preview = document.getElementById('map-image-preview');
  if (!preview) return;
  const mapState = preview._mapState || { metaVersion:1, layers:[], markers:[] };
  meta.map = serializeMap(mapState);
}

function renderView(ctx) {
  // Fullscreen interactive map modal (viewer + quick editor)
  const meta = (ctx && ctx.meta) || {};
  const mapObj = parseMap(meta.map);
  const html = `
  <div id="maps-canvas-root" class="w-full min-h-screen flex flex-col" style="position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483646;background:radial-gradient(1200px 800px at 60% 35%, rgba(24,35,58,1) 0%, rgba(10,16,28,1) 60%, rgba(5,8,15,1) 100%);">
    <div id="maps-canvas-wrap" class="relative" style="position:absolute; inset:0; padding:0; overflow:hidden; touch-action:none; width:100vw; height:100vh;">
  <div id="maps-toolbar" style="position:fixed; top:12px; right:12px; z-index:2147483647; display:flex; gap:8px; align-items:center; background:linear-gradient(90deg, rgba(59,130,246,0.03), rgba(236,72,153,0.02)); border:1px solid rgba(255,255,255,0.035); border-radius:14px; padding:8px 10px; box-shadow:0 14px 40px rgba(2,6,23,0.48), inset 0 1px 0 rgba(255,255,255,0.02); backdrop-filter: blur(26px) saturate(150%); -webkit-backdrop-filter: blur(26px) saturate(150%); cursor:move;">
  <select id="map-select" class="px-2 py-1 bg-gray-800 text-gray-200 rounded"></select>
  <select id="map-tool" class="px-2 py-1 bg-gray-800 text-gray-200 rounded" title="Tool">
    <option value="pan">🖐️ Pan</option>
    <option value="select">🔎 Select/Move</option>
    <option value="location">📍 Location</option>
    <option value="home">🏠 Home</option>
    <option value="feature">⭐ Feature</option>
    <option value="character">👤 Character</option>
  </select>
  <button id="map-cats-toggle" class="px-2 py-1 text-sm text-gray-300 border border-gray-700 rounded">Categories</button>
  <button id="map-center" class="px-2 py-1 text-sm text-sky-300 border border-gray-700 rounded">Centre</button>
  <button id="map-zoom-out" class="px-2 py-1 text-sm text-gray-300 border border-gray-700 rounded">-</button>
  <span id="map-zoom" class="text-xs text-gray-300">100%</span>
  <button id="map-zoom-in" class="px-2 py-1 text-sm text-gray-300 border border-gray-700 rounded">+</button>
  <button id="map-load" class="px-2 py-1 text-sm text-sky-400 border border-gray-700 rounded">Load</button>
  <button id="map-new" class="px-2 py-1 text-sm text-emerald-400 border border-gray-700 rounded">New Map</button>
  <button id="map-delete" class="px-2 py-1 text-sm text-red-300 border border-gray-700 rounded">Delete</button>
  <button id="map-save" class="px-2 py-1 text-sm text-emerald-400 border border-gray-700 rounded">Save</button>
  <button id="map-close" class="px-2 py-1 text-sm text-red-400 border border-gray-700 rounded">Close</button>
      </div>
      <div id="map-image-preview" class="w-full h-full bg-gray-800 rounded" style="position:relative; overflow:hidden; border:1px solid #333;"></div>

      <div id="map-categories-panel" style="display:none; position:fixed; top:56px; right:12px; z-index:2147483647; background:linear-gradient(180deg, rgba(2,6,23,0.9), rgba(2,6,23,0.8)); border:1px solid rgba(148,163,184,0.08); border-radius:10px; padding:10px; color:#e2e8f0; max-width:320px;">
        <div style="font-weight:600; margin-bottom:6px;">Marker Categories</div>
        <div id="map-categories-list" style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow:auto; padding-bottom:6px;">
          <!-- category checkboxes injected here -->
        </div>
        <div style="margin-top:8px; border-top:1px solid rgba(148,163,184,0.04); padding-top:8px;">
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px;">Create category</div>
          <div style="display:grid; grid-template-columns: 1fr auto; gap:6px; align-items:center;">
            <input id="map-new-cat-name" placeholder="name (no spaces)" style="padding:6px; background:#081023; border:1px solid #334155; color:#e2e8f0; border-radius:6px;" />
            <input id="map-new-cat-color" type="color" value="#3b82f6" title="color" style="width:44px; height:34px; padding:0; border-radius:6px; border:1px solid #334155; background:#081023;" />
          </div>
          <div style="display:flex; gap:6px; margin-top:6px; align-items:center;">
            <input id="map-new-cat-icon" placeholder="icon (emoji)" style="width:64px; padding:6px; background:#081023; border:1px solid #334155; color:#e2e8f0; border-radius:6px;" />
            <button id="map-new-cat-add" class="px-2 py-1 text-xs" style="background:#059669; color:white; border:1px solid #065f46; border-radius:8px;">Add</button>
          </div>
        </div>
      </div>

      <div id="map-marker-inspector" style="display:none; position:fixed; bottom:16px; left:16px; z-index:2147483647; min-width:260px; background:linear-gradient(180deg, rgba(2,6,23,0.8), rgba(2,6,23,0.6)); border:1px solid rgba(148,163,184,0.2); border-radius:12px; padding:10px; box-shadow:0 14px 40px rgba(2,6,23,0.6); color:#e2e8f0;">
        <div style="font-weight:600; font-size:14px; margin-bottom:6px;">Marker</div>
        <div style="display:grid; grid-template-columns:1fr; gap:8px;">
          <div>
            <label style="display:block; font-size:12px; color:#cbd5e1; margin-bottom:3px;">Label</label>
            <input id="map-marker-label" type="text" style="width:100%; padding:6px 8px; background:#0b1220; color:#e2e8f0; border:1px solid #334155; border-radius:8px;"/>
          </div>
          <div>
            <label style="display:block; font-size:12px; color:#cbd5e1; margin-bottom:3px;">Linked Page</label>
            <input id="map-marker-page" type="text" placeholder="optional" style="width:100%; padding:6px 8px; background:#0b1220; color:#e2e8f0; border:1px solid #334155; border-radius:8px;"/>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="map-marker-open" class="px-2 py-1 text-xs" style="background:#0f172a; color:#93c5fd; border:1px solid #334155; border-radius:8px;">Open</button>
            <button id="map-marker-delete" class="px-2 py-1 text-xs" style="background:#7f1d1d; color:#fecaca; border:1px solid #7f1d1d; border-radius:8px;">Delete</button>
            <button id="map-marker-close" class="px-2 py-1 text-xs" style="background:#111827; color:#cbd5e1; border:1px solid #334155; border-radius:8px;">Close</button>
          </div>
        </div>
      </div>

      <!-- New Map Modal -->
      <div id="map-new-modal" style="display:none; position:fixed; inset:0; z-index:2147483647;">
        <div style="position:absolute; inset:0; background:rgba(0,0,0,0.6);"></div>
        <div style="position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:min(92vw, 720px); background:linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)); border:1px solid rgba(255,255,255,0.18); border-radius:14px; box-shadow:0 24px 60px rgba(2,6,23,0.6); backdrop-filter: blur(22px) saturate(150%); -webkit-backdrop-filter: blur(22px) saturate(150%); padding:16px;">
          <div style="font-weight:600; color:#e2e8f0; font-size:16px; margin-bottom:8px;">Create New Map</div>
          <div style="display:grid; grid-template-columns: 1fr; gap:12px;">
            <div>
              <label style="display:block; color:#cbd5e1; font-size:12px; margin-bottom:4px;">Name</label>
              <input id="map-new-name" type="text" placeholder="E.g., Capital City" style="width:100%; padding:8px 10px; background:#0f172a; color:#e2e8f0; border:1px solid #334155; border-radius:8px;" />
            </div>
            <div>
              <label style="display:block; color:#cbd5e1; font-size:12px; margin-bottom:4px;">Map Image</label>
              <input id="map-new-file" type="file" accept="image/*" style="display:block; width:100%; color:#cbd5e1;" />
              <div id="map-new-preview" style="margin-top:8px; height:240px; border:1px dashed #334155; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px; position:relative;">No image selected</div>
              <div id="map-upload-progress" style="display:none; margin-top:8px;">
                <div style="height:8px; background:#0f172a; border:1px solid #334155; border-radius:999px; overflow:hidden;">
                  <div id="map-upload-progress-bar" style="height:100%; width:0%; background:linear-gradient(90deg, #22c55e, #16a34a);"></div>
                </div>
                <div id="map-upload-progress-text" style="margin-top:6px; font-size:12px; color:#a3e635;">Uploading 0%</div>
              </div>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:6px;">
              <button id="map-new-cancel" class="px-3 py-1 text-sm" style="background:#0f172a; color:#cbd5e1; border:1px solid #334155; border-radius:8px;">Cancel</button>
              <button id="map-new-create" class="px-3 py-1 text-sm" style="background:#059669; color:white; border:1px solid #065f46; border-radius:8px;">Create</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  return html;
}

// Initialize fullscreen maps modal behaviour (wired by registry init when available)
function init() {
  const rootId = 'maps-canvas-root';
  // Remove any existing overlays to avoid stale state, then create fresh
  Array.from(document.querySelectorAll('#' + rootId)).forEach(r => { try { r.remove(); } catch(_) { } });
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderView();
  document.body.appendChild(wrapper.firstElementChild);
  const root = document.getElementById(rootId);
  if (!root) return;
  try { document.body.style.overflow = 'hidden'; } catch (_){ }
  try { document.documentElement.style.overflow = 'hidden'; } catch(_){ }

  const selectEl = document.getElementById('map-select');
  const newBtn = document.getElementById('map-new');
  const closeBtn = document.getElementById('map-close');
  const preview = document.getElementById('map-image-preview');
  const toolbar = document.getElementById('maps-toolbar');
  const toolSel = document.getElementById('map-tool');
  const newModal = document.getElementById('map-new-modal');
  const newNameEl = document.getElementById('map-new-name');
  const newFileEl = document.getElementById('map-new-file');
  const newPrev = document.getElementById('map-new-preview');
  const newCancel = document.getElementById('map-new-cancel');
  const newCreate = document.getElementById('map-new-create');
  const delBtn = document.getElementById('map-delete');
  const loadBtn = document.getElementById('map-load');
  const upWrap = document.getElementById('map-upload-progress');
  const upBar = document.getElementById('map-upload-progress-bar');
  const upText = document.getElementById('map-upload-progress-text');

  function populateList() {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const pages = window.wikiPages || {};
    const keys = Object.keys(pages);
    // include pages categorized as Maps OR with an existing meta.map value
    const maps = keys.filter(k => {
      const p = pages[k] || {}; const m = p.meta || {};
      const cat = (m.category || '').toString().toLowerCase();
      return cat === 'maps' || !!m.map;
    }).sort((a,b)=>a.localeCompare(b));
    if (maps.length === 0) {
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'No maps yet'; selectEl.appendChild(opt);
    } else {
      maps.forEach(k => {
        const p = pages[k] || {}; const m = p.meta || {};
        const title = (m.title || m.name) ? (m.title || m.name) : k;
        const opt = document.createElement('option'); opt.value = k; opt.textContent = title; selectEl.appendChild(opt);
      });
    }
  }

  populateList();

  // Auto-select last used map or the first available
  (function autoSelectInitial(){
    if (!selectEl) return;
    const pages = window.wikiPages || {};
    const last = localStorage.getItem('lastMapSlug');
    if (last && pages[last]) { selectEl.value = last; selectEl.dispatchEvent(new Event('change')); return; }
    if (selectEl.options && selectEl.options.length > 0) {
      let idx = -1;
      for (let i=0;i<selectEl.options.length;i++){ if (selectEl.options[i].value) { idx = i; break; } }
      if (idx >= 0) { selectEl.selectedIndex = idx; selectEl.dispatchEvent(new Event('change')); }
    }
  })();

  // Force-load from local cache if nothing selected or data not ready
  (function forceLoadFromCache(){
    try {
      const pages = window.wikiPages || {};
      const selVal = selectEl && selectEl.value;
      const validSelected = selVal && pages[selVal];
      if (!validSelected) {
        const cached = localStorage.getItem('lastMapState');
        if (cached && preview) {
          try { const state = JSON.parse(cached); if (state && state.imageUrl) { setupMapCanvas(preview, state, toolSel && toolSel.value); } } catch(_){ }
        }
      }
    } catch(_){ }
  })();

  // Re-populate when pages load/update asynchronously
  const onPagesUpdated = () => {
    const prev = (selectEl && selectEl.value) || localStorage.getItem('lastMapSlug') || '';
    populateList();
    const pages = window.wikiPages || {};
    if (prev && pages[prev]) { selectEl.value = prev; selectEl.dispatchEvent(new Event('change')); return; }
    // otherwise choose first non-empty
    if (selectEl && selectEl.options && selectEl.options.length > 0) {
      let idx = -1; for (let i=0;i<selectEl.options.length;i++){ if (selectEl.options[i].value){ idx=i; break; } }
      if (idx>=0){ selectEl.selectedIndex = idx; selectEl.dispatchEvent(new Event('change')); }
    }
  };
  try { window.addEventListener('wikiPagesUpdated', onPagesUpdated); } catch(_){ }

  function loadSelectedMap() {
    if (!selectEl || !preview) return;
    const slug = selectEl.value;
    const pages = window.wikiPages || {};
    const p = pages[slug];
    if (!p) {
      console.warn(`Map page "${slug}" not found in wikiPages.`);
      return;
    }
    try { localStorage.setItem('lastMapSlug', slug); } catch(_){ }
    const mapState = parseMap(p.meta && p.meta.map);
    setupMapCanvas(preview, mapState, toolSel && toolSel.value);
    try { localStorage.setItem('lastMapState', typeof mapState === 'string' ? mapState : JSON.stringify(mapState)); } catch(_){ }
  }

  loadBtn && loadBtn.addEventListener('click', loadSelectedMap);

  selectEl && selectEl.addEventListener('change', loadSelectedMap);

  function openNewModal(){ if (newModal) newModal.style.display = ''; if (newNameEl) newNameEl.value = ''; if (newPrev) newPrev.innerHTML = 'No image selected'; if (newFileEl) newFileEl.value=''; if (upWrap){ upWrap.style.display='none'; if (upBar) upBar.style.width='0%'; if (upText) upText.textContent=''; } }
  function closeNewModal(){ if (newModal) newModal.style.display = 'none'; }
  newBtn && newBtn.addEventListener('click', openNewModal);
  newCancel && newCancel.addEventListener('click', closeNewModal);
  if (newFileEl && newPrev) {
    newFileEl.addEventListener('change', ()=>{
      const f = newFileEl.files && newFileEl.files[0];
      if (!f) { newPrev.innerHTML = 'No image selected'; return; }
      const img = new Image(); const r = new FileReader();
      r.onload = ()=>{ img.src = r.result; };
      img.onload = ()=>{ newPrev.innerHTML = `<img src="${img.src}" style="max-width:100%; max-height:100%; object-fit:contain;"/>`; };
      r.readAsDataURL(f);
    });
  }
  newCreate && newCreate.addEventListener('click', async ()=>{
    try {
      const name = (newNameEl && newNameEl.value || '').trim();
      if (!name) { alert('Please enter a map name'); return; }
      const file = newFileEl && newFileEl.files && newFileEl.files[0];
      if (!file) { alert('Please select an image'); return; }
      const slug = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_\-]/g,'');
      // get natural size
      const img = new Image(); const r = new FileReader();
      const dims = await new Promise((resolve,reject)=>{
        r.onload = ()=>{ img.src = r.result; };
        img.onload = ()=> resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject; r.readAsDataURL(file);
      });
      if (upWrap) upWrap.style.display = '';
      const url = await uploadMapImage(file, slug, (p)=>{
        if (upBar) upBar.style.width = Math.round(p) + '%';
        if (upText) upText.textContent = 'Uploading ' + Math.round(p) + '%';
      });
      const mapState = { metaVersion:1, imageUrl: url, imageSize: { width: dims.w, height: dims.h }, scale:1, layers:[], markers:[] };
      // create map page data
      const page = { meta: { category: 'Maps', title: name, map: JSON.stringify(mapState) }, content: '' };
      if (!window.saveWikiPage) { alert('Save not available'); return; }
      window.saveWikiPage(slug, page);
      try { localStorage.setItem('lastMapSlug', slug); localStorage.setItem('lastMapState', JSON.stringify(mapState)); } catch(_){ }
      closeNewModal();
      // refresh list and select the new map
      populateList();
      if (selectEl) { selectEl.value = slug; try { localStorage.setItem('lastMapSlug', slug); } catch(_){ } selectEl.dispatchEvent(new Event('change')); }
      alert('Map created.');
    } catch (e) { console.error('Create map failed', e); alert('Create map failed'); }
  });

  const zoomLabel = document.getElementById('map-zoom');
  const zoomInBtn = document.getElementById('map-zoom-in');
  const zoomOutBtn = document.getElementById('map-zoom-out');
  const centerBtn = document.getElementById('map-center');

  zoomInBtn && zoomInBtn.addEventListener('click', ()=>{
    // dispatch event to canvas to request zoom in
    try { preview && preview.dispatchEvent(new CustomEvent('map-zoom', { detail: { delta: 1.1 } })); } catch(_){}
  });
  zoomOutBtn && zoomOutBtn.addEventListener('click', ()=>{
    try { preview && preview.dispatchEvent(new CustomEvent('map-zoom', { detail: { delta: 0.9 } })); } catch(_){}
  });
  centerBtn && centerBtn.addEventListener('click', ()=>{ try { preview && preview.dispatchEvent(new CustomEvent('map-center')); } catch(_){} });

  function restoreAndClose(){
    try { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; } catch(_) {}
    try { window.removeEventListener('wikiPagesUpdated', onPagesUpdated); } catch(_){ }
    try {
      const mr = document.getElementById('maps-canvas-root');
      if (mr) { try { mr.__maps_inited = false; } catch(_){ }
        if (mr.parentElement) { try { mr.parentElement.removeChild(mr); } catch(_) { mr.remove && mr.remove(); } }
      }
    } catch(_){ }
    try { location.hash = '#/'; } catch(_){ }
  }
  closeBtn && closeBtn.addEventListener('click', restoreAndClose);
  // Draggable toolbar (mirror relationships)
  (function(){
    if (!toolbar) return;
    let draggingTB = false;
    let tbOffset = {x:0,y:0};
    function setToolbarPos(left, top){
      const vw = window.innerWidth || 0; const vh = window.innerHeight || 0;
      const rect = toolbar.getBoundingClientRect();
      const cl = Math.max(8, Math.min(left, vw - rect.width - 8));
      const ct = Math.max(8, Math.min(top, vh - rect.height - 8));
      toolbar.style.left = cl + 'px'; toolbar.style.top = ct + 'px'; toolbar.style.right = 'auto';
    }
  function onTBDown(e){ if (e.target.closest('button, select, input, textarea')) return; draggingTB = true; const r = toolbar.getBoundingClientRect(); tbOffset = { x: e.clientX - r.left, y: e.clientY - r.top }; e.preventDefault(); }
    function onTBMove(e){ if (!draggingTB) return; setToolbarPos(e.clientX - tbOffset.x, e.clientY - tbOffset.y); }
    function onTBUp(){ draggingTB = false; }
    toolbar.addEventListener('mousedown', onTBDown);
    window.addEventListener('mousemove', onTBMove);
    window.addEventListener('mouseup', onTBUp);
  })();

  const saveBtn = document.getElementById('map-save');
  toolSel && toolSel.addEventListener('change', ()=>{
    if (preview) {
      preview._mapTool = toolSel.value;
    }
  });
  // Delete map handler
  delBtn && delBtn.addEventListener('click', async ()=>{
    try {
      const slug = (selectEl && selectEl.value) || '';
      if (!slug) { alert('Select a map to delete.'); return; }
      if (!confirm('Delete this map page? This cannot be undone.')) return;

      // Get the map data to find the image URL before deleting the page
      const pages = window.wikiPages || {};
      const pageToDelete = pages[slug];
      if (pageToDelete && pageToDelete.meta && pageToDelete.meta.map) {
        const mapState = parseMap(pageToDelete.meta.map);
        if (mapState.imageUrl) {
          await deleteFile(mapState.imageUrl);
        }
      }

      await deletePage(slug);
      // Remove from local cache if present
      try { if (window.wikiPages) delete window.wikiPages[slug]; } catch(_){ }
      populateList();
      // Reset preview state
      if (preview) { preview.innerHTML=''; setupMapCanvas(preview, { metaVersion:1, layers:[], markers:[] }); }
      if (selectEl) { selectEl.selectedIndex = 0; const val = selectEl.options[0] && selectEl.options[0].value; if (val) { try { localStorage.setItem('lastMapSlug', val); } catch(_){ } } selectEl.dispatchEvent(new Event('change')); }
      try { showToast && showToast('Map deleted'); } catch(_){ alert('Map deleted'); }
    } catch (e) { console.error('Failed to delete map', e); try { showToast && showToast('Delete failed','error'); } catch(_){ alert('Delete failed'); } }
  });
  saveBtn && saveBtn.addEventListener('click', ()=>{
    try {
      let slug = (selectEl && selectEl.value) || (window.currentPage || '');
      if (!slug) { openNewModal(); return; }
      const pages = window.wikiPages || {};
      const page = pages[slug] || { meta:{ category: 'Maps' }, content: '' };
      const mapState = (preview && preview._mapState) || { metaVersion:1, layers:[], markers:[] };
      page.meta = page.meta || {};
      page.meta.map = typeof mapState === 'string' ? mapState : JSON.stringify(mapState);
      if (window.saveWikiPage) {
        window.saveWikiPage(slug, page);
        try { showToast && showToast('Map saved.'); } catch(_){}
        try { localStorage.setItem('lastMapSlug', slug); localStorage.setItem('lastMapState', page.meta.map); } catch(_){ }
      } else {
        alert('Save function not available');
      }
    } catch (e) { console.error('Map save failed', e); try{ showToast && showToast('Map save failed','error'); }catch(_){} }
  });

  // mark as initialized so future calls don't double-bind
  try { root.__maps_inited = true; } catch(_) {}
}

// Expose init so registry can call it if supported
export { init };

function setupMapCanvas(container, mapObj, initialTool) {
  if (!container) return;
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let img = new Image();
  let scale = 1, offsetX = 0, offsetY = 0;
  let isPanning = false, startX=0, startY=0, moved=false;
  let needsRedraw = false; let rafId = 0;
  container._mapTool = initialTool || container._mapTool || 'pan';
  container._selectedMarkerId = container._selectedMarkerId || null;
  // default visible categories
  container._visibleCategories = container._visibleCategories || { location:true, home:true, feature:true, character:true };
  // category metadata: { type: { color, icon } }
  container._categoryMeta = container._categoryMeta || null;
  function loadCategoryMeta(){
    try {
      const raw = localStorage.getItem('map_custom_categories');
      const parsed = raw ? JSON.parse(raw) : null;
      const defaults = {
        location: { color: '#3b82f6', icon: '📍' },
        home: { color: '#f59e0b', icon: '🏠' },
        feature: { color: '#10b981', icon: '⭐' },
        character: { color: '#ec4899', icon: '👤' }
      };
      container._categoryMeta = Object.assign({}, defaults, parsed || {});
    } catch(_) { container._categoryMeta = {
      location: { color: '#3b82f6', icon: '📍' }, home: { color: '#f59e0b', icon: '🏠' }, feature: { color: '#10b981', icon: '⭐' }, character: { color: '#ec4899', icon: '👤' }
    }; }
  }
  function saveCategoryMeta(){ try { localStorage.setItem('map_custom_categories', JSON.stringify(container._categoryMeta || {})); } catch(_){} }
  loadCategoryMeta();

  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
    requestDraw();
  }
  window.addEventListener('resize', resizeCanvas, { passive: true });

  function drawNow() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!img || !img.src) return;
    const iw = img.naturalWidth || (mapObj.imageSize && mapObj.imageSize.width) || canvas.width;
    const ih = img.naturalHeight || (mapObj.imageSize && mapObj.imageSize.height) || canvas.height;
    img.width = iw * scale; img.height = ih * scale;
    ctx.drawImage(img, offsetX, offsetY, iw * scale, ih * scale);
    // draw markers (respect visibility)
    (mapObj.markers||[]).forEach(m => {
      if (!(container._visibleCategories && container._visibleCategories[m.type])) return;
      const px = offsetX + (m.x * iw) * scale;
      const py = offsetY + (m.y * ih) * scale;
  // determine color/icon from category meta or marker override
  const cat = (container._categoryMeta && container._categoryMeta[m.type]) || {};
  const color = m.color || cat.color || '#3b82f6';
  const icon = m.icon || cat.icon || '';
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI*2); ctx.fill();
  // draw icon if present
  if (icon) { ctx.fillStyle = '#071224'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(icon, px, py + 5); }
  // label small
  if (m.label) { ctx.fillStyle = '#e2e8f0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.label, px, py - 16); }
      // selection highlight
      if (container._selectedMarkerId === m.id) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI*2); ctx.stroke(); }
    });
  }
  function requestDraw(){
    if (needsRedraw) return;
    needsRedraw = true;
    rafId = window.requestAnimationFrame(()=>{ needsRedraw = false; drawNow(); });
  }

  canvas.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    scale *= delta; scale = Math.max(0.1, Math.min(10, scale));
    try {
      const zl = container.parentElement && container.parentElement.querySelector && container.parentElement.querySelector('#map-zoom');
      if (zl) zl.textContent = Math.round(scale*100) + '%';
    } catch(_){}
    requestDraw();
  });

  // handle external zoom events (toolbar)
  container.addEventListener('map-zoom', (ev) => {
    try {
      const delta = (ev && ev.detail && ev.detail.delta) || 1;
      scale *= delta; scale = Math.max(0.1, Math.min(10, scale));
      const zl = container.parentElement && container.parentElement.querySelector && container.parentElement.querySelector('#map-zoom');
      if (zl) zl.textContent = Math.round(scale*100) + '%';
      requestDraw();
    } catch(_){}
  });

  canvas.addEventListener('mousedown', (e)=>{
    isPanning = true; startX = e.clientX; startY = e.clientY; moved = false;
  });
  window.addEventListener('mouseup', ()=>{ isPanning = false; });
  window.addEventListener('mousemove', (e)=>{
    if (!isPanning) return;
    const dx = e.clientX - startX; const dy = e.clientY - startY;
    startX = e.clientX; startY = e.clientY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
    // Only pan in pan tool
    if ((container._mapTool || 'pan') === 'pan') {
      offsetX += dx; offsetY += dy; requestDraw();
    }
  });

  // place marker on click (non-pan click)
  canvas.addEventListener('click', (e)=>{
    if (moved) { moved = false; return; }
    const tool = container._mapTool || 'pan';
    if (tool === 'pan') return; // do not place markers in pan mode
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const iw = img.naturalWidth || (mapObj.imageSize && mapObj.imageSize.width) || canvas.width;
    const ih = img.naturalHeight || (mapObj.imageSize && mapObj.imageSize.height) || canvas.height;
    // Convert screen -> image coordinates by inverting transform
    const imgX = (x - offsetX) / scale;
    const imgY = (y - offsetY) / scale;
    const norm = { x: Math.max(0, Math.min(1, imgX / iw)), y: Math.max(0, Math.min(1, imgY / ih)) };
    if (tool === 'select') {
      // check for marker hit
      const hit = hitMarkerAtClient(e.clientX, e.clientY);
      if (hit) {
        container._selectedMarkerId = hit.id; container._dragMarkerId = null;
        // show inspector
        const insp = document.getElementById('map-marker-inspector'); if (insp) insp.style.display = 'block';
        const inLabel = document.getElementById('map-marker-label'); if (inLabel) inLabel.value = hit.label || '';
        const inPage = document.getElementById('map-marker-page'); if (inPage) inPage.value = hit.linkedPage || '';
        requestDraw();
        return;
      } else {
        container._selectedMarkerId = null; const insp = document.getElementById('map-marker-inspector'); if (insp) insp.style.display = 'none'; requestDraw(); return;
      }
    }
    const id = 'm-'+Date.now();
    const marker = { id, type: tool, x: norm.x, y: norm.y, floor: 'ground', z: 0, label: 'New ' + tool.charAt(0).toUpperCase()+tool.slice(1), linkedPage: null, icon: 'default-pin', meta: {}, createdAt: new Date().toISOString() };
    mapObj.markers = mapObj.markers || []; mapObj.markers.push(marker);
    container._mapState = mapObj;
    requestDraw();
  });

  // marker hit-testing
  function hitMarkerAtClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(); const x = clientX - rect.left; const y = clientY - rect.top;
    const iw = img.naturalWidth || (mapObj.imageSize && mapObj.imageSize.width) || canvas.width;
    const ih = img.naturalHeight || (mapObj.imageSize && mapObj.imageSize.height) || canvas.height;
    let found = null;
    (mapObj.markers||[]).forEach(m => {
      if (!(container._visibleCategories && container._visibleCategories[m.type])) return;
      const px = offsetX + (m.x * iw) * scale; const py = offsetY + (m.y * ih) * scale;
      const dx = x - px; const dy = y - py; const r = 10;
      if ((dx*dx + dy*dy) <= r*r) found = m;
    });
    return found;
  }

  // dragging selected marker
  canvas.addEventListener('mousedown', (e)=>{
    const tool = container._mapTool || 'pan';
    if (tool === 'select') {
      const hit = hitMarkerAtClient(e.clientX, e.clientY);
      if (hit) { container._dragMarkerId = hit.id; container._dragOffset = { x: e.clientX, y: e.clientY }; }
    }
  });
  window.addEventListener('mousemove', (e)=>{
    if (container._dragMarkerId) {
      const mid = container._dragMarkerId; const iw = img.naturalWidth || (mapObj.imageSize && mapObj.imageSize.width) || canvas.width; const ih = img.naturalHeight || (mapObj.imageSize && mapObj.imageSize.height) || canvas.height;
      const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
      const imgX = (x - offsetX) / scale; const imgY = (y - offsetY) / scale; const norm = { x: Math.max(0, Math.min(1, imgX / iw)), y: Math.max(0, Math.min(1, imgY / ih)) };
      const m = (mapObj.markers||[]).find(z => z.id === mid); if (m) { m.x = norm.x; m.y = norm.y; container._mapState = mapObj; try { localStorage.setItem('lastMapState', JSON.stringify(mapObj)); } catch(_){} requestDraw(); }
    }
  });
  window.addEventListener('mouseup', ()=>{ if (container._dragMarkerId) { container._dragMarkerId = null; try { localStorage.setItem('lastMapState', JSON.stringify(mapObj)); } catch(_){} } });

  // Inspector wiring
  const markerClose = document.getElementById('map-marker-close');
  const markerDelete = document.getElementById('map-marker-delete');
  const markerOpen = document.getElementById('map-marker-open');
  const markerLabelInput = document.getElementById('map-marker-label');
  const markerPageInput = document.getElementById('map-marker-page');
  if (markerClose) markerClose.addEventListener('click', ()=>{ const insp = document.getElementById('map-marker-inspector'); if (insp) insp.style.display='none'; container._selectedMarkerId=null; requestDraw(); });
  if (markerDelete) markerDelete.addEventListener('click', ()=>{ const mid = container._selectedMarkerId; if (!mid) return; mapObj.markers = (mapObj.markers||[]).filter(m => m.id !== mid); container._selectedMarkerId = null; const insp = document.getElementById('map-marker-inspector'); if (insp) insp.style.display='none'; try { localStorage.setItem('lastMapState', JSON.stringify(mapObj)); } catch(_){} requestDraw(); });
  if (markerOpen) markerOpen.addEventListener('click', ()=>{ const mid = container._selectedMarkerId; if (!mid) return; const m = (mapObj.markers||[]).find(z=>z.id===mid); if (!m || !m.linkedPage) return; try { const slug = encodeURIComponent(m.linkedPage.toString().trim().toLowerCase().replace(/\s+/g,'_')); location.hash = `#/page/${slug}`; } catch(_){ } });
  if (markerLabelInput) markerLabelInput.addEventListener('input', ()=>{ const mid = container._selectedMarkerId; if (!mid) return; const m = (mapObj.markers||[]).find(z=>z.id===mid); if (!m) return; m.label = markerLabelInput.value || ''; try { localStorage.setItem('lastMapState', JSON.stringify(mapObj)); } catch(_){} requestDraw(); });
  if (markerPageInput) markerPageInput.addEventListener('input', ()=>{ const mid = container._selectedMarkerId; if (!mid) return; const m = (mapObj.markers||[]).find(z=>z.id===mid); if (!m) return; m.linkedPage = markerPageInput.value ? markerPageInput.value.trim() : null; try { localStorage.setItem('lastMapState', JSON.stringify(mapObj)); } catch(_){} });

  // Categories panel toggle & checkboxes
  const catsToggle = container.parentElement && container.parentElement.querySelector && container.parentElement.querySelector('#map-cats-toggle');
  const catsPanel = document.getElementById('map-categories-panel');
  if (catsToggle) catsToggle.addEventListener('click', ()=>{ if (catsPanel) catsPanel.style.display = (catsPanel.style.display === 'none' ? 'block' : 'none'); });
  function renderCategoryList(){
    if (!catsPanel) return;
    const list = document.getElementById('map-categories-list'); if (!list) return; list.innerHTML = '';
    const meta = container._categoryMeta || {};
    Object.keys(meta).forEach(k => {
      const it = meta[k];
      const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.justifyContent='space-between';
      const left = document.createElement('div'); left.innerHTML = `<label style="display:flex; gap:8px; align-items:center;"><input type=checkbox data-cat="${k}" ${container._visibleCategories[k] ? 'checked' : ''}/> <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;background:${it.color};color:#071224">${it.icon||''}</span> <strong style="font-size:13px;color:#e2e8f0;margin-left:6px">${k}</strong></span></label>`;
      const right = document.createElement('div'); right.innerHTML = `<button data-edit-cat="${k}" style="background:#0f172a;border:1px solid #334155;color:#93c5fd;padding:4px 8px;border-radius:6px;font-size:12px">Edit</button>`;
      row.appendChild(left); row.appendChild(right); list.appendChild(row);
    });
    // attach listeners
    list.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.addEventListener('change', ()=>{ const cat = cb.getAttribute('data-cat'); container._visibleCategories[cat] = cb.checked; try { localStorage.setItem('map_visible_cats', JSON.stringify(container._visibleCategories)); } catch(_){} requestDraw(); }); });
    list.querySelectorAll('button[data-edit-cat]').forEach(btn=>{ btn.addEventListener('click', ()=>{ const k = btn.getAttribute('data-edit-cat'); openEditCategory(k); }); });
  }
  function openEditCategory(key){
    const modalName = document.getElementById('map-new-cat-name'); const modalColor = document.getElementById('map-new-cat-color'); const modalIcon = document.getElementById('map-new-cat-icon');
    if (!modalName || !modalColor || !modalIcon) return; modalName.value = key; modalName.disabled = true; const meta = container._categoryMeta && container._categoryMeta[key] || {}; modalColor.value = meta.color || '#3b82f6'; modalIcon.value = meta.icon || '';
    // reuse add area as edit; change button behavior
    const addBtn = document.getElementById('map-new-cat-add'); addBtn.textContent = 'Update';
    function doUpdate(){ const name = modalName.value.trim(); if (!name) return; container._categoryMeta[name] = { color: modalColor.value, icon: modalIcon.value }; saveCategoryMeta(); renderCategoryList(); addBtn.textContent = 'Add'; modalName.disabled = false; modalName.value=''; modalIcon.value=''; modalColor.value='#3b82f6'; }
    addBtn.onclick = ()=>{ doUpdate(); addBtn.onclick=null; };
  }
  if (catsPanel) {
    // init new-cat handlers
    const add = document.getElementById('map-new-cat-add'); const newName = document.getElementById('map-new-cat-name'); const newColor = document.getElementById('map-new-cat-color'); const newIcon = document.getElementById('map-new-cat-icon');
    if (add && newName && newColor && newIcon) {
      add.addEventListener('click', ()=>{
        const name = (newName.value||'').trim(); if (!name) { alert('Enter a category name'); return; }
        // normalize name (no spaces)
        const key = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_\-]/g,'');
        container._categoryMeta = container._categoryMeta || {};
        container._categoryMeta[key] = { color: newColor.value || '#3b82f6', icon: newIcon.value || '' };
        container._visibleCategories[key] = true;
        saveCategoryMeta(); renderCategoryList(); try { localStorage.setItem('map_visible_cats', JSON.stringify(container._visibleCategories)); } catch(_){}
        newName.value=''; newIcon.value=''; newColor.value='#3b82f6';
      });
    }
    renderCategoryList();
  }

  if (mapObj.imageUrl) {
    img.src = mapObj.imageUrl;
    // Add a lightweight loading hint
    const loader = document.createElement('div');
    loader.textContent = 'Loading map…';
    loader.style.position = 'absolute'; loader.style.left='50%'; loader.style.top='50%'; loader.style.transform='translate(-50%, -50%)'; loader.style.color='#94a3b8'; loader.style.fontSize='12px'; loader.style.pointerEvents='none';
    container.appendChild(loader);
    img.onload = () => {
      const iw = img.naturalWidth || (mapObj.imageSize && mapObj.imageSize.width) || canvas.width;
      const ih = img.naturalHeight || (mapObj.imageSize && mapObj.imageSize.height) || canvas.height;
      resizeCanvas();
      // Fit to screen and center
      const rect = container.getBoundingClientRect();
      const sx = rect.width / iw; const sy = rect.height / ih;
      scale = Math.min(sx, sy);
      offsetX = (rect.width - iw * scale) / 2;
      offsetY = (rect.height - ih * scale) / 2;
      try { const zl = container.parentElement && container.parentElement.querySelector && container.parentElement.querySelector('#map-zoom'); if (zl) zl.textContent = Math.round(scale*100) + '%'; } catch(_){ }
      requestDraw();
      try { loader.remove(); } catch(_){ }
    };
    img.onerror = () => {
      try { loader.textContent = 'Failed to load map image'; loader.style.color = '#fda4af'; } catch(_){ }
    };
  }
  container._mapState = mapObj;

  // Centre handler
  container.addEventListener('map-center', ()=>{
    if (!img || !img.src) return;
    const iw = img.naturalWidth || (mapObj.imageSize && mapObj.imageSize.width) || canvas.width;
    const ih = img.naturalHeight || (mapObj.imageSize && mapObj.imageSize.height) || canvas.height;
    const rect = container.getBoundingClientRect();
    const sx = rect.width / iw; const sy = rect.height / ih;
    scale = Math.min(sx, sy);
    offsetX = (rect.width - iw * scale) / 2;
    offsetY = (rect.height - ih * scale) / 2;
    try { const zl = container.parentElement && container.parentElement.querySelector && container.parentElement.querySelector('#map-zoom'); if (zl) zl.textContent = Math.round(scale*100) + '%'; } catch(_){ }
    requestDraw();
  });
}

// Self-initialization and teardown based on URL hash
window.addEventListener('hashchange', () => {
	if (location.hash === '#/maps') {
		init();
	} else {
		const overlay = document.getElementById('maps-canvas-overlay');
		if (overlay) {
			overlay.remove();
		}
	}
});

// Also check on initial load
if (location.hash === '#/maps') {
	init();
}

register({ id, label: 'Maps', schema: { name: 'Maps' }, renderExtras, applyExtrasToMeta, renderView, init });
