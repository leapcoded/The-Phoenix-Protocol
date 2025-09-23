// Main SPA bootstrapping for The Haven wiki hub (ported from inline script)
import { getModule } from './categories/index.js';
import { onAuthStateChanged, signInWithGoogle, signOut, savePage, deletePage, onPagesUpdate } from './firebase.js';

// Global-ish state in module scope
let wikiPages = {};
let wikiHistory = []; // This will be refactored to be stored in Firebase as well
let hiddenStatics = new Set(); // This will be refactored
let hiddenLocals = new Set(); // This will be refactored
const pageIndex = {}; // cache for fetched repo markdown for backlink scans
const REPO_FETCH_ENABLED = false; // disable fetching markdown files from repo

// Categories and static pages (as previously configured)
const NAV_CATEGORIES = [
	'Characters', 'Manuscript', 'Locations', 'Maps', 'Research', 'Timeline', 'Calendar', 'Arcs', 'Relationships', 'Encyclopedia', 'Magic', 'Species', 'Cultures', 'Items', 'Systems', 'Languages', 'Religions', 'Philosophies'
];

const staticPages = [];

// These functions will be refactored or removed. For now, they do nothing.
function loadHiddenStatics() { hiddenStatics = new Set(); }
function saveHiddenStatics() { /* no-op */ }
function loadHiddenLocals() { hiddenLocals = new Set(); }
function saveHiddenLocals() { /* no-op */ }

// Utilities
function normalizePageName(s) {
	return String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
}
function prettifyTitle(raw) {
	return String(raw || '').replace(/[_-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function escapeRegExp(s) {
	return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canDelete(slug) {
	return !staticPages.some(sp => normalizePageName(sp.name) === normalizePageName(slug));
}

function normalizeSavedContentLinks(html) {
	// Normalize [[Label]] and [Label](#/page/slug) that might remain in saved HTML fragments
	if (!html) return '';
	let out = String(html);
	try {
		out = out.replace(/\[\[([\s\S]*?)\]\]/g, (m, p1) => {
			const label = (p1 || '').trim();
			const slug = encodeURIComponent(normalizePageName(label));
			return `<a href="#/page/${slug}" class="internal-link">${label}</a>`;
		});
		out = out.replace(/\[([^\]]+)\]\s*\(\s*#\/page\/([^\)]+)\s*\)/g, (m, label, slug) => {
			const lab = (label || '').trim();
			const s = encodeURIComponent(normalizePageName(decodeURIComponent((slug || '').trim())));
			return `<a href="#/page/${s}" class="internal-link">${lab}</a>`;
		});
	} catch (_) {}
	return out;
}

function replaceMarkdownLinksInElement(root) {
	const container = root instanceof Element ? root : document.getElementById('wiki-editor-content');
	if (!container) return;
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
	const textNodes = [];
	while (walker.nextNode()) textNodes.push(walker.currentNode);
	textNodes.forEach(node => {
		const val = node.nodeValue || '';
		if (!val) return;
		// [[Label]]
		const wikiRe = /\[\[([\s\S]*?)\]\]/g;
		const mdInternalRe = /\[([^\]]+)\]\s*\(\s*#\/page\/([^\)]+)\s*\)/g;
		if (!wikiRe.test(val) && !mdInternalRe.test(val)) return;
		wikiRe.lastIndex = 0; mdInternalRe.lastIndex = 0;
		const frag = document.createDocumentFragment();
		let last = 0; let m;
		const pushText = (s, from, to) => { if (to > from) frag.appendChild(document.createTextNode(s.slice(from, to))); };
		while ((m = wikiRe.exec(val)) !== null) {
			pushText(val, last, m.index);
			const label = (m[1] || '').trim();
			const slug = encodeURIComponent(normalizePageName(label));
			const a = document.createElement('a'); a.href = `#/page/${slug}`; a.className = 'internal-link'; a.textContent = label; frag.appendChild(a);
			last = wikiRe.lastIndex;
		}
		let tmp = val.slice(last); last = 0; let frag2 = document.createDocumentFragment();
		const pushText2 = (s, from, to) => { if (to > from) frag2.appendChild(document.createTextNode(s.slice(from, to))); };
		let m2; while ((m2 = mdInternalRe.exec(tmp)) !== null) {
			pushText2(tmp, last, m2.index);
			const lab = (m2[1] || '').trim();
			const s = encodeURIComponent(normalizePageName(decodeURIComponent((m2[2] || '').trim())));
			const a = document.createElement('a'); a.href = `#/page/${s}`; a.className = 'internal-link'; a.textContent = lab; frag2.appendChild(a);
			last = mdInternalRe.lastIndex;
		}
		if (last < tmp.length) pushText2(tmp, last, tmp.length);
		frag.appendChild(frag2);
		node.parentNode.replaceChild(frag, node);
	});
}

function processInternalLinks(content) {
	if (/<[a-z][\s\S]*>/i.test(content)) return content;
	let processed = content.replace(/\[([^\]]+)\]\s*\(\s*#\/page\/([^\)]+)\s*\)/g, (m, label, slug) => {
		const lab = (label || '').trim();
		const s = encodeURIComponent(normalizePageName(decodeURIComponent((slug || '').trim())));
		return `<a href="#/page/${s}" class="internal-link">${lab}</a>`;
	});
	processed = processed.replace(/\[\[([\s\S]*?)\]\]/g, (m, p1) => {
		const target = normalizePageName(p1);
		const label = (p1 || '').trim();
		return `<a href="#/page/${encodeURIComponent(target)}" class="internal-link">${label}</a>`;
	});
	const known = new Set(Object.keys(wikiPages));
	staticPages.forEach(p => known.add(p.name));
	if (known.size === 0) return processed;
	const skipRegex = /(!?\[[^\]]*\]\([^)]*\)|`[^`]*`)/g;
	const parts = processed.split(skipRegex);
	for (let i = 0; i < parts.length; i++) {
		if (parts[i].match(skipRegex)) continue;
		let seg = parts[i];
		known.forEach(k => {
			const display = k.replace(/_/g, ' ');
			const regex = new RegExp('(^|\\W)(' + escapeRegExp(display) + ')(?=$|\\W)', 'gi');
			seg = seg.replace(regex, (all, prefix, match) => {
				const slug = encodeURIComponent(normalizePageName(match));
				return prefix + `<a href="#/page/${slug}" class="internal-link">${match}</a>`;
			});
		});
		parts[i] = seg;
	}
	return parts.join('');
}

function extractInternalLinks(htmlOrMd) {
	const s = String(htmlOrMd || '');
	const anchors = Array.from(s.matchAll(/href=["']#\/page\/([^"']+)["']/gi)).map(m => decodeURIComponent(m[1])).map(normalizePageName);
	const wiki = Array.from(s.matchAll(/\[\[([\s\S]*?)\]\]/g)).map(m => normalizePageName(m[1]));
	const md = Array.from(s.matchAll(/\[([^\]]+)\]\s*\(\s*#\/page\/([^\)]+)\s*\)/g)).map(m => normalizePageName(decodeURIComponent(m[2])));
	return Array.from(new Set([...anchors, ...wiki, ...md]));
}

function tagInternalAnchors(root) {
	const container = root || document.getElementById('wiki-editor-content');
	if (!container) return;
	container.querySelectorAll('a').forEach(a => {
		const href = a.getAttribute('href') || '';
		if (/^#\/page\//.test(href)) a.classList.add('internal-link');
	});
}

function autoLinkKnownPagesInElement(root) {
	const container = root || document.getElementById('wiki-editor-content');
	if (!container) return;
	const known = new Set(Object.keys(wikiPages));
	staticPages.forEach(p => known.add(p.name));
	if (known.size === 0) return;
	const displays = Array.from(known).map(n => n.replace(/_/g, ' ')).sort((a,b) => b.length - a.length);
	if (displays.length === 0) return;
	const alternation = displays.map(d => escapeRegExp(d)).join('|');
	const regex = new RegExp('(^|\\W)(' + alternation + ')(?=$|\\W)', 'gi');
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
	const textNodes = [];
	while (walker.nextNode()) textNodes.push(walker.currentNode);
	textNodes.forEach(node => {
		if (!node.nodeValue) return;
		if (node.parentElement && (node.parentElement.closest('a, code, pre'))) return;
		const val = node.nodeValue;
		if (!regex.test(val)) return;
		regex.lastIndex = 0;
		const frag = document.createDocumentFragment();
		let lastIndex = 0; let m;
		while ((m = regex.exec(val)) !== null) {
			const start = m.index;
			if (start > lastIndex) frag.appendChild(document.createTextNode(val.slice(lastIndex, start)));
			const prefix = m[1] || ''; const label = m[2];
			if (prefix) frag.appendChild(document.createTextNode(prefix));
			const slug = encodeURIComponent(normalizePageName(label));
			const a = document.createElement('a'); a.href = `#/page/${slug}`; a.className = 'internal-link'; a.textContent = label; frag.appendChild(a);
			lastIndex = regex.lastIndex;
		}
		if (lastIndex < val.length) frag.appendChild(document.createTextNode(val.slice(lastIndex)));
		node.parentNode.replaceChild(frag, node);
	});
}

function showToast(msg, type = 'info') {
	console[type === 'error' ? 'error' : 'log']('[toast]', msg);
}

function addHistorySnapshot(page, snapshot) {
	// This needs to be refactored to work with Firebase, e.g., a subcollection on the page document.
	// For now, this is a no-op.
}

function saveWikiPage(pageName, data) {
	const normPageName = normalizePageName(pageName);
	wikiPages[normPageName] = data;
	savePage(pageName, data); // Firebase save
	// Debug: log wikiPages keys after save
	if (data.meta && data.meta.category === 'Characters') {
		console.log('[DEBUG] wikiPages keys after save:', Object.keys(wikiPages));
		console.log('[DEBUG] Saved Character:', pageName, data);
	}
	try { window.wikiPages = wikiPages; } catch(_) {}
	try { window.dispatchEvent(new CustomEvent('wikiPagesUpdated')); } catch(_) {}
	buildSidebar();
}

// Create a minimal stub page in Firebase/local cache if target doesn't exist
async function createStubIfMissing(targetName, categoryHint = 'Encyclopedia') {
	if (!targetName) return;
	const key = normalizePageName(targetName);
	if (wikiPages[key]) return; // already exists
	const stub = { meta: { summary: '', thumb: '', category: categoryHint }, content: `<p><em>Stub page for ${prettifyTitle(key)}</em></p>` };
	wikiPages[key] = stub;
	try { await savePage(key, stub); buildSidebar(); showToast(`Created stub page: ${prettifyTitle(key)}`); } catch (e) { console.error('Failed to create stub', e); }
}

// Backlink helpers: add/remove backlinks in target page meta.backlinks
async function addBacklink(targetNameOrSlug, sourceNameOrSlug) {
	if (!targetNameOrSlug || !sourceNameOrSlug) return;
	const target = normalizePageName(targetNameOrSlug);
	const source = normalizePageName(sourceNameOrSlug);
	if (target === source) return;
	// Ensure target exists
	if (!wikiPages[target]) await createStubIfMissing(target, 'Encyclopedia');
	const pageObj = wikiPages[target] || { meta: {}, content: '' };
	pageObj.meta = pageObj.meta || {};
	const current = Array.isArray(pageObj.meta.backlinks) ? pageObj.meta.backlinks.map(normalizePageName) : [];
	if (current.includes(source)) return;
	current.push(source);
	pageObj.meta.backlinks = Array.from(new Set(current));
	wikiPages[target] = pageObj;
	try { await savePage(target, pageObj); } catch (e) { console.error('Failed to save backlink for', target, e); }
}

async function removeBacklink(targetNameOrSlug, sourceNameOrSlug) {
	if (!targetNameOrSlug || !sourceNameOrSlug) return;
	const target = normalizePageName(targetNameOrSlug);
	const source = normalizePageName(sourceNameOrSlug);
	if (!wikiPages[target]) return;
	const pageObj = wikiPages[target]; if (!pageObj.meta) pageObj.meta = {};
	const current = Array.isArray(pageObj.meta.backlinks) ? pageObj.meta.backlinks.map(normalizePageName) : [];
	const filtered = current.filter(s => s !== source);
	if (filtered.length === current.length) return;
	pageObj.meta.backlinks = filtered;
	wikiPages[target] = pageObj;
	try { await savePage(target, pageObj); } catch (e) { console.error('Failed to remove backlink for', target, e); }
}

function renderPageHub(pageName, fullContent, sections) {
	const cards = [];
	for (let i = 1; i < sections.length; i++) {
		const sec = sections[i];
		const lines = sec.split('\n');
		const title = lines[0].trim();
		const body = lines.slice(1).join('\n').trim();
		const excerpt = body.split('\n\n')[0].substring(0, 200);
		cards.push({ title, excerpt, index: i });
	}
	return '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + cards.map(c => `
		<a href="#/page/${encodeURIComponent(normalizePageName(pageName))}/${encodeURIComponent(c.title.replace(/\s+/g,'_'))}" class="card p-3 block rounded-lg flex items-start space-x-3">
			<div class="w-16 h-16 flex-shrink-0 bg-gray-800 rounded overflow-hidden"></div>
			<div class="flex-1">
				<h3 class="text-lg text-sky-400 font-semibold truncate">${c.title}</h3>
				<p class="text-gray-300 mt-1 line-clamp-3">${c.excerpt}...</p>
			</div>
		</a>
	`).join('') + '</div>';
}

async function openWikiPage(pageName) {
	const viewer = document.getElementById('wiki-viewer');
	// debug log removed for cleaner console output
	const editorBtn = document.getElementById('open-wiki-editor');
	viewer.innerHTML = '<p class="text-gray-400">Loading...</p>';
	let normPageName = normalizePageName(pageName);
	let localVal = wikiPages[normPageName];
	// tolerant fallback: try to find a key whose normalized name matches the requested page
	if (!localVal) {
		try {
			const normReq = normalizePageName(pageName);
			const foundKey = Object.keys(wikiPages).find(k => normalizePageName(k) === normReq);
			if (foundKey) {
				pageName = foundKey;
				normPageName = normalizePageName(foundKey);
				localVal = wikiPages[foundKey];
			}
		} catch (_) {}
	}
	let localObj = null;
	let content = '';
	if (typeof localVal === 'string') content = localVal;
	else if (localVal && typeof localVal === 'object') { localObj = localVal; content = localVal.content || ''; }
	if (!content && REPO_FETCH_ENABLED) {
		try {
			const res = await fetch(`./${normPageName}.md`);
			if (res.ok) content = await res.text();
		} catch (_) {}
	}
	const hasPage = !!localObj || !!content;
	if (hasPage) {
		if (!wikiPages[normPageName] && content) pageIndex[normPageName] = content;
		const catGrid = document.getElementById('category-grid'); if (catGrid) catGrid.classList.add('hidden');
		const sections = String(content || '').split(/\n##\s+/).filter(Boolean);
		let summary = ''; let thumb = '';
		if (localObj) {
			// summary removed; derive nothing here (aside rendering uses content excerpts)
			thumb = (localObj.meta && localObj.meta.thumb) || '';
		} else {
			const sp = staticPages.find(p => normalizePageName(p.name) === normalizePageName(normPageName));
			if (sp) thumb = sp.thumb || '';
		}
	const navExcludes = new Set([]);
		const isNav = navExcludes.has(normalizePageName(pageName));
		if (isNav) {
			if (sections.length > 1) {
				viewer.innerHTML = renderPageHub(pageName, content, sections);
			} else {
				if (/<[a-z][\s\S]*>/i.test(content)) {
					viewer.innerHTML = normalizeSavedContentLinks(content);
					replaceMarkdownLinksInElement(viewer);
				} else {
					// marked loaded from CDN; use global
					// eslint-disable-next-line no-undef
					viewer.innerHTML = marked.parse(processInternalLinks(content));
					replaceMarkdownLinksInElement(viewer);
				}
			}
			const aside = document.getElementById('page-aside'); if (aside) aside.classList.add('hidden');
		} else {
			let processedText = String(content || '');
			processedText = processedText.replace(/^\s*---[\s\S]*?---\s*/, '');
			processedText = processedText.replace(new RegExp('^\\s*<!--[\\s\\S]*?-->\\s*'), '');
			processedText = processedText.replace(new RegExp('^\\s*(?:<h[1-6][^>]*>[\\s\\S]*?<\\/h[1-6]>\\s*)+','i'), '');
			processedText = processedText.replace(/^\s*(?:#{1,6}\s.*\n)+/, '');
			processedText = processedText.replace(/^\s*[^\n]+\n[=-]{2,}\s*\n+/, '');
			processedText = processedText.replace(/^\s+/, '');
			processedText = processInternalLinks(processedText);
			let html = '';
			if (/<[a-z][\s\S]*>/i.test(processedText)) html = normalizeSavedContentLinks(processedText);
			else {
				// eslint-disable-next-line no-undef
				html = marked.parse(processedText);
			}
			html = html.replace(new RegExp('^\\s*<(?:h1|h2)[^>]*>[\\s\\S]*?<\\/(?:h1|h2)>\\s*','i'), '');
			if (!thumb) {
				const m = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i); if (m) thumb = m[1];
			}
			const aside = document.getElementById('page-aside');
			if (aside) {
				if (thumb || summary) {
					const isCharacter = !!(localObj && localObj.meta && localObj.meta.category === 'Characters');
					const asideSummaryRaw = isCharacter ? '' : (summary || '');
					aside.innerHTML = `
						<div class="bg-gray-800 rounded-xl p-4 border border-gray-700 sticky top-4">
							${thumb ? `<div class="mx-auto" style="width:250px;height:250px"><div class="w-[250px] h-[250px] overflow-hidden rounded-lg"><img src="${thumb}" alt="${prettifyTitle(pageName)}" class="block w-full h-full object-cover"/></div></div>` : ''}
							${asideSummaryRaw ? `<div class="text-sm text-gray-300 mt-3" id="page-aside-summary">${asideSummaryRaw}</div>` : ''}
						</div>`;
					aside.classList.remove('hidden');
					const asideSummaryEl = document.getElementById('page-aside-summary');
					if (asideSummaryEl) {
						asideSummaryEl.innerHTML = normalizeSavedContentLinks(asideSummaryEl.innerHTML);
						replaceMarkdownLinksInElement(asideSummaryEl);
						autoLinkKnownPagesInElement(asideSummaryEl);
						tagInternalAnchors(asideSummaryEl);
					}
				} else {
					aside.classList.add('hidden'); aside.innerHTML = '';
				}
			}
			// Inject category-specific view block above content if available
			let catView = '';
			if (localObj && typeof localObj === 'object') {
				const cat = (localObj.meta && localObj.meta.category) || 'Encyclopedia';
				const mod = getModule && getModule(cat);
				if (mod && mod.renderView) {
					try { catView = mod.renderView({ name: pageName, meta: localObj.meta || {}, content: html }); } catch(_) { catView = ''; }
				}
			}
			viewer.innerHTML = (catView || '') + html; replaceMarkdownLinksInElement(viewer);
		}
		editorBtn.dataset.page = normPageName; editorBtn.classList.remove('hidden');
		const viewerDeleteBtn = document.getElementById('delete-page');
		if (viewerDeleteBtn) {
			// Always show delete for Characters and local pages
			const obj = localObj;
				if (obj && typeof obj === 'object' && (obj.meta?.category === 'Characters' || canDelete(pageName))) {
					viewerDeleteBtn.classList.remove('hidden');
				} else {
					viewerDeleteBtn.classList.add('hidden');
				}
			}
	const pageTitleEl = document.getElementById('page-title');
	if (pageTitleEl) {
		let displayTitle = prettifyTitle(pageName);
		try {
			const obj = localObj;
			if (obj && typeof obj === 'object') {
				const m = obj.meta || {};
				if ((m.category||'') === 'Characters') {
					displayTitle = m.fullName || m.title || displayTitle;
				} else {
					displayTitle = m.title || displayTitle;
				}
			}
		} catch(_) {}
		pageTitleEl.textContent = displayTitle;
	}
	updateToggleStaticButton(pageName);
	updateStaticDeleteButton(pageName);
	} else {
		try { console.warn('[DEBUG] openWikiPage not found', { requested: pageName, normPageName, keys: Object.keys(wikiPages), typestr: typeof wikiPages[normPageName] }); } catch(_) {}
	viewer.innerHTML = `<h2 class=\"text-xl text-red-400\">Page not found</h2><p class=\"text-gray-400\">No page named <strong>${normPageName}</strong> was found in local edits or repository.</p>`;
			editorBtn.dataset.page = normPageName; editorBtn.classList.remove('hidden');
			const viewerDeleteBtn = document.getElementById('delete-page'); if (viewerDeleteBtn) viewerDeleteBtn.classList.add('hidden');
			updateToggleStaticButton(pageName);
			updateStaticDeleteButton(pageName);
	}
	renderBacklinks(pageName);
	renderRelatedCards(pageName);
	document.getElementById('page-area').classList.remove('hidden');
	const bar = document.getElementById('top-welcome-bar');
	const offset = (bar && !bar.classList.contains('hidden')) ? bar.getBoundingClientRect().height + 12 : 0;
	window.scrollTo({ top: offset, behavior: 'smooth' });
}

function renderRelatedCards(pageName) {
	const relatedContainer = document.getElementById('page-related'); if (!relatedContainer) return;
	const key = normalizePageName(pageName);
	const localMeta = (wikiPages[pageName] && typeof wikiPages[pageName] === 'object' && wikiPages[pageName].meta) ? wikiPages[pageName].meta : null;
	const pageStatic = staticPages.find(p => normalizePageName(p.name) === key);
	const page = pageStatic || (localMeta ? { name: pageName, category: localMeta.category || 'Encyclopedia', thumb: localMeta.thumb || '', title: prettifyTitle(pageName) } : null);
	let related = [];
	if (page) {
	const locals = Object.keys(wikiPages).filter(n => !hiddenLocals.has(normalizePageName(n))).map(n => {
			const v = wikiPages[n]; const meta = (v && typeof v === 'object' && v.meta) ? v.meta : {};
			return { name: n, title: prettifyTitle(n), category: meta.category || 'Encyclopedia', thumb: meta.thumb || '' };
		});
		const pool = [...staticPages.filter(p => !hiddenStatics.has(normalizePageName(p.name))), ...locals];
		related = pool.filter(p => p.category === page.category && normalizePageName(p.name) !== key).slice(0, 8);
	} else {
		related = staticPages.filter(p => p.category === 'Content').slice(0,4);
	}
	if (related.length === 0) { relatedContainer.innerHTML = ''; return; }
	relatedContainer.innerHTML = '<h4 class="text-sm text-gray-300 mb-2">Related</h4>' +
		'<div class="grid grid-cols-2 md:grid-cols-4 gap-3">' + related.map(r => `
			<a href="#/page/${encodeURIComponent(r.name)}" class="card p-3 rounded-lg block" title="Open ${r.title}">
				<div class="flex items-start space-x-3">
					<div class="w-12 h-12 flex-shrink-0 bg-gray-800 rounded overflow-hidden">${(r.thumb || (staticPages.find(sp=>normalizePageName(sp.name)===normalizePageName(r.name)) || {}).thumb) ? `<img src="${r.thumb || (staticPages.find(sp=>normalizePageName(sp.name)===normalizePageName(r.name)) || {}).thumb}" alt="${r.title}" class="w-full h-full object-cover"/>` : ''}</div>
					<div class="flex-1 text-left">
						<div class="text-sm text-sky-400 font-semibold truncate">${r.title}</div>
						<div class="text-xs text-gray-400 line-clamp-2">${processInternalLinks(r.summary || '')}</div>
					</div>
				</div>
			</a>
		`).join('') + '</div>';
}

// Render the Relationships interactive canvas (module-driven)
function openRelationshipsCanvas() {
	const viewer = document.getElementById('wiki-viewer'); if (!viewer) return;
	const mod = getModule && getModule('Relationships');
	let html = '';
	try { if (mod && mod.renderView) html = mod.renderView({ meta: {} }); } catch (e) { console.error('Failed to render relationships canvas', e); html = '<p class="text-red-400">Failed to render relationships canvas.</p>'; }
	// adjust layout for immersive canvas: hide category grid and aside, show page-area and expand viewer
	viewer.innerHTML = html;
	const catGrid = document.getElementById('category-grid'); if (catGrid) catGrid.classList.add('hidden');
	const aside = document.getElementById('page-aside'); if (aside) { aside.classList.add('hidden'); aside.innerHTML = ''; }
	// hide the left sidebar and expand the main column to full width
	const leftSidebar = document.getElementById('left-sidebar'); if (leftSidebar) leftSidebar.classList.add('hidden');
	const mainCol = document.querySelector('main'); if (mainCol) { mainCol.classList.remove('lg:col-span-3'); mainCol.classList.add('lg:col-span-4'); }
	const editorBtn = document.getElementById('open-wiki-editor'); if (editorBtn) editorBtn.classList.add('hidden');
	const pageArea = document.getElementById('page-area'); if (pageArea) pageArea.classList.remove('hidden');
	// hide the page header/title area inside page-card for an immersive canvas
	const pageCard = document.getElementById('page-card'); if (pageCard) {
		const titleEl = document.getElementById('page-title'); if (titleEl && titleEl.parentNode) titleEl.parentNode.style.display = 'none';
		pageCard.style.minHeight = '75vh'; pageCard.style.padding = '0'; pageCard.style.overflow = 'hidden';
		const viewerEl = document.getElementById('wiki-viewer'); if (viewerEl) { viewerEl.style.height = '100%'; viewerEl.style.overflow = 'auto'; viewerEl.style.padding = '12px'; }
	}

	// initialize interactive behaviors (drag/zoom/draw/save) after HTML injection
	try { if (mod && typeof mod.init === 'function') mod.init(viewer); } catch (e) { console.error('Failed to initialize relationships module', e); }
}

// Render the Maps interactive canvas (module-driven)
function openMapsCanvas() {
	const mod = getModule && getModule('Maps');
	// The maps module now handles its own layout. We just need to ensure the page area is visible.
	const pageArea = document.getElementById('page-area');
	if (pageArea) pageArea.classList.remove('hidden');

	try {
		if (mod && typeof mod.init === 'function') {
			mod.init();
		}
	} catch (e) {
		console.error('Failed to initialize maps module', e);
	}
}

// Render the Systems interactive flowchart (module-driven)
function openSystemsCanvas() {
	const mod = getModule && getModule('Systems');
	const pageArea = document.getElementById('page-area');
	if (pageArea) pageArea.classList.remove('hidden');
	try { if (mod && typeof mod.init === 'function') { mod.init(); } } catch(e) { console.error('Failed to initialize systems module', e); }
}

function renderBacklinks(pageName) {
	const target = normalizePageName(pageName);
	const backlinks = new Set();
	Object.keys(wikiPages).forEach((k) => {
		const v = wikiPages[k];
		const text = (typeof v === 'string') ? v : (v.content || '');
		const links = extractInternalLinks(text);
		if (links.includes(target) && normalizePageName(k) !== target) backlinks.add(k);
	});
	Object.keys(pageIndex).forEach((k) => {
		const links = extractInternalLinks(pageIndex[k]);
		if (links.includes(target) && normalizePageName(k) !== target) backlinks.add(k);
	});
	const container = document.getElementById('wiki-backlinks'); if (!container) return;
	if (backlinks.size === 0) { container.innerHTML = '<p class="text-sm text-gray-500">No backlinks.</p>'; return; }
	const items = Array.from(backlinks).map((p) => `<a href="#/page/${encodeURIComponent(normalizePageName(p))}" class="text-sky-400 hover:underline">${p}</a>`);
	container.innerHTML = '<strong class="text-gray-300">Backlinks:</strong><div class="mt-2 space-y-1">' + items.map(i => `<div>${i}</div>`).join('') + '</div>';
}

function buildSidebar() {
	const staticContainer = document.getElementById('sidebar-static');
	const groups = [];
	groups.push({ name: 'Navigation', items: [ { name: 'Main Page', href: '#/' }, { name: 'Relationships', href: '#/relationships' }, { name: 'Maps', href: '#/maps' }, { name: 'Systems', href: '#/systems' } ] });
	const locals = Object.keys(wikiPages).filter(name => !hiddenLocals.has(normalizePageName(name))).map(name => {
		const v = wikiPages[name];
		const meta = (v && typeof v === 'object' && v.meta) ? v.meta : {};
		return { name, title: prettifyTitle(name), category: meta.category || 'Encyclopedia' };
	});
	const cats = NAV_CATEGORIES.slice().sort((a,b) => a.localeCompare(b));
	const navItemsHtml = groups[0].items.map(i => `<a href="${i.href}" class="text-sky-400 hover:underline block" title="${i.name}">${i.name}</a>`).join('');
	staticContainer.innerHTML = [
		`<div class="mb-3"><strong class="text-sm text-gray-400">Navigation</strong><div class="mt-2 space-y-1">${navItemsHtml}</div></div>`,
		...cats.map(cat => {
			const items = locals.filter(p => p.category === cat);
			const links = items.map(item => `<a href="#/page/${encodeURIComponent(normalizePageName(item.name))}" class="text-sky-400 hover:underline block" title="Open ${item.title}">${item.title}</a>`).join('');
			const isRel = cat === 'Relationships';
			const isMap = cat === 'Maps';
			const add = (isRel || isMap) ? '' : `<button class="text-xs text-emerald-400 hover:underline" data-add-cat="${cat}">+ Add page</button>`;
			const view = (isRel || isMap) ? '' : `<a href="#/category/${encodeURIComponent(cat)}" class="text-xs text-sky-400 hover:underline ml-2" title="View all in ${cat}">View all</a>`;
			return `<div class="mb-3"><div class="flex items-center justify-between"><strong class="text-sm text-gray-400">${cat}</strong><div>${add}${view}</div></div><div class="mt-2 space-y-1">${links || '<div class="text-xs text-gray-500">(empty)</div>'}</div></div>`;
		})
	].join('');

	const catGrid = document.getElementById('category-grid');
	if (catGrid) {
		const cats2 = NAV_CATEGORIES.slice().sort((a,b)=>a.localeCompare(b));
		catGrid.innerHTML = cats2.map(cat => {
			const noControls = (cat === 'Maps' || cat === 'Relationships' || cat === 'Systems');
			if (noControls) {
				const href = cat === 'Maps' ? '#/maps' : (cat === 'Relationships' ? '#/relationships' : '#/systems');
				return `
				<a href="${href}" class="card rounded-xl p-4 shadow-xl flex items-start space-x-4" title="${cat}">
					<div class="w-20 h-20 flex-shrink-0 bg-gray-800 rounded overflow-hidden"></div>
					<div class="flex-1">
						<h3 class="text-lg font-semibold text-sky-400 truncate">${cat}</h3>
					</div>
				</a>
			`;
			}
			return `
			<div class="card rounded-xl p-4 shadow-xl flex items-start space-x-4" title="${cat}">
				<div class="w-20 h-20 flex-shrink-0 bg-gray-800 rounded overflow-hidden"></div>
				<div class="flex-1">
					<h3 class="text-lg font-semibold text-sky-400 truncate">${cat}</h3>
					<div class="mt-2 flex items-center space-x-3">
						<button class="px-3 py-1 bg-emerald-600 text-white rounded text-sm" data-add-cat="${cat}">Add page</button>
						<a href="#/category/${encodeURIComponent(cat)}" class="text-sm text-sky-300 hover:underline">View all</a>
					</div>
				</div>
			</div>
		`;
		}).join('');
	}
}

function openCategory(categoryName) {
	const catGrid = document.getElementById('category-grid');
	const contentContainer = document.getElementById('content-container');
	if (catGrid) catGrid.classList.add('hidden');
	if (!contentContainer) return;

	const cat = String(categoryName || '').trim();
	let pages = [];

	if (cat === 'Encyclopedia') {
		const includedCategories = new Set(['Characters', 'Cultures', 'Items', 'Languages', 'Locations', 'Magic', 'Philosophies', 'Religions', 'Species']);
		pages = Object.keys(wikiPages).filter(n => !hiddenLocals.has(normalizePageName(n))).map(n => {
			const v = wikiPages[n];
			const meta = (v && typeof v === 'object' && v.meta) ? v.meta : {};
			return { name: n, title: prettifyTitle(n), meta };
		}).filter(p => includedCategories.has(p.meta.category || ''));
	} else {
		pages = Object.keys(wikiPages).filter(n => !hiddenLocals.has(normalizePageName(n))).map(n => {
			const v = wikiPages[n];
			const meta = (v && typeof v === 'object' && v.meta) ? v.meta : {};
			return { name: n, title: prettifyTitle(n), meta };
		}).filter(p => (p.meta.category || 'Encyclopedia') === cat);
	}

	if (cat === 'Timeline') {
		pages.sort((a,b) => String(a.meta.date||'').localeCompare(String(b.meta.date||'')));
	} else if (cat === 'Manuscript') {
		const actOrder = { 'Act I': 1, 'Act II': 2, 'Act III': 3 };
		const parseCh = s => { const m = String(s||'').match(/\d+/); return m ? parseInt(m[0],10) : 9999; };
		pages.sort((a,b) => (actOrder[a.meta.act]||9)-(actOrder[b.meta.act]||9) || parseCh(a.meta.chapter)-parseCh(b.meta.chapter) || a.title.localeCompare(b.title));
	} else {
		pages.sort((a,b) => a.title.localeCompare(b.title));
	}

	contentContainer.innerHTML = '';
	const header = document.createElement('div');
	header.className = 'flex items-center justify-between mb-3';
	header.innerHTML = `<h2 class="text-xl font-bold text-gray-100">${cat}</h2><a href="#/" class="text-sky-400 hover:underline text-sm">Back to Home</a>`;
	contentContainer.appendChild(header);
	if (pages.length === 0) {
		const empty = document.createElement('div'); empty.className='text-gray-400'; empty.textContent = 'No pages in this category yet.'; contentContainer.appendChild(empty); return;
	}
	pages.forEach(p => {
		const a = document.createElement('a');
		a.href = `#/page/${encodeURIComponent(p.name)}`;
		a.className = 'card rounded-xl p-4 shadow-xl flex items-start space-x-4';
	const thumb = (p.meta && p.meta.thumb) || '';
	const sum = p.summary || '';
		a.innerHTML = `
			<div class="w-14 h-14 flex-shrink-0 bg-gray-800 rounded overflow-hidden">${thumb ? `<img src="${thumb}" alt="${p.title}" class="w-full h-full object-cover"/>` : ''}</div>
			<div class="flex-1">
				<div class="text-sky-400 font-semibold">${p.title}</div>
				${cat==='Timeline' && p.meta.date ? `<div class="text-xs text-amber-300">${p.meta.date} ${p.meta.era? '('+p.meta.era+')':''}</div>` : ''}
				${cat==='Manuscript' && (p.meta.act || p.meta.chapter) ? `<div class="text-xs text-gray-300">${p.meta.act || ''} ${p.meta.chapter ? '• Chapter '+p.meta.chapter : ''}</div>` : ''}
				${sum ? `<div class="text-xs text-gray-400 truncate">${sum}</div>` : ''}
			</div>
		`;
		contentContainer.appendChild(a);
	});
}

function router() {
	const hash = location.hash || '';

	function restoreRelationshipsLayoutIfNeeded(){
		const leftSidebar = document.getElementById('left-sidebar'); if (leftSidebar) leftSidebar.classList.remove('hidden');
		const mainCol = document.querySelector('main'); if (mainCol) { mainCol.classList.remove('lg:col-span-4'); mainCol.classList.add('lg:col-span-3'); }
		const catGrid = document.getElementById('category-grid'); if (catGrid && ((location.hash || '') !== '#/relationships' && (location.hash || '') !== '#/maps')) catGrid.classList.remove('hidden');
		const pageCard = document.getElementById('page-card'); if (pageCard) { pageCard.style.minHeight = ''; pageCard.style.padding = ''; const titleEl = document.getElementById('page-title'); if (titleEl && titleEl.parentNode) titleEl.parentNode.style.display = ''; }
	}
	const matchCategory = hash.match(/^#\/category\/(.+)$/);
		if (hash === '#/relationships') { showTopBar(); openRelationshipsCanvas(); return; }
	if (hash === '#/maps') { showTopBar(); openMapsCanvas(); return; }
	if (hash === '#/systems') { showTopBar(); openSystemsCanvas(); return; }
		// whenever we're not on relationships, ensure layout is restored
	if (((hash || '') !== '#/relationships') && ((hash || '') !== '#/maps') && ((hash || '') !== '#/systems')) restoreRelationshipsLayoutIfNeeded();
	if (matchCategory) {
		const cat = decodeURIComponent(matchCategory[1]);
		showTopBar();
		openCategory(cat);
		return;
	}
	const matchSection = hash.match(/^#\/page\/([^\/]+)\/(.+)$/);
	if (matchSection) {
		const page = matchSection[1];
		const section = decodeURIComponent(matchSection[2]);
		showTopBar();
		openWikiPage(page).then(() => {
			const target = section.replace(/_/g, ' ');
			const el = Array.from(document.querySelectorAll('#wiki-viewer h2, #wiki-viewer h3')).find(h => h.textContent.trim() === target);
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}).catch(() => {});
		return;
	}
		const match = hash.match(/^#\/page\/(.+)$/);
		if (match) {
			showTopBar();
			try { const raw = decodeURIComponent(match[1]); const norm = normalizePageName(raw); openWikiPage(norm); } catch(_) { openWikiPage(match[1]); }
			return;
		}
	if (!hash || hash === '#/' || hash === '#') {
		document.getElementById('page-area').classList.add('hidden');
		document.getElementById('wiki-editor-inline').classList.add('hidden');
		hideTopBar();
		const catGrid = document.getElementById('category-grid'); if (catGrid) catGrid.classList.remove('hidden');
		window.scrollTo({ top: 0, behavior: 'smooth' });
		return;
	}
	showTopBar();
}

function showTopBar() {
	const topBar = document.getElementById('top-welcome-bar'); if (topBar) topBar.classList.remove('hidden');
	document.body.classList.add('has-top-bar');
	const hero = document.getElementById('hero'); if (hero) hero.classList.add('hidden');
}
function hideTopBar() {
	const topBar = document.getElementById('top-welcome-bar'); if (topBar) topBar.classList.add('hidden');
	document.body.classList.remove('has-top-bar');
	const hero = document.getElementById('hero'); if (hero) hero.classList.remove('hidden');
}

function getAllPages() {
	const locals = Object.keys(wikiPages).filter(n => !hiddenLocals.has(normalizePageName(n))).map(n => {
		const v = wikiPages[n];
		const meta = (v && typeof v === 'object' && v.meta) ? v.meta : {};
		const content = (v && typeof v === 'object') ? (v.content || '') : (v || '');
		const text = String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim();
		const excerpt = text.split('\n\n')[0].substring(0, 200);
		return { name: n, title: prettifyTitle(n), category: meta.category || 'Encyclopedia', thumb: meta.thumb || '', summary: excerpt, contentText: text };
	});
	return locals;
}

function renderSearchResults(term, contentContainer) {
	const catGrid = document.getElementById('category-grid');
	contentContainer.innerHTML = '';
	if (!term) { if (catGrid) catGrid.classList.remove('hidden'); return; }
	if (catGrid) catGrid.classList.add('hidden');
	const t = term.toLowerCase();
	const pages = getAllPages();
	const filtered = pages.filter(p => (
		(p.title && p.title.toLowerCase().includes(t)) ||
		(p.name && p.name.toLowerCase().includes(t)) ||
		(p.summary && p.summary.toLowerCase().includes(t)) ||
		(p.contentText && p.contentText.toLowerCase().includes(t))
	)).slice(0, 50);
	if (filtered.length === 0) {
		const empty = document.createElement('div'); empty.className = 'text-gray-400'; empty.textContent = 'No matching pages.'; contentContainer.appendChild(empty); return;
	}
	filtered.forEach(p => {
		const a = document.createElement('a');
		a.href = `#/page/${encodeURIComponent(p.name)}`;
		a.className = 'card rounded-xl p-4 shadow-xl flex items-start space-x-4';
		a.innerHTML = `
			<div class="w-14 h-14 flex-shrink-0 bg-gray-800 rounded overflow-hidden">${p.thumb ? `<img src="${p.thumb}" alt="${p.title}" class="w-full h-full object-cover"/>` : ''}</div>
			<div class="flex-1">
				<div class="text-sky-400 font-semibold">${p.title}</div>
				<div class="text-xs text-gray-400 truncate">${p.category || ''}</div>
			</div>
		`;
		contentContainer.appendChild(a);
	});
}

function bootstrap() {
	// Set up Firebase authentication listeners
	const loginBtn = document.getElementById('login-btn');
	const logoutBtn = document.getElementById('logout-btn');
	const loginModal = document.getElementById('login-modal');
	const userDisplay = document.getElementById('user-display');

	if (loginBtn && loginModal) loginBtn.addEventListener('click', () => loginModal.classList.remove('hidden'));
	const loginCancelBtn = document.getElementById('login-cancel-btn'); if (loginCancelBtn && loginModal) loginCancelBtn.addEventListener('click', () => loginModal.classList.add('hidden'));
	const loginGoogleBtn = document.getElementById('login-google-btn'); if (loginGoogleBtn && loginModal) loginGoogleBtn.addEventListener('click', () => { signInWithGoogle(); loginModal.classList.add('hidden'); });
	if (logoutBtn) logoutBtn.addEventListener('click', () => signOut());

	onAuthStateChanged(async (user) => {
		if (user) {
			// User is signed in
			userDisplay.textContent = `Logged in as ${user.displayName || user.email}`;
			userDisplay.classList.remove('hidden');
			loginBtn.classList.add('hidden');
			logoutBtn.classList.remove('hidden');
			
			// Set up a real-time listener for page data
			onPagesUpdate((pages) => {
				wikiPages = pages;
				// expose wikiPages for category modules that render interactive views
				try { window.wikiPages = wikiPages; } catch(_) {}
				try { window.dispatchEvent(new CustomEvent('wikiPagesUpdated')); } catch(_) {}
				// expose save helper for modules to persist module data
				try { window.saveWikiPage = saveWikiPage; } catch(_) {}
				buildSidebar();
				// refresh related datalists for category editors
				try { populateRelatedDatalists(); } catch (_) {}
				// Re-render current page if it exists to reflect any updates
				const match = (location.hash || '').match(/^#\/page\/(.+)$/);
				if (match && wikiPages[match[1]]) {
					openWikiPage(match[1]);
				} else if (!match) {
					// If on the home page, ensure the category grid is visible unless we're showing relationships
					const catGrid = document.getElementById('category-grid');
					if (catGrid && ((location.hash || '') !== '#/relationships' && (location.hash || '') !== '#/maps')) catGrid.classList.remove('hidden');
				}
			});

			// Initial load and routing
			router();
		} else {
			// User is signed out
			userDisplay.textContent = '';
			userDisplay.classList.add('hidden');
			loginBtn.classList.remove('hidden');
			logoutBtn.classList.add('hidden');
			
			// Clear local data and UI
			wikiPages = {};
			buildSidebar();
			router(); // Reroute to home/login view
		}
	});


	// Populate category select
	const catSel = document.getElementById('wiki-editor-category');
	if (catSel) {
		catSel.innerHTML = NAV_CATEGORIES.sort((a,b)=>a.localeCompare(b)).map(c => `<option value="${c}">${c}</option>`).join('');
		if (!catSel.value) catSel.value = 'Encyclopedia';
		// When category changes, render module extras
		// Ensure sidebar reflects any recent changes (make nav links visible immediately)
		try { buildSidebar(); } catch(_) {}
		catSel.addEventListener('change', () => {
			const selected = catSel.value;
			const mod = getModule && getModule(selected);
			if (mod && mod.renderExtras) {
				const currentSlug = (document.getElementById('wiki-editor-title').dataset.slug) || '';
				const ctx = { name: currentSlug, meta: (wikiPages[currentSlug] && wikiPages[currentSlug].meta) || {} };
				mod.renderExtras(ctx);
				try { populateRelatedDatalists(); } catch (_) {}
			} else {
				const box = document.getElementById('wiki-editor-category-extras'); if (box) box.innerHTML = '';
			}
				// Toggle title input visibility for Characters
				try {
					const titleInput = document.getElementById('wiki-editor-title');
					if (String(selected) === 'Characters') {
						titleInput.style.display = 'none';
						const fn = document.getElementById('ch-fullName'); if (fn) fn.focus();
					} else {
						titleInput.style.display = '';
						titleInput.focus();
					}
				} catch(_) {}
		});
	}

	// Wire search + add entry
	const searchBar = document.getElementById('search-bar');
	const contentContainer = document.getElementById('content-container');
	const addEntryBtn = document.getElementById('add-entry-btn');
	if (searchBar && contentContainer) {
		searchBar.addEventListener('input', (e) => {
			const term = (e.target.value || '').trim();
			renderSearchResults(term, contentContainer);
		});
	}
	function openNewEditor(category = 'Encyclopedia') {
		document.getElementById('page-area').classList.add('hidden');
		const editorWrap = document.getElementById('wiki-editor-inline');
			// Mark origin as home/new so Cancel/Close returns to grid
			try { editorWrap.dataset.origin = 'home'; } catch(_) {}
		const titleInput = document.getElementById('wiki-editor-title');
		const categorySelect = document.getElementById('wiki-editor-category');
		const thumbInput = document.getElementById('wiki-editor-thumb');
		const thumbPrev = document.getElementById('wiki-editor-thumb-preview');
		const contentEl = document.getElementById('wiki-editor-content');
		titleInput.value = '';
		titleInput.removeAttribute('data-slug');
	// summary field removed
		categorySelect.value = category || 'Encyclopedia';
		thumbInput.value = '';
		thumbPrev.innerHTML = '';
		contentEl.innerHTML = '';
		// Render category extras for new page
		const mod = getModule && getModule(categorySelect.value);
		if (mod && mod.renderExtras) mod.renderExtras({ name: '', meta: {} }); else { const box = document.getElementById('wiki-editor-category-extras'); if (box) box.innerHTML=''; }
		try { populateRelatedDatalists(); } catch (_) {}
		editorWrap.classList.remove('hidden');
		applyEditorFont();
		// For Characters, hide title input and focus Full Name
		try {
			if (String(categorySelect.value) === 'Characters') {
				titleInput.style.display = 'none';
				const fn = document.getElementById('ch-fullName'); if (fn) fn.focus();
			} else {
				titleInput.style.display = '';
				titleInput.focus();
			}
		} catch(_) {}
	}
	if (addEntryBtn) addEntryBtn.addEventListener('click', () => openNewEditor('Encyclopedia'));
	const heroAdd = document.getElementById('hero-add');
	if (heroAdd) heroAdd.addEventListener('click', () => openNewEditor('Encyclopedia'));

	// Thumb upload
	const thumbFile = document.getElementById('wiki-editor-thumb-file');
	const thumbUrlInput = document.getElementById('wiki-editor-thumb');
	const thumbPreview = document.getElementById('wiki-editor-thumb-preview');

	async function resizeImage(file, options = { maxSize: 512, quality: 0.8 }) {
		return new Promise((resolve, reject) => {
			try {
				const img = new Image();
				const reader = new FileReader();
				reader.onload = () => {
					img.onload = () => {
						const canvas = document.createElement('canvas');
						let { width, height } = img;
						const max = options.maxSize || 512;
						if (width > height && width > max) { height = Math.round(height * (max / width)); width = max; }
						else if (height > max) { width = Math.round(width * (max / height)); height = max; }
						canvas.width = width; canvas.height = height;
						const ctx = canvas.getContext('2d');
						ctx.drawImage(img, 0, 0, width, height);
						const quality = options.quality || 0.8;
						// Try WebP first; fallback to JPEG if not supported
						canvas.toBlob((webpBlob) => {
							if (webpBlob) {
								const name = file.name.replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, '.webp');
								const resizedFile = new File([webpBlob], name, { type: 'image/webp' });
								resolve(resizedFile);
							} else {
								canvas.toBlob((jpegBlob) => {
									if (!jpegBlob) { reject(new Error('Canvas toBlob failed')); return; }
									const name = file.name.replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, '.jpg');
									const resizedFile = new File([jpegBlob], name, { type: 'image/jpeg' });
									resolve(resizedFile);
								}, 'image/jpeg', quality);
							}
						}, 'image/webp', quality);
					};
					img.onerror = reject;
					img.src = reader.result;
				};
				reader.onerror = reject;
				reader.readAsDataURL(file);
			} catch (err) { reject(err); }
		});
	}

	async function handleThumbFile(file) {
		if (!file) return;
		if (thumbPreview) thumbPreview.innerHTML = '<div class="text-sm text-gray-400">Uploading thumbnail…</div>';
		try {
			const resized = await resizeImage(file, { maxSize: 512, quality: 0.82 });
			const { uploadFile } = await import('./firebase.js');
			const url = await uploadFile(resized, 'thumbnails', (p) => {
				if (thumbPreview) thumbPreview.innerHTML = `<div class="text-sm text-gray-400">Uploading… ${Math.round(p)}%</div>`;
			});
			if (thumbUrlInput) thumbUrlInput.value = url;
			if (thumbPreview) thumbPreview.innerHTML = `<img src="${url}" class="w-24 h-24 object-cover rounded"/>`;
		} catch (err) {
			console.error('Thumbnail upload failed', err);
			if (thumbPreview) thumbPreview.innerHTML = '<div class="text-sm text-red-400">Upload failed</div>';
		}
	}

	if (thumbFile) thumbFile.addEventListener('change', async (e) => {
		const f = e.target.files && e.target.files[0]; if (!f) return;
		handleThumbFile(f);
	});

	// Drag & drop onto the preview area
	if (thumbPreview) {
		thumbPreview.addEventListener('dragover', (e)=>{ e.preventDefault(); thumbPreview.classList.add('ring-2','ring-sky-500'); });
		thumbPreview.addEventListener('dragleave', ()=>{ thumbPreview.classList.remove('ring-2','ring-sky-500'); });
		thumbPreview.addEventListener('drop', (e)=>{
			e.preventDefault(); thumbPreview.classList.remove('ring-2','ring-sky-500');
			const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			handleThumbFile(f);
		});
	}

	// Paste image into the preview area
	if (thumbPreview) {
		thumbPreview.addEventListener('paste', (e) => {
			const items = e.clipboardData && e.clipboardData.items;
			if (!items) return;
			for (let i=0; i<items.length; i++) {
				const it = items[i];
				if (it.type && it.type.startsWith('image/')) {
					const f = it.getAsFile();
					handleThumbFile(f);
					break;
				}
			}
		});
	}

	// Font controls (toolbar removed) — guard existence
	const fontSelect = document.getElementById('editor-font');
	const sizeSelect = document.getElementById('editor-font-size');
	if (fontSelect && sizeSelect) {
		window.applyEditorFont = function applyEditorFont() {
			const ta = document.getElementById('wiki-editor-content'); if (!ta) return;
			const font = fontSelect.value;
			if (font === 'serif') ta.style.fontFamily = 'Georgia, serif';
			else if (font === 'mono') ta.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace';
			else ta.style.fontFamily = '';
			ta.style.fontSize = sizeSelect.value + 'px';
		};
		fontSelect.addEventListener('change', window.applyEditorFont);
		sizeSelect.addEventListener('change', window.applyEditorFont);
	} else {
		window.applyEditorFont = function applyEditorFont() { /* no-op when toolbar font controls are absent */ };
	}

	// Editor formatting toolbar removed — formatting actions are no longer provided

	const editorImageBtn = document.getElementById('editor-image');
	const editorImageFile = document.getElementById('editor-image-file');
	const editorImageInsert = document.getElementById('editor-image-insert');
	if (editorImageBtn) editorImageBtn.addEventListener('click', () => { const panel = document.getElementById('editor-image-panel'); if (panel) panel.classList.toggle('hidden'); });
	if (editorImageFile) editorImageFile.addEventListener('change', (e) => {
		const f = e.target.files && e.target.files[0]; if (!f) return;
		const reader = new FileReader(); reader.onload = (ev) => {
			const data = ev.target.result; const urlInput = document.getElementById('editor-image-url'); const preview = document.getElementById('editor-image-preview'); if (urlInput) urlInput.value = data; if (preview) preview.innerHTML = `<img src="${data}" class="w-16 h-16 object-cover rounded"/>`;
		}; reader.readAsDataURL(f);
	});
	if (editorImageInsert) editorImageInsert.addEventListener('click', () => {
		const urlEl = document.getElementById('editor-image-url'); const url = urlEl ? urlEl.value.trim() : '';
		if (!url) { showToast('Provide an image URL or upload a file', 'error'); return; }
		exec('insertImage', url);
		const panel = document.getElementById('editor-image-panel'); if (panel) panel.classList.add('hidden'); if (urlEl) urlEl.value = '';
		const preview = document.getElementById('editor-image-preview'); if (preview) preview.innerHTML = '';
	});

	const editorContentEl = document.getElementById('wiki-editor-content');
	if (editorContentEl) {
		editorContentEl.addEventListener('input', () => tagInternalAnchors(editorContentEl));
		editorContentEl.addEventListener('paste', () => {
			setTimeout(() => {
				replaceMarkdownLinksInElement(editorContentEl);
				autoLinkKnownPagesInElement(editorContentEl);
				tagInternalAnchors(editorContentEl);
			}, 0);
		});
	}
	// Short summary input removed from editor; preview logic disabled

	// Link indicator + panel
	const linkIndicator = document.getElementById('editor-link-indicator');
	const unlinkBtn = document.getElementById('editor-unlink');
	const linkBtn = document.getElementById('editor-link');
	// Safe exec fallback for browsers where execCommand might not exist
	const exec = (command, value=null) => {
		if (document.execCommand) return document.execCommand(command, false, value);
		return false;
	};
	const getAnchorAtSelection = () => {
		const sel = window.getSelection && window.getSelection(); if (!sel || sel.rangeCount === 0) return null;
		let node = sel.anchorNode; if (!node) return null; if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
		return node && node.closest ? node.closest('a') : null;
	};
	const updateLinkIndicator = () => {
		if (!linkIndicator || !linkBtn) return;
		const a = getAnchorAtSelection();
		if (a && a.closest('#wiki-editor-content')) {
			linkIndicator.classList.remove('hidden'); linkBtn.classList.add('ring-2','ring-black');
		} else { linkIndicator.classList.add('hidden'); linkBtn.classList.remove('ring-2','ring-black'); }
	};
	document.addEventListener('selectionchange', () => {
		const ed = document.getElementById('wiki-editor-inline');
		if (ed && !ed.classList.contains('hidden')) updateLinkIndicator();
	});
	if (unlinkBtn) unlinkBtn.addEventListener('click', (e) => {
		e.preventDefault(); const a = getAnchorAtSelection(); if (!a) return;
		const text = a.textContent; a.replaceWith(document.createTextNode(text)); updateLinkIndicator();
	});

	const linkPanel = document.getElementById('editor-link-panel');
	const linkLabel = document.getElementById('link-label');
	const linkTarget = document.getElementById('link-target');
	const linkList = document.getElementById('link-page-list');
	const linkCreate = document.getElementById('link-create');
	let linkSavedRange = null;
	function populateLinkList() {
		const names = new Set([ ...Object.keys(wikiPages), ...staticPages.map(p => p.name) ]);
		linkList.innerHTML = Array.from(names).sort().map(n => `<option value="${prettifyTitle(n)}"></option>`).join('');
	}

	function populateRelatedDatalists() {
		const allNames = new Set([ ...Object.keys(wikiPages), ...staticPages.map(p => p.name) ]);
		const dls = Array.from(document.querySelectorAll('datalist[data-pagesource="all"]'));
		dls.forEach(dl => {
			const filterCat = dl.dataset.filterCategory || null;
			let items = Array.from(allNames);
			if (filterCat) {
				items = items.filter(n => {
					const obj = wikiPages[n] && typeof wikiPages[n] === 'object' ? wikiPages[n].meta || {} : null;
					const cat = obj ? (obj.category || '') : (staticPages.find(p => p.name === n) || {}).category || '';
					return (cat === filterCat);
				});
			}
			const arr = items.sort();
			const opts = arr.map(n => `<option value="${prettifyTitle(n)}"></option>`).join('');
			dl.innerHTML = opts; dl.dataset.populated = String(Date.now());
		});
	// datalists populated (logging suppressed)
	}
	function getCurrentRange() {
		const sel = window.getSelection && window.getSelection(); if (!sel || sel.rangeCount === 0) return null;
		return sel.getRangeAt(0).cloneRange();
	}
	const editorLinkBtn = document.getElementById('editor-link'); if (editorLinkBtn) editorLinkBtn.addEventListener('click', () => {
		populateLinkList();
		linkSavedRange = getCurrentRange();
		const selText = linkSavedRange ? linkSavedRange.toString().trim() : '';
		linkLabel.value = selText || '';
		linkTarget.value = selText ? prettifyTitle(normalizePageName(selText)) : '';
		linkCreate.checked = false;
		linkPanel.classList.toggle('hidden');
	});

	// call populateRelatedDatalists whenever pages change
	try { populateRelatedDatalists(); } catch (_) {}

	// Ensure datalists are populated when a related input receives focus (fix timing/order issues)
	document.addEventListener('focusin', (e) => {
		try {
			const t = e.target;
			if (!t || t.tagName !== 'INPUT') return;
			const listId = t.getAttribute && t.getAttribute('list');
			if (!listId) return;
			const dl = document.getElementById(listId);
			if (!dl) return;
			if (!dl.innerHTML || dl.innerHTML.trim() === '') {
				// populating datalist on focus
				populateRelatedDatalists();
			} else {
				// mark and log that datalist already had content
				// datalist already populated
			}
	} catch (err) { console.error('focusin handler error', err); }
	});

// Lightweight typeahead dropdown for inputs that use related-page datalists
function attachPageTypeahead(input) {
	if (!input || input._pageTypeaheadAttached) return;
	input._pageTypeaheadAttached = true;
	const box = document.createElement('div');
	box.className = 'absolute z-50 bg-gray-800 border border-gray-700 rounded max-h-48 overflow-auto text-sm';
	box.style.minWidth = '200px'; box.style.display = 'none';
	document.body.appendChild(box);

	function getCandidates() {
		const names = new Set([ ...Object.keys(wikiPages), ...staticPages.map(p => p.name) ]);
		return Array.from(names).sort().map(n => ({ slug: n, label: prettifyTitle(n) }));
	}

	function showSuggestions() {
		const q = (input.value || '').trim().toLowerCase();
		const cand = getCandidates().filter(c => c.label.toLowerCase().includes(q)).slice(0, 20);
		if (cand.length === 0) { box.style.display = 'none'; return; }
		box.innerHTML = cand.map(c => `<div class="px-2 py-1 hover:bg-gray-700 cursor-pointer" data-slug="${encodeURIComponent(c.slug)}">${c.label}</div>`).join('');
		const rect = input.getBoundingClientRect();
		box.style.left = (rect.left + window.scrollX) + 'px';
		box.style.top = (rect.bottom + window.scrollY + 4) + 'px';
		box.style.minWidth = rect.width + 'px';
		box.style.display = 'block';
	}

	function hideSuggestions() { box.style.display = 'none'; }

	input.addEventListener('input', () => { try { showSuggestions(); } catch(_) {} });
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') hideSuggestions();
	});
	document.addEventListener('click', (ev) => {
		if (!box.contains(ev.target) && ev.target !== input) hideSuggestions();
	});
	box.addEventListener('click', (ev) => {
		const t = ev.target.closest && ev.target.closest('[data-slug]');
		if (!t) return; ev.preventDefault();
		const slug = decodeURIComponent(t.dataset.slug);
		input.value = prettifyTitle(slug);
		hideSuggestions();
	});

	// show on focus if value present
	input.addEventListener('focus', () => { try { showSuggestions(); } catch(_) {} });
}

// Attach typeahead when related inputs are rendered/focused
document.addEventListener('focusin', (e) => {
	const t = e.target;
	if (!t || t.tagName !== 'INPUT') return;
	try {
		const listId = t.getAttribute && t.getAttribute('list');
		if (!listId) return;
		const dl = document.getElementById(listId);
		if (dl && dl.dataset && dl.dataset.pagesource === 'all') attachPageTypeahead(t);
	} catch (_) {}
});
	const linkCancelBtn = document.getElementById('link-cancel'); if (linkCancelBtn) linkCancelBtn.addEventListener('click', () => { if (linkPanel) linkPanel.classList.add('hidden'); linkSavedRange = null; });
	const linkInsertBtn = document.getElementById('link-insert'); if (linkInsertBtn) linkInsertBtn.addEventListener('click', () => {
		const label = (linkLabel.value || '').trim();
		const targetName = (linkTarget.value || '').trim();
		if (!label || !targetName) { showToast('Label and target are required', 'error'); return; }
		const slug = encodeURIComponent(normalizePageName(targetName));
		const editor = document.getElementById('wiki-editor-content'); editor.focus();
		const sel = window.getSelection(); if (linkSavedRange) { sel.removeAllRanges(); sel.addRange(linkSavedRange); }
		const useLabel = label || (sel.rangeCount ? sel.getRangeAt(0).toString() : targetName);
		if (sel.rangeCount > 0) {
			const range = sel.getRangeAt(0); range.deleteContents();
			const a = document.createElement('a'); a.href = `#/page/${slug}`; a.className = 'internal-link'; a.textContent = useLabel; range.insertNode(a);
			const after = document.createRange(); after.setStartAfter(a); after.setEndAfter(a); sel.removeAllRanges(); sel.addRange(after);
		} else {
			exec('insertHTML', `<a href="#/page/${slug}" class="internal-link">${useLabel}</a>`);
		}
		tagInternalAnchors(editor);
		const normKey = normalizePageName(targetName);
		if (linkCreate.checked && !wikiPages[normKey]) {
			const newPageData = { meta: { summary: '', thumb: '', category: 'Encyclopedia' }, content: '<p><em>New page.</em></p>' };
			wikiPages[normKey] = newPageData;
			savePage(normKey, newPageData); // Save to Firebase
			
			buildSidebar();
			showToast(`Created stub page: ${prettifyTitle(normKey)}`);
		}
		linkPanel.classList.add('hidden'); linkSavedRange = null;
	});

	// Delegate quick-add per category (sidebar and grid)
	document.addEventListener('click', (e) => {
		const btn = e.target.closest && e.target.closest('[data-add-cat]');
		if (!btn) return;
		const cat = btn.getAttribute('data-add-cat') || 'Encyclopedia';
		openNewEditor(cat);
	});

	// Image props panel
	const imgProps = document.getElementById('editor-image-props') || null;
	let selectedImageEl = null;
	function openImageProps(img) {
		if (!imgProps) return; // nothing to do
		selectedImageEl = img;
		const urlEl = document.getElementById('img-prop-url'); if (urlEl) urlEl.value = img.getAttribute('src') || '';
		const altEl = document.getElementById('img-prop-alt'); if (altEl) altEl.value = img.getAttribute('alt') || '';
		const w = img.style.width || ''; const widthPct = w.endsWith('%') ? parseInt(w) : 100;
		const widthEl = document.getElementById('img-prop-width'); if (widthEl) widthEl.value = isNaN(widthPct) ? 100 : widthPct;
		let align = 'none';
		if (img.style.float === 'left') align = 'left';
		else if (img.style.float === 'right') align = 'right';
		else if ((img.style.display || '') === 'block' && img.style.marginLeft === 'auto' && img.style.marginRight === 'auto') align = 'center';
		const alignEl = document.getElementById('img-prop-align'); if (alignEl) alignEl.value = align;
		const previewEl = document.getElementById('img-prop-preview'); if (previewEl) previewEl.innerHTML = `<img src="${img.src}" class="max-h-24 rounded"/>`;
		imgProps.classList.remove('hidden');
	}
	const editorContentClickable = document.getElementById('wiki-editor-content');
	if (editorContentClickable) editorContentClickable.addEventListener('click', (e) => {
		const img = e.target && e.target.tagName === 'IMG' ? e.target : null; if (img) openImageProps(img);
	});
	const imgPropFile = document.getElementById('img-prop-file');
	if (imgPropFile) imgPropFile.addEventListener('change', (e) => {
		const f = e.target.files && e.target.files[0]; if (!f || !selectedImageEl) return;
		const reader = new FileReader(); reader.onload = (ev) => {
			const data = ev.target.result; const urlEl = document.getElementById('img-prop-url'); const previewEl = document.getElementById('img-prop-preview'); if (urlEl) urlEl.value = data; if (previewEl) previewEl.innerHTML = `<img src="${data}" class="max-h-24 rounded"/>`;
		}; reader.readAsDataURL(f);
	});
	const imgPropApply = document.getElementById('img-prop-apply');
	if (imgPropApply) imgPropApply.addEventListener('click', () => {
		if (!selectedImageEl || !imgProps) { if (imgProps) imgProps.classList.add('hidden'); return; }
		const url = (document.getElementById('img-prop-url') || { value: '' }).value.trim();
		const alt = (document.getElementById('img-prop-alt') || { value: '' }).value.trim();
		const width = parseInt((document.getElementById('img-prop-width') || { value: '100' }).value, 10);
		const align = (document.getElementById('img-prop-align') || { value: 'none' }).value;
		if (url) selectedImageEl.setAttribute('src', url);
		selectedImageEl.setAttribute('alt', alt);
		selectedImageEl.style.width = (isNaN(width) ? 100 : width) + '%';
		selectedImageEl.style.float = 'none'; selectedImageEl.style.display = ''; selectedImageEl.style.marginLeft = ''; selectedImageEl.style.marginRight = '';
		if (align === 'left') { selectedImageEl.style.float = 'left'; selectedImageEl.style.marginRight = '1rem'; }
		else if (align === 'right') { selectedImageEl.style.float = 'right'; selectedImageEl.style.marginLeft = '1rem'; }
		else if (align === 'center') { selectedImageEl.style.display = 'block'; selectedImageEl.style.marginLeft = 'auto'; selectedImageEl.style.marginRight = 'auto'; }
		imgProps.classList.add('hidden'); selectedImageEl = null;
	});
	const imgPropClose = document.getElementById('img-prop-close'); if (imgPropClose) imgPropClose.addEventListener('click', () => { if (imgProps) imgProps.classList.add('hidden'); selectedImageEl = null; });

	// History modal (guard attachments)
	const historyClose = document.getElementById('history-close'); const historyModal = document.getElementById('history-modal'); const historyList = document.getElementById('history-list'); const editorHistoryBtn = document.getElementById('editor-history');
	if (historyClose && historyModal) historyClose.addEventListener('click', () => historyModal.classList.add('hidden'));
	if (historyModal) historyModal.addEventListener('click', (e) => { if (e.target.id === 'history-modal') historyModal.classList.add('hidden'); });
	if (historyList) historyList.addEventListener('click', (e) => { /* disabled */ });
	if (editorHistoryBtn) editorHistoryBtn.addEventListener('click', () => { showToast('History is not yet implemented with Firebase.', 'info'); });

		// Delete wiring (viewer and editor)
		const viewerDeleteBtn = document.getElementById('delete-page');
		const editorDeleteBtn = document.getElementById('editor-delete');
		function doDelete(slug) {
			if (!canDelete(slug)) { showToast('Static pages cannot be deleted.', 'error'); return; }
			if (!wikiPages[slug]) { showToast('Only local pages can be deleted.', 'error'); return; }
			if (!confirm(`Delete "${prettifyTitle(slug)}"? This cannot be undone.`)) return;
			try {
				delete wikiPages[slug];
				deletePage(slug); // Firebase delete

				// Cleanup links in local pages pointing to this slug
				Object.keys(wikiPages).forEach(k => {
					const v = wikiPages[k];
					if (v && typeof v === 'object') {
						const oldContent = v.content || '';
						const newContent = oldContent.replace(new RegExp(`#\/page\/${escapeRegExp(slug)}`, 'g'), '#');
						if (oldContent !== newContent) {
							v.content = newContent;
							savePage(k, v); // Save updated page to Firebase
						}
						// Remove backlinks pointing to deleted page
						if (v.meta && Array.isArray(v.meta.backlinks)) {
							const before = v.meta.backlinks.length;
							v.meta.backlinks = v.meta.backlinks.map(normalizePageName).filter(x => x !== normalizePageName(slug));
							if (v.meta.backlinks.length !== before) savePage(k, v);
						}
					}
				});

				buildSidebar();
				// Hide page/editor and go home
				document.getElementById('wiki-editor-inline').classList.add('hidden');
				document.getElementById('page-area').classList.add('hidden');
				const catGrid = document.getElementById('category-grid'); if (catGrid) catGrid.classList.remove('hidden');
				location.hash = '#/';
				showToast('Page deleted.');
			} catch (e) { showToast('Failed to delete page.', 'error'); }
		}
		if (viewerDeleteBtn) viewerDeleteBtn.addEventListener('click', () => {
			const btn = document.getElementById('open-wiki-editor');
			const slug = btn && btn.dataset.page ? btn.dataset.page : '';
			if (!slug) return;
			doDelete(slug);
		});
		if (editorDeleteBtn) editorDeleteBtn.addEventListener('click', () => {
			const titleInput = document.getElementById('wiki-editor-title');
			const slug = titleInput.dataset.slug || normalizePageName(titleInput.value.trim());
			if (!slug) return;
			doDelete(slug);
		});

	// Rename wiring
	const renamePanel = document.getElementById('rename-panel');
	const renameInput = document.getElementById('rename-input');
	const editorRenameBtn = document.getElementById('editor-rename');
	const renameCancelBtn = document.getElementById('rename-cancel');
	const renameApplyBtn = document.getElementById('rename-apply');
	if (editorRenameBtn && renamePanel && renameInput) editorRenameBtn.addEventListener('click', () => {
		const titleInput = document.getElementById('wiki-editor-title');
		const page = titleInput.dataset.slug || normalizePageName(titleInput.value.trim());
		renameInput.value = prettifyTitle(page); renamePanel.classList.remove('hidden');
	});
	if (renameCancelBtn && renamePanel) renameCancelBtn.addEventListener('click', () => renamePanel.classList.add('hidden'));
	if (renameApplyBtn) renameApplyBtn.addEventListener('click', () => {
		const titleInput = document.getElementById('wiki-editor-title');
		const oldSlug = titleInput.dataset.slug || normalizePageName(titleInput.value.trim());
		const newName = renameInput.value.trim(); const newSlug = normalizePageName(newName);
		if (!newSlug) { showToast('New name is required', 'error'); return; }
		if (newSlug === oldSlug) { renamePanel.classList.add('hidden'); return; }
		if (wikiPages[newSlug]) { showToast('A page with that name exists', 'error'); return; }
		const value = wikiPages[oldSlug]; if (!value) { showToast('Current page not found', 'error'); return; }
		
		// Create new, delete old in Firebase
			// Save renamed document and delete old one
			savePage(newSlug, value);
			deletePage(oldSlug);

		wikiPages[newSlug] = value; 
		delete wikiPages[oldSlug]; 

			Object.keys(wikiPages).forEach(k => {
			const v = wikiPages[k];
			if (v && typeof v === 'object') {
				const oldContent = v.content || '';
				const newContent = oldContent.replace(new RegExp(`#/page/${escapeRegExp(oldSlug)}`, 'g'), `#/page/${newSlug}`);
				if (oldContent !== newContent) {
					v.content = newContent;
					savePage(k, v); // Save updated page to Firebase
				}
					// Update backlinks entries to point to newSlug
					if (v.meta && Array.isArray(v.meta.backlinks)) {
						let changed = false;
						v.meta.backlinks = v.meta.backlinks.map(s => {
							const nn = normalizePageName(s);
							if (nn === oldSlug) { changed = true; return newSlug; }
							return nn;
						});
						if (changed) savePage(k, v);
					}
			}
		});
		
		titleInput.dataset.slug = newSlug; titleInput.value = prettifyTitle(newSlug);
		buildSidebar(); renamePanel.classList.add('hidden'); showToast('Page renamed. Links updated.'); openWikiPage(newSlug);
	});

	// Save wiki page
	const saveWikiBtn = document.getElementById('save-wiki-page');
	if (saveWikiBtn) saveWikiBtn.addEventListener('click', async () => {
		const titleInput = document.getElementById('wiki-editor-title');
	const summary = '';
		const category = document.getElementById('wiki-editor-category').value;
		const thumb = document.getElementById('wiki-editor-thumb').value.trim();
		let content = document.getElementById('wiki-editor-content').innerHTML;
		try {
			content = content.replace(/\[\[([\s\S]*?)\]\]/g, (m, p1) => {
				const slug = encodeURIComponent(normalizePageName(p1)); const label = (p1 || '').trim();
				return `<a href="#/page/${slug}" class="internal-link">${label}</a>`;
			});
			content = content.replace(/\[([^\]]+)\]\s*\(\s*#\/page\/([^\)]+)\s*\)/g, (m, label, slug) => {
				const lab = (label || '').trim(); const s = encodeURIComponent(normalizePageName(decodeURIComponent((slug || '').trim())));
				return `<a href="#/page/${s}" class="internal-link">${lab}</a>`;
			});
		} catch (_) {}
			const baseMeta = { summary, thumb, category };
			// Let category module add/transform meta
			const mod = getModule && getModule(category);
			if (mod && mod.applyExtrasToMeta) {
				try { mod.applyExtrasToMeta(baseMeta, document.getElementById('wiki-editor-category-extras')); } catch(_) {}
			}
			// Always set title from fullName for Characters, and ensure fullName is present
			if (String(baseMeta.category) === 'Characters') {
				baseMeta.fullName = baseMeta.fullName || document.getElementById('ch-fullName')?.value?.trim() || '';
				if (!baseMeta.fullName) {
					showToast('Full Name is required for Characters', 'error');
					return;
				}
				baseMeta.title = baseMeta.fullName;
			}
	// Compute desired slug now that meta is ready
			let desiredSlug = '';
			if (String(baseMeta.category) === 'Characters') {
				desiredSlug = normalizePageName(baseMeta.fullName);
			} else {
				desiredSlug = normalizePageName((titleInput.value || '').trim());
			}
			if (!desiredSlug) { showToast('Page name required', 'error'); return; }
			// Always use the normalized slug for both lookup and save
			const oldSlug = titleInput.dataset.slug ? normalizePageName(titleInput.dataset.slug) : desiredSlug;
			const snapshot = { meta: baseMeta, content };
		// Before saving, ensure backlinks for related fields are updated.
		try {
			const prev = wikiPages[oldSlug] && typeof wikiPages[oldSlug] === 'object' ? (wikiPages[oldSlug].meta || {}) : {};
			// Cultures -> relatedReligion
			if (baseMeta.category === 'Cultures') {
				const prevRel = prev.religion || null;
				const newRel = baseMeta.religion || null;
				if (prevRel && prevRel !== newRel) await removeBacklink(prevRel, oldSlug);
				if (newRel && newRel !== prevRel) { await createStubIfMissing(newRel, 'Religions'); await addBacklink(newRel, desiredSlug); }
			}
			// Religions -> relatedCulture
			if (baseMeta.category === 'Religions') {
				const prevRel = prev.relatedCulture || null;
				const newRel = baseMeta.relatedCulture || null;
				if (prevRel && prevRel !== newRel) await removeBacklink(prevRel, oldSlug);
				if (newRel && newRel !== prevRel) { await createStubIfMissing(newRel, 'Cultures'); await addBacklink(newRel, desiredSlug); }
			}
		} catch (e) { console.error('Related link handling failed', e); }
	// saving page (log suppressed)
				const performPostSave = (finalSlug) => {
					try { window.dispatchEvent(new CustomEvent('wikiPagesUpdated')); } catch(_) {}
					const titleInputEl = document.getElementById('wiki-editor-title');
					if (titleInputEl) titleInputEl.dataset.slug = finalSlug;
					document.getElementById('wiki-editor-inline').classList.add('hidden');
					const pretty = prettifyTitle(finalSlug); const pageTitleEl = document.getElementById('page-title'); if (pageTitleEl) pageTitleEl.textContent = pretty;
					openWikiPage(finalSlug);
				};

					if (oldSlug && desiredSlug && oldSlug !== desiredSlug) {
						if (wikiPages[desiredSlug]) { showToast('A page with that name exists', 'error'); saveWikiPage(oldSlug, snapshot); addHistorySnapshot(oldSlug, snapshot); performPostSave(oldSlug); return; }
						// Save under new slug and update references like the Rename workflow
						try {
							savePage(desiredSlug, snapshot);
							wikiPages[desiredSlug] = snapshot;
							if (wikiPages[oldSlug]) { delete wikiPages[oldSlug]; deletePage(oldSlug); }
							Object.keys(wikiPages).forEach(k => {
								const v = wikiPages[k];
								if (v && typeof v === 'object') {
									const oldContent = v.content || '';
									const newContent = oldContent.replace(new RegExp(`#/page/${escapeRegExp(oldSlug)}`, 'g'), `#/page/${desiredSlug}`);
									if (oldContent !== newContent) { v.content = newContent; savePage(k, v); }
									if (v.meta && Array.isArray(v.meta.backlinks)) {
										let changed = false;
										v.meta.backlinks = v.meta.backlinks.map(s => {
											const nn = normalizePageName(s);
											if (nn === oldSlug) { changed = true; return desiredSlug; }
											return nn;
										});
										if (changed) savePage(k, v);
									}
								}
							});
							titleInput.dataset.slug = desiredSlug;
							buildSidebar();
							showToast('Page renamed. Links updated.');
							performPostSave(desiredSlug);
						} catch (e) {
							console.error('Rename-on-save failed', e);
							saveWikiPage(oldSlug, snapshot); addHistorySnapshot(oldSlug, snapshot); performPostSave(oldSlug);
						}
					} else {
						// Always use the normalized slug for saving and opening
						saveWikiPage(desiredSlug, snapshot); addHistorySnapshot(desiredSlug, snapshot); performPostSave(desiredSlug);
					}
	});

	// Open editor from viewer
	document.addEventListener('click', (e) => {
		const trigger = e.target.closest && e.target.closest('#open-wiki-editor');
		if (!trigger) return;
		const page = trigger.dataset.page || 'new_page';
		const normPage = normalizePageName(page);
		const stored = wikiPages[normPage];
		let content = ''; let summary = ''; let thumb = '';
		if (typeof stored === 'string') content = stored;
		else if (stored) { content = stored.content || ''; summary = ''; thumb = (stored.meta && stored.meta.thumb) || ''; }
		else {
			const cached = pageIndex[normPage]; if (cached) content = cached; else { try { fetch(`./${normPage}.md`).then(r => r.ok ? r.text() : '').then(md => { if (md) document.getElementById('wiki-editor-content').innerText = md; }).catch(()=>{}); } catch(_){} }
		}
		const titleInput = document.getElementById('wiki-editor-title'); titleInput.value = prettifyTitle(page); titleInput.dataset.slug = normPage;
	// summary field removed; nothing to restore
	const catSel2 = document.getElementById('wiki-editor-category'); catSel2.value = (typeof wikiPages[page] === 'object' && wikiPages[page].meta && wikiPages[page].meta.category) ? wikiPages[page].meta.category : 'Encyclopedia';
	// Render category-specific extras for existing page
	const mod = getModule && getModule(catSel2.value);
	if (mod && mod.renderExtras) { try { mod.renderExtras({ name: page, meta: (wikiPages[page] && wikiPages[page].meta) || {} }); } catch(_) {} }
	else { const box = document.getElementById('wiki-editor-category-extras'); if (box) box.innerHTML = ''; }
	try { populateRelatedDatalists(); } catch (_) {}
	// Toggle title input visibility for Characters
	try {
		if (String(catSel2.value) === 'Characters') {
			titleInput.style.display = 'none';
			const fn = document.getElementById('ch-fullName'); if (fn) fn.focus();
		} else {
			titleInput.style.display = '';
			titleInput.focus();
		}
	} catch(_) {}
		// summary preview removed
		document.getElementById('wiki-editor-thumb').value = thumb;
		const editorEl = document.getElementById('wiki-editor-content');
		if (/<[a-z][\s\S]*>/i.test(content)) editorEl.innerHTML = content; else editorEl.innerText = content;
		replaceMarkdownLinksInElement(editorEl); autoLinkKnownPagesInElement(editorEl); tagInternalAnchors(editorEl);
			document.getElementById('wiki-editor-thumb-preview').innerHTML = thumb ? `<img src="${thumb}" class="w-24 h-24 object-cover rounded"/>` : '';
			const editorDeleteBtn = document.getElementById('editor-delete');
			if (editorDeleteBtn) {
				if (wikiPages[page] && canDelete(page)) editorDeleteBtn.classList.remove('hidden');
				else editorDeleteBtn.classList.add('hidden');
			}
		const editorWrap = document.getElementById('wiki-editor-inline');
		try { editorWrap.dataset.origin = 'viewer'; } catch(_) {}
		editorWrap.classList.remove('hidden');
		document.getElementById('page-area').classList.add('hidden');
		applyEditorFont();
		titleInput.focus();
	});

	// Close panels
	const closeWikiPanelBtn = document.getElementById('close-wiki-panel'); if (closeWikiPanelBtn) closeWikiPanelBtn.addEventListener('click', () => {
		const pageAreaEl = document.getElementById('page-area'); if (pageAreaEl) pageAreaEl.classList.add('hidden');
		history.replaceState('', document.title, window.location.pathname + window.location.search);
		const catGrid = document.getElementById('category-grid'); if (catGrid) catGrid.classList.remove('hidden');
	});
	function closeEditorRespectingOrigin() {
		const editorWrap = document.getElementById('wiki-editor-inline');
		const origin = (editorWrap && editorWrap.dataset && editorWrap.dataset.origin) || '';
		if (editorWrap) editorWrap.classList.add('hidden');
		// If opened from viewer, restore the page; if from home, keep grid visible
		if (origin === 'viewer') {
			document.getElementById('page-area').classList.remove('hidden');
		} else {
			// Ensure grid is shown when returning to home
			const catGrid = document.getElementById('category-grid'); if (catGrid) catGrid.classList.remove('hidden');
			// Keep page-area hidden to avoid extra close
			document.getElementById('page-area').classList.add('hidden');
		}
		try { delete editorWrap.dataset.origin; } catch(_) {}
	}
	const closeWikiEditorBtn = document.getElementById('close-wiki-editor'); if (closeWikiEditorBtn) closeWikiEditorBtn.addEventListener('click', closeEditorRespectingOrigin);
	const cancelWikiEditBtn = document.getElementById('cancel-wiki-edit'); if (cancelWikiEditBtn) cancelWikiEditBtn.addEventListener('click', closeEditorRespectingOrigin);

	// Toggle static visibility button
	const toggleStaticBtn = document.getElementById('toggle-static-visibility');
	if (toggleStaticBtn) {
		toggleStaticBtn.addEventListener('click', () => {
			const current = (document.getElementById('open-wiki-editor').dataset.page || '').trim();
			if (!current) return;
			const key = normalizePageName(current);
			const isStatic = staticPages.some(sp => normalizePageName(sp.name) === key);
			if (isStatic) {
				if (hiddenStatics.has(key)) hiddenStatics.delete(key); else hiddenStatics.add(key);
				saveHiddenStatics();
			} else {
				if (hiddenLocals.has(key)) hiddenLocals.delete(key); else hiddenLocals.add(key);
				saveHiddenLocals();
			}
			buildSidebar();
			if (hiddenStatics.has(key) || hiddenLocals.has(key)) { location.hash = '#/'; showToast('Page hidden.'); } else { showToast('Page shown.'); }
			updateToggleStaticButton(current);
		});
	}

	// GitHub Admin modal
	const adminBtn = document.getElementById('github-admin-btn');
	const adminModal = document.getElementById('github-admin-modal');
	const adminClose = document.getElementById('github-admin-close');
	const ghOwner = document.getElementById('gh-owner');
	const ghRepo = document.getElementById('gh-repo');
	const ghBranch = document.getElementById('gh-branch');
	const ghPrefix = document.getElementById('gh-prefix');
	const ghToken = document.getElementById('gh-token');
	const ghPrMode = document.getElementById('gh-pr-mode');
	const ghSave = document.getElementById('gh-save');
	const ghClear = document.getElementById('gh-clear');

	function loadGhConfig() {
		try {
			const raw = sessionStorage.getItem(ghSessionKey);
			if (!raw) return {};
			const cfg = JSON.parse(raw);
			ghOwner.value = cfg.owner || '';
			ghRepo.value = cfg.repo || '';
			ghBranch.value = cfg.branch || 'main';
			ghPrefix.value = cfg.prefix || '';
			ghToken.value = cfg.token || '';
			ghPrMode.checked = cfg.prMode !== false; // default true
			return cfg;
		} catch (_) { return {}; }
	}
	function saveGhConfig() {
		const cfg = {
			owner: ghOwner.value.trim(),
			repo: ghRepo.value.trim(),
			branch: ghBranch.value.trim() || 'main',
			prefix: ghPrefix.value.trim(),
			token: ghToken.value.trim(),
			prMode: !!ghPrMode.checked
		};
		sessionStorage.setItem(ghSessionKey, JSON.stringify(cfg));
		return cfg;
	}
	function clearGhConfig() { sessionStorage.removeItem(ghSessionKey); ghOwner.value = ghRepo.value = ghPrefix.value = ghToken.value = ''; ghBranch.value = 'main'; ghPrMode.checked = true; }
	function getGhConfig() {
		try { return JSON.parse(sessionStorage.getItem(ghSessionKey) || '{}'); } catch (_) { return {}; }
	}

	if (adminBtn) adminBtn.addEventListener('click', () => { loadGhConfig(); adminModal.classList.remove('hidden'); });
	if (adminClose) adminClose.addEventListener('click', () => adminModal.classList.add('hidden'));
	if (ghSave) ghSave.addEventListener('click', () => { saveGhConfig(); adminModal.classList.add('hidden'); showToast('GitHub config saved.'); });
	if (ghClear) ghClear.addEventListener('click', () => { clearGhConfig(); showToast('GitHub config cleared.'); });

	// Static GitHub delete button
	const staticDeleteBtn = document.getElementById('delete-static-github');
	const openStaticGithub = document.getElementById('open-static-github');
	if (staticDeleteBtn) {
		staticDeleteBtn.addEventListener('click', async () => {
			const current = (document.getElementById('open-wiki-editor').dataset.page || '').trim();
			if (!current) return;
			const isStatic = staticPages.some(sp => normalizePageName(sp.name) === normalizePageName(current));
			if (!isStatic) return;
			const slug = normalizePageName(current);
			const cfg = getGhConfig();
			if (!cfg.owner || !cfg.repo || !cfg.token) { showToast('Set GitHub Admin config first.', 'error'); return; }
			const pathPrefix = cfg.prefix ? cfg.prefix.replace(/^\/+|\/+$/g, '') + '/' : '';
			const filePath = `${pathPrefix}${slug}.md`;
			const confirmText = prompt(`Type the page name to confirm deletion: ${slug}`);
			if (confirmText !== slug) { showToast('Confirmation text did not match. Cancelled.'); return; }
			try {
				// Get current file SHA
				const getRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(cfg.branch || 'main')}`, {
					headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' }
				});
				if (!getRes.ok) { showToast('File not found or unauthorized.', 'error'); return; }
				const meta = await getRes.json();
				const sha = meta.sha;
				if (cfg.prMode !== false) {
					// Open a PR: create a branch, delete file in that branch, then create PR
					const base = cfg.branch || 'main';
					const prBranch = `wiki-remove-${slug}-${Date.now()}`;
					// Get base ref
					const baseRefRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/ref/heads/${encodeURIComponent(base)}`, {
						headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' }
					});
					if (!baseRefRes.ok) { showToast('Failed to read base branch.', 'error'); return; }
					const baseRef = await baseRefRes.json();
					const baseSha = baseRef.object && baseRef.object.sha;
					// Create new ref
					const newRefRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/refs`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' },
						body: JSON.stringify({ ref: `refs/heads/${prBranch}`, sha: baseSha })
					});
					if (!newRefRes.ok) { const t = await newRefRes.text(); showToast(`Failed to create branch: ${t}`, 'error'); return; }
					// Delete file on PR branch
					const delRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodeURIComponent(filePath)}`, {
						method: 'DELETE',
						headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' },
						body: JSON.stringify({ message: `chore: remove ${slug}.md via wiki UI`, sha, branch: prBranch })
					});
					if (!delRes.ok) { const t = await delRes.text(); showToast(`Delete failed: ${t}`, 'error'); return; }
					// Create PR
					const prRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/pulls`, {
						method: 'POST',
						headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' },
						body: JSON.stringify({ title: `Remove ${slug}.md`, head: prBranch, base: base, body: `Automated PR to remove ${filePath}` })
					});
					if (!prRes.ok) { const t = await prRes.text(); showToast(`PR creation failed: ${t}`, 'error'); return; }
					const pr = await prRes.json();
					hiddenStatics.add(slug); saveHiddenStatics(); buildSidebar(); location.hash = '#/';
					showToast('PR opened to remove page.');
					if (openStaticGithub) openStaticGithub.href = pr.html_url;
					window.open(pr.html_url, '_blank');
				} else {
					// Direct deletion
					const delRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodeURIComponent(filePath)}`, {
						method: 'DELETE',
						headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' },
						body: JSON.stringify({ message: `chore: remove ${slug}.md via wiki UI`, sha, branch: cfg.branch || 'main' })
					});
					if (!delRes.ok) { const t = await delRes.text(); showToast(`Delete failed: ${t}`, 'error'); return; }
					hiddenStatics.add(slug); saveHiddenStatics(); buildSidebar(); location.hash = '#/';
					showToast('Static page deleted in GitHub.');
					const fileUrl = `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/tree/${encodeURIComponent(cfg.branch || 'main')}/${filePath}`;
					if (openStaticGithub) openStaticGithub.href = fileUrl;
				}
			} catch (e) { showToast('GitHub delete error.', 'error'); }
		});
	}

	buildSidebar();
	window.addEventListener('hashchange', router);
	router();
}

// Bootstrap after DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		try { bootstrap(); } catch (err) { console.error('Bootstrap error:', err); window.alert && window.alert('Bootstrap error: see console'); }
	});
} else {
	try { bootstrap(); } catch (err) { console.error('Bootstrap error:', err); window.alert && window.alert('Bootstrap error: see console'); }
}

// Export small helpers if needed elsewhere
export { normalizePageName, prettifyTitle };

// Helpers to update toggle button label/visibility from openWikiPage
function updateToggleStaticButton(pageName) {
	const btn = document.getElementById('toggle-static-visibility');
	if (!btn) return;
	const key = normalizePageName(pageName);
	const isStatic = staticPages.some(sp => normalizePageName(sp.name) === key);
	// Show toggle for both local and static pages
	btn.classList.remove('hidden');
	const isHidden = isStatic ? hiddenStatics.has(key) : hiddenLocals.has(key);
	btn.textContent = isHidden ? 'Show' : 'Hide';
}

function updateStaticDeleteButton(pageName) {
	const btn = document.getElementById('delete-static-github');
	const openLink = document.getElementById('open-static-github');
	if (!btn) return;
	const isStatic = staticPages.some(sp => normalizePageName(sp.name) === normalizePageName(pageName));
	if (!isStatic) { btn.classList.add('hidden'); if (openLink) openLink.classList.add('hidden'); return; }
	btn.classList.remove('hidden');
	if (openLink) {
		// Try to build a direct URL if config exists
		const cfg = (function(){ try { return JSON.parse(sessionStorage.getItem(ghSessionKey) || '{}'); } catch(_) { return {}; } })();
		if (cfg.owner && cfg.repo) {
			const slug = normalizePageName(pageName);
			const pathPrefix = cfg.prefix ? cfg.prefix.replace(/^\/+|\/+$/g, '') + '/' : '';
			const filePath = `${pathPrefix}${slug}.md`;
			const url = `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/tree/${encodeURIComponent(cfg.branch || 'main')}/${filePath}`;
			openLink.href = url; openLink.classList.remove('hidden');
		} else { openLink.classList.add('hidden'); }
	}
}
