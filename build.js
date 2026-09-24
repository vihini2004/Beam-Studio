// Build: inline the fonts, CSS and JS from src/ into one self-contained index.html.
// Usage: npm install && npm run build
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const B64 = (p) => fs.readFileSync(path.join(__dirname, p)).toString('base64');

const F = 'node_modules/@fontsource';
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const GREEK = 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF';
const faces = [
  ['Barlow', 400, 'normal', `${F}/barlow/files/barlow-latin-400-normal.woff2`, LATIN],
  ['Barlow', 500, 'normal', `${F}/barlow/files/barlow-latin-500-normal.woff2`, LATIN],
  ['Barlow', 600, 'normal', `${F}/barlow/files/barlow-latin-600-normal.woff2`, LATIN],
  ['Barlow Semi Condensed', 600, 'normal', `${F}/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2`, LATIN],
  ['Barlow Semi Condensed', 700, 'normal', `${F}/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2`, LATIN],
  ['Source Serif 4', 400, 'normal', `${F}/source-serif-4/files/source-serif-4-latin-400-normal.woff2`, LATIN],
  ['Source Serif 4', 600, 'normal', `${F}/source-serif-4/files/source-serif-4-latin-600-normal.woff2`, LATIN],
  ['Source Serif 4', 400, 'italic', `${F}/source-serif-4/files/source-serif-4-latin-400-italic.woff2`, LATIN],
  ['Source Serif 4', 400, 'normal', `${F}/source-serif-4/files/source-serif-4-greek-400-normal.woff2`, GREEK],
  ['Source Serif 4', 400, 'italic', `${F}/source-serif-4/files/source-serif-4-greek-400-italic.woff2`, GREEK],
];
const fontCss = faces.map(([fam, w, st, file, range]) =>
  `@font-face{font-family:"${fam}";font-style:${st};font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${B64(file)}) format("woff2");unicode-range:${range};}`).join('\n');

const js = ['src/solver.js', 'src/util.js', 'src/draw.js', 'src/explain.js', 'src/app.js'].map(R).join('\n;\n');
let html = R('src/template.html');
html = html.replace('/*__FONTS__*/', () => fontCss).replace('/*__CSS__*/', () => R('src/styles.css')).replace('/*__JS__*/', () => js.replace(/<\/script>/gi, '<\\/script>'));
const out = path.join(__dirname, 'index.html');
fs.writeFileSync(out, html);
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
