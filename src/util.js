/* ---------- small shared helpers (no dependencies) ---------- */
const U = (() => {
  const fmt = (v, dp) => BeamSolver.fmt(v, dp);

  /* clean tiny round-off relative to a scale, then format */
  const clean = (v, scale) => (Math.abs(v) <= 1e-9 * Math.max(1, scale || 1) ? 0 : v);
  const f2 = (v, scale) => fmt(clean(v, scale), 2);
  const f3 = (v, scale) => fmt(clean(v, scale), 3);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- maths typesetting in plain HTML ---- */
  const i = (s) => `<i class="mv">${s}</i>`;                  // math variable (italic serif)
  const sym = (a, b) => `${i(a)}<sub>${b}</sub>`;               // R_A
  const frac = (n, d) => `<span class="frac"><span>${n}</span><span>${d}</span></span>`;
  const sup = (s) => `<sup>${s}</sup>`;
  const X = i('x');
  const mac = (a, p, L) => {                                    // ⟨x − a⟩^p ; a = 0 shown as plain x
    if (Math.abs(a) < 1e-12) return p === 0 ? '1' : p === 1 ? X : X + sup(p);
    const inner = `⟨${X} − ${fmt(a, 3)}⟩`;
    return p === 1 ? `<span class="mb">${inner}</span>` : `<span class="mb">${inner}${sup(p)}</span>`;
  };
  const minus = '−';
  const signed = (v, first) => {                                // " + 5" / " − 5" / "−5" (first term)
    const s = fmt(Math.abs(v), 3);
    if (first) return v < 0 ? minus + s : s;
    return v < 0 ? ` ${minus} ${s}` : ` + ${s}`;
  };

  /* text width (px) for SVG label layout, cached */
  const _cv = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const _cache = new Map();
  const textW = (s, font) => {
    const k = font + '|' + s;
    if (_cache.has(k)) return _cache.get(k);
    let w = s.length * 6.4;
    if (_cv) { _cv.font = font; w = _cv.measureText(s).width; }
    _cache.set(k, w);
    return w;
  };

  const niceStep = (range, target) => {
    const raw = range / Math.max(1, target);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  };

  const snap = (x, g) => Math.round(x / g) * g;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = (() => { let n = 1; return () => 'e' + (n++) + Math.random().toString(36).slice(2, 5); })();

  return { fmt, clean, f2, f3, esc, i, sym, frac, sup, X, mac, signed, minus, textW, niceStep, snap, clamp, uid };
})();
