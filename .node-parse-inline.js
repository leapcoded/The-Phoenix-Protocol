// Quick syntax parse of inline <script> in index.html using Node
// Usage: node .node-parse-inline.js
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
// Naively extract the first <script>...</script> block that contains our app code
const match = html.match(/<script>[\s\S]*?<\/script>/);
if (!match) {
  console.log('No <script> block found.');
  process.exit(0);
}
const js = match[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
try {
  // eslint-disable-next-line no-new-func
  new Function(js);
  console.log('Inline script parsed OK.');
} catch (e) {
  console.error('Inline script parse error:\n' + e.stack);
  // Try to identify approximate location by counting lines
  const msg = String(e.stack || e.message || '');
  const lineMatch = msg.match(/<anonymous>:(\d+):(\d+)/);
  if (lineMatch) {
    const line = Number(lineMatch[1]);
    const lines = js.split('\n');
    const start = Math.max(1, line - 3);
    const end = Math.min(lines.length, line + 3);
    console.error(`\nContext lines ${start}-${end}:`);
    for (let i = start; i <= end; i++) {
      console.error(String(i).padStart(4, ' '), lines[i-1]);
    }
  }
  process.exit(1);
}
