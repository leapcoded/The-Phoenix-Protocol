#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function normalizePageName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
}

const root = process.cwd();
const slugInput = process.argv[2];
if (!slugInput) {
  console.error('Usage: node scripts/remove-static-page.js <page-slug>');
  process.exit(1);
}
const slug = normalizePageName(slugInput);

const mdPath = path.join(root, `${slug}.md`);
if (!fs.existsSync(mdPath)) {
  console.error(`No markdown file found at ${mdPath}`);
} else {
  fs.unlinkSync(mdPath);
  console.log(`Deleted ${mdPath}`);
}

// Scrub links in other markdown files
const files = fs.readdirSync(root).filter(f => f.endsWith('.md'));
const linkRe = new RegExp(`#/page/${slug}`, 'g');
for (const f of files) {
  const p = path.join(root, f);
  const content = fs.readFileSync(p, 'utf8');
  const updated = content.replace(linkRe, '#');
  if (updated !== content) {
    fs.writeFileSync(p, updated, 'utf8');
    console.log(`Updated links in ${f}`);
  }
}

console.log('Static page removal complete.');
