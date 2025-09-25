# The Haven — Interactive Worldbuilding Encyclopedia

This repository contains the worldbuilding documents, relationship graphs, maps, systems flowcharts, and narrative scaffolding for *The Haven* — a sci‑fi horror novel set inside a crashed generational ark that became a stratified underground society.

## Features
* Hash‑based SPA encyclopedia (`index.html`) — no build step required
* Firebase Auth (Google) + Firestore (user‑scoped pages) + Storage for thumbnails/uploads
* Interactive full‑screen modules:
	* Relationships (graph canvas)
	* Maps (image + markers + pan/zoom)
	* Systems (hierarchy / flowchart with nodes + edges)
* Encyclopedia A–Z aggregation across core categories
* Inline rich(ish) content editor with internal link auto-formatting

## Directory Structure
```
index.html            # Entry point (served by GitHub Pages)
src/                  # Application logic (ES modules)
	main.js             # Router, UI composition, editor logic
	firebase.js         # Firebase wrapper (compat SDK)
	firebaseConfig.js   # (You provide) firebaseConfig export
	categories/         # Category + module definitions
		_base.js          # Shared form helpers
		maps.js           # Fullscreen Maps module
		relationships.js  # Fullscreen Relationships module
		systems.js        # Fullscreen Systems module
		systemUtil.js     # Systems data helpers
styles/               # CSS (Tailwind loaded via CDN separately)
assets/               # (Optional) static assets
.nojekyll             # Ensures GitHub Pages serves underscored files
```

## Running Locally
Just open `index.html` in a modern browser OR serve from a tiny static server to avoid any CORS quirks with module imports:

```bash
npx serve .
# or
python3 -m http.server 5173
```

Then visit: http://localhost:5173 (adjust port accordingly).

## Deploying to GitHub Pages
1. Commit and push `main` (or your chosen branch).
2. In repository settings → Pages → select branch (e.g. `main`) and root (`/`).
3. Ensure the `.nojekyll` file exists (already added) so `_base.js` and similar underscore files are not suppressed.
4. Your app will be available at: `https://<user>.github.io/<repo>/`.

### SPA Routing Note
All navigation uses hash fragments (`#/page/...`, `#/maps`, `#/systems`), so a 404 fallback is only needed for cosmetic direct loads of `index.html`. (Optional) Add a `404.html` duplicating the root HTML to be extra safe; a helper page is provided if you create it.

## Firebase Setup
Create `src/firebaseConfig.js` exporting your config:

```js
export const firebaseConfig = {
	apiKey: "...",
	authDomain: "...",
	projectId: "...",
	storageBucket: "...",
	messagingSenderId: "...",
	appId: "..."
};
```

Security rules (conceptual starting point – tighten as needed):
```js
// Firestore (rules)
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		match /users/{uid}/pages/{pageId} {
			allow read, write: if request.auth != null && request.auth.uid == uid;
		}
	}
}
// Storage (rules)
service firebase.storage {
	match /b/{bucket}/o {
		match /users/{uid}/{allPaths=**} {
			allow read, write: if request.auth != null && request.auth.uid == uid;
		}
	}
}
```

## Environment / CORS
The Firebase compat SDK is loaded via CDN — no bundler required. If you later move to the modular SDK + build tooling, introduce a bundler (Vite/ESBuild) and replace compat calls.

## Asset & Path Conventions
* All internal module imports are **relative** (e.g. `src/categories/...`).
* No leading `/` absolute paths — safe under GitHub Pages subpath.
* Tailwind is loaded via CDN (you can swap for self‑hosted if needed). 
* `_base.js` is why `.nojekyll` matters.

## Data Persistence Model
```
Firestore
└── users/{uid}/pages/{slug}  -> { meta, content }

Storage
└── users/{uid}/thumbnails/...  (and other upload groups)
```
Client caches last selected map/system state in `localStorage` for faster re-entry.

## Extending Modules
Add a new category:
1. Create `src/categories/<name>.js` and `register({...})` it (see existing examples).
2. Add the category name to `NAV_CATEGORIES` in `src/main.js`.
3. Optional: implement `renderExtras`, `applyExtrasToMeta`, and/or custom `renderView`.

## Building / Linting
Currently none — intentionally zero build. If you introduce tooling later:
* Add a `package.json` with dev dependencies.
* Replace CDN Tailwind with a compiled stylesheet for offline use.

## Contributing Guidelines
* Keep commits thematic (one feature/fix per commit).
* Describe schema changes in commit messages (`meta.system`, `meta.relationships`, etc.).
* Avoid committing secrets: never store firebaseConfig with production keys if repository is public.
* For large rewrites of interactive canvases, consider feature branches.

## Roadmap Ideas
* Edge labels & deletion UI in Systems
* Export/Import JSON for Maps & Systems
* Offline-first caching layer
* Graph layout auto-arranger
* Access control / shared editing

## License
Add license text if you intend public/open usage (currently unspecified).

---
Questions or improvements you want to make next? Open an issue or draft a discussion in the repo.
