/* ---------- application: state, rendering, interaction ---------- */
(() => {
  'use strict';
  const S = BeamSolver;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const { fmt, esc, snap, clamp, uid } = U;
  const n2 = (v) => fmt(v, 2);

  /* ================= presets ================= */
  const Pt = (x, P) => ({ type: 'point', x, P });
  const Wd = (a, b, w1, w2) => ({ type: 'dist', a, b, w1, w2: w2 == null ? w1 : w2 });
  const Cp = (x, C) => ({ type: 'moment', x, C });
  const Sp = (type, x) => ({ type, x });
  const PRESETS = {
    simplySupported: { L: 10, supports: [Sp('pinned', 0), Sp('roller', 10)], loads: [Pt(4, 20), Wd(6, 10, 5)] },
    cantilever: { L: 10, supports: [Sp('fixed', 0)], loads: [Pt(10, 15), Wd(0, 10, 4)] },
    fixed: { L: 10, supports: [Sp('fixed', 0), Sp('fixed', 10)], loads: [Pt(5, 30)] },
    overhanging: { L: 10, supports: [Sp('pinned', 2), Sp('roller', 8)], loads: [Pt(0, 10), Pt(10, 10), Pt(5, 25)] },
    continuous: { L: 10, supports: [Sp('pinned', 0), Sp('roller', 5), Sp('roller', 10)], loads: [Wd(0, 10, 10)] },
    propped: { L: 10, supports: [Sp('fixed', 0), Sp('roller', 10)], loads: [Wd(0, 10, 10)] },
    gerber: { L: 10, supports: [Sp('fixed', 0), Sp('roller', 10)], hinges: [{ x: 4 }], loads: [Wd(0, 10, 6)] },
    triangle: { L: 10, supports: [Sp('pinned', 0), Sp('roller', 10)], loads: [Wd(0, 10, 0, 12)] },
    couple: { L: 10, supports: [Sp('pinned', 0), Sp('roller', 10)], loads: [Cp(4, 20)] },
  };
  const STD = {
    ssP: { L: 8, supports: [Sp('pinned', 0), Sp('roller', 8)], loads: [Pt(4, 20)] },
    ssW: { L: 8, supports: [Sp('pinned', 0), Sp('roller', 8)], loads: [Wd(0, 8, 10)] },
    ssT: { L: 9, supports: [Sp('pinned', 0), Sp('roller', 9)], loads: [Wd(0, 9, 0, 12)] },
    cP: { L: 4, supports: [Sp('fixed', 0)], loads: [Pt(4, 10)] },
    cW: { L: 4, supports: [Sp('fixed', 0)], loads: [Wd(0, 4, 5)] },
    ffP: { L: 8, supports: [Sp('fixed', 0), Sp('fixed', 8)], loads: [Pt(4, 40)] },
    ffW: { L: 6, supports: [Sp('fixed', 0), Sp('fixed', 6)], loads: [Wd(0, 6, 12)] },
    pcW: { L: 8, supports: [Sp('fixed', 0), Sp('roller', 8)], loads: [Wd(0, 8, 10)] },
  };
  const TYPE_NAME = { pinned: 'Pinned', roller: 'Roller', simple: 'Simple', fixed: 'Fixed' };

  /* ================= state ================= */
  const state = {
    beam: null, selected: null, snap: 0.5,
    view: { shape: true, slope: false, perEI: false, tension: false },
    hoverX: null, cut: null, step: null, playing: false, tab: 'solution',
    practice: { on: false, revealed: false, answers: {}, results: null, indet: false },
  };
  let res = null, stepsList = [], solDirty = true, lastGeom = null, dragGuideX = null;
  const plotInfo = {};

  function withIds(p, keep) {
    return {
      L: p.L, E: keep ? keep.E : 200, I: keep ? keep.I : 100,
      supports: p.supports.map((s) => ({ id: uid(), type: s.type, x: s.x })),
      hinges: (p.hinges || []).map((h) => ({ id: uid(), x: h.x })),
      loads: p.loads.map((l) => {
        const o = { id: uid(), ...l };
        if (l.type === 'dist') { o.uniform = Math.abs(l.w1 - l.w2) < 1e-12; o.dir = l.w1 + l.w2 < 0 ? -1 : 1; }
        if (l.type === 'point') o.dir = l.P < 0 ? -1 : 1;
        if (l.type === 'moment') o.dir = l.C < 0 ? -1 : 1;
        return o;
      }),
    };
  }
  function findEl(id) {
    if (!id || !state.beam) return null;
    for (const s of state.beam.supports) if (s.id === id) return { kind: 'support', el: s };
    for (const h of state.beam.hinges) if (h.id === id) return { kind: 'hinge', el: h };
    for (const l of state.beam.loads) if (l.id === id) return { kind: 'load', el: l };
    return null;
  }
  const practiceHidden = () => state.practice.on && !state.practice.revealed;

  /* ================= undo / redo ================= */
  const undoStack = [], redoStack = [];
  const snapModel = () => JSON.stringify(state.beam);
  function pushUndo(prev) {
    undoStack.push(prev || snapModel());
    if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    updateUndoBtns();
  }
  function updateUndoBtns() { $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length; }
  function restore(json) {
    state.beam = JSON.parse(json);
    if (state.selected && !findEl(state.selected)) state.selected = null;
    markPreset(null);
    syncBeamInputs(); buildEditor(); update();
  }
  function doUndo() { if (!undoStack.length) return; redoStack.push(snapModel()); restore(undoStack.pop()); updateUndoBtns(); toast('Undone'); }
  function doRedo() { if (!redoStack.length) return; undoStack.push(snapModel()); restore(redoStack.pop()); updateUndoBtns(); toast('Redone'); }

  /* ================= geometry ================= */
  function geom() {
    const W = Math.max(300, Math.floor($('#diagrams').clientWidth));
    const narrow = W < 560;
    const padL = narrow ? 44 : 64, padR = narrow ? 18 : 34;
    const L = state.beam.L;
    const pw = W - padL - padR;
    return { W, L, padL, padR, pw, narrow, X: (x) => padL + (x / L) * pw, inv: (px) => ((px - padL) / pw) * L };
  }

  /* ================= main update ================= */
  function update() {
    res = S.solve(state.beam);
    solDirty = true;
    if (state.step != null) {
      if (!res.ok) exitSteps(true);
      else { stepsList = Explain.steps(res); state.step = Math.min(state.step, stepsList.length - 1); }
    }
    if (state.cut != null && state.cut > state.beam.L) state.cut = state.beam.L;
    state.practice.results = null;
    $('#eiOut').textContent = (state.beam.E * state.beam.I).toLocaleString('en-US', { maximumFractionDigits: 2 });
    renderStatus();
    renderDiagrams();
    renderList();
    syncEditorValues();
    renderStepper();
    renderSection();
    renderPractice();
    if (state.tab === 'solution') renderSolution();
    scheduleHash();
  }

  /* ================= status strip ================= */
  function renderStatus() {
    const cls = res.cls;
    const hide = practiceHidden();
    const el = $('#status');
    const counts = `r = ${cls.r}${cls.c ? `, c = ${cls.c}` : ''}`;
    let detail = cls.detail;
    if (!res.ok && res.errors && res.errors.length) detail = res.errors.join(' ');
    const det = `<div class="det ${res.errors && res.errors.length ? 'unstable' : cls.status}"><div class="det-t"><span class="dot"></span><span>${esc(res.errors && res.errors.length ? 'Check the set-up' : cls.title)}</span><span class="rc">${counts}</span></div><p class="det-d">${esc(detail)}</p></div>`;
    let kv = '';
    if (res.ok) {
      const Vs = res.scales.V, Ms = res.scales.M;
      const rx = res.supports.map((s) => {
        if (hide) return `${s.label}: ?`;
        const R = U.clean(s.R, Vs);
        let t = `R<sub>${s.label}</sub> ${n2(Math.abs(R))}${Math.abs(R) > 0 ? (R > 0 ? '↑' : '↓') : ''}`;
        if (s.type === 'fixed') { const M = U.clean(s.M, Ms); t += `, M<sub>${s.label}</sub> ${n2(Math.abs(M))}${Math.abs(M) > 0 ? (M > 0 ? '↻' : '↺') : ''}`; }
        return `<span style="white-space:nowrap">${t}</span>`;
      }).join('&ensp; ');
      const ex = res.extremes;
      const mmx = U.clean(ex.Mmax.v, Ms), mmn = U.clean(ex.Mmin.v, Ms);
      const big = Math.abs(mmx) >= Math.abs(mmn) ? { v: mmx, x: ex.Mmax.x, w: 'sagging' } : { v: mmn, x: ex.Mmin.x, w: 'hogging' };
      const other = big.w === 'sagging' ? (mmn < 0 ? `hogging ${n2(mmn)} at ${n2(ex.Mmin.x)} m` : 'no hogging') : (mmx > 0 ? `sagging ${n2(mmx)} at ${n2(ex.Mmax.x)} m` : 'no sagging');
      const ylo = ex.Ymin, yhi = ex.Ymax;
      const yb = Math.abs(ylo.v) >= Math.abs(yhi.v) ? ylo : yhi;
      const yv = U.clean(yb.v, res.scales.Y);
      const yTxt = state.view.perEI ? `${n2(Math.abs(yv))}/EI ${yv < 0 ? 'down' : yv > 0 ? 'up' : ''}` : `${n2(Math.abs(yv / res.EI * 1000))} mm ${yv < 0 ? 'down' : yv > 0 ? 'up' : ''}`;
      kv = `<dl class="kv">
        <div><dt>Reactions (kN, kN·m)</dt><dd><span class="rx-list">${rx || '—'}</span></dd></div>
        <div><dt>Largest bending moment</dt><dd>${hide ? '?' : `${n2(big.v)} kN·m<small>${Math.abs(big.v) > 0 ? `${big.w} at x = ${n2(big.x)} m; ${other}` : 'no bending'}</small>`}</dd></div>
        <div><dt>Largest deflection</dt><dd>${hide ? '?' : `${yTxt}<small>${Math.abs(yv) > 0 ? `at x = ${n2(yb.x)} m; EI = ${fmt(res.EI, 0)} kN·m²` : 'the beam does not bend'}</small>`}</dd></div>
      </dl>`;
    } else {
      kv = `<dl class="kv"><div style="grid-column:1/-1"><dt>No results</dt><dd><small>${res.errors && res.errors.length ? 'Fix the set-up above to see the diagrams.' : 'An unstable beam has no equilibrium position, so there are no reactions or diagrams to show. Add or change supports.'}</small></dd></div></dl>`;
    }
    el.innerHTML = det + kv;
  }

  /* ================= diagrams ================= */
  function renderDiagrams() {
    const g = geom(); lastGeom = g;
    const hide = practiceHidden();
    const st = state.step != null ? stepsList[state.step] : null;
    const HL = g.narrow ? 214 : 232;
    const svgL = $('#svgLoad');
    svgL.setAttribute('viewBox', `0 0 ${g.W} ${HL}`); svgL.setAttribute('height', HL);
    svgL.innerHTML = Draw.loading(state.beam, res, g, {
      height: HL, beamTop: g.narrow ? 94 : 100, selected: state.selected, showReactions: res.ok, hideValues: hide,
      showShape: state.view.shape, guideX: dragGuideX, cutX: null, focus: st ? st.focus : null,
    }) + '<g class="xh"></g>';
    plotInfo.load = { H: HL };
    $('#loadNote').innerHTML = state.view.shape && res.ok && !hide ? '<span style="color:var(--q-y)">- - -</span> deflected shape, exaggerated' : '';
    $('#bmdNote').innerHTML = state.view.tension ? 'drawn on the tension side (sagging plotted down)' : 'slope of the BMD = <i class="mv">V</i>; sagging +';
    $('#capT').innerHTML = state.view.perEI ? 'Slope × <i class="mv">EI</i> (kN·m²)' : 'Slope <i class="mv">θ</i> (×10⁻³ rad)';
    $('#capY').innerHTML = state.view.perEI ? 'Deflection × <i class="mv">EI</i> (kN·m³)' : 'Deflection <i class="mv">y</i> (mm)';

    for (const k of ['V', 'M', 'T', 'Y']) {
      const panel = $(`.panel[data-kind="${k}"]`);
      if (k === 'T') panel.hidden = !state.view.slope;
      if (panel.hidden) { plotInfo[k] = null; continue; }
      const svg = $('#svg' + k);
      const H = k === 'T' ? 140 : g.narrow ? 150 : 172;
      svg.setAttribute('viewBox', `0 0 ${g.W} ${H}`); svg.setAttribute('height', H);
      if (!res.ok) {
        svg.innerHTML = `<rect x="${g.padL}" y="10" width="${g.pw}" height="${H - 20}" rx="6" fill="var(--sheet-2)"/><text class="hidden-note" x="${g.W / 2}" y="${H / 2 + 4}" text-anchor="middle">${res.errors && res.errors.length ? 'Fix the set-up to see this diagram' : 'Unstable beam: no diagram'}</text>`;
        plotInfo[k] = null; continue;
      }
      const d = Draw.diagram(k, res, g, { height: H, perEI: state.view.perEI, tension: state.view.tension, hideValues: hide, revealX: st ? st.reveal : null, focus: st ? st.focus : null });
      svg.innerHTML = d.svg + '<g class="xh"></g>';
      plotInfo[k] = { ...d, H };
    }
    drawCrosshair();
  }

  function valueAt(k, x, side) {
    if (k === 'V') return res.V(x, side);
    if (k === 'M') return res.M(x, side);
    if (k === 'T') return state.view.perEI ? res.EIt(x, side) : res.theta(x, side) * 1000;
    return state.view.perEI ? res.EIy(x) : res.y(x) * 1000;
  }

  function drawCrosshair() {
    const g = lastGeom; if (!g || !state.beam) return;
    const hide = practiceHidden();
    const hx = state.hoverX, cx = state.cut;
    const ids = { load: '#svgLoad', V: '#svgV', M: '#svgM', T: '#svgT', Y: '#svgY' };
    for (const [k, sel] of Object.entries(ids)) {
      const svg = $(sel); const xh = svg && svg.querySelector('.xh');
      if (!xh) continue;
      const info = plotInfo[k];
      if (!info || (k !== 'load' && (!res.ok))) { xh.innerHTML = ''; continue; }
      let s = '';
      const H = info.H;
      const line = (x, cls) => `<line class="${cls}" x1="${g.X(x).toFixed(1)}" y1="2" x2="${g.X(x).toFixed(1)}" y2="${H - 2}"/>`;
      if (cx != null && res.ok) s += line(cx, 'pinned');
      if (hx != null) s += line(hx, '');
      if (k !== 'load' && !hide && info.Y && !info.tiny) {
        const x = hx != null ? hx : cx;
        if (x != null) s += `<circle class="q-${k.toLowerCase()}" cx="${g.X(x).toFixed(1)}" cy="${info.Y(valueAt(k, x, 'R')).toFixed(1)}" r="4.5"/>`;
      }
      xh.innerHTML = s;
    }
    renderReadout();
  }

  function renderReadout() {
    const el = $('#readout');
    if (!res || !res.ok) { el.innerHTML = `<span class="hint">${res && res.errors && res.errors.length ? esc(res.errors[0]) : 'The beam is unstable, so there is nothing to read.'}</span>`; return; }
    const x = state.hoverX != null ? state.hoverX : state.cut;
    if (x == null) {
      el.innerHTML = `<span class="hint">Point at (or tap) any diagram to read the values there. Click to cut the beam at that point and see the free body.</span>`;
      return;
    }
    const hide = practiceHidden();
    const g = lastGeom;
    const near = res.events.find((e) => Math.abs(g.X(e.x) - g.X(x)) < 4);
    const two = (k, a, b, unit, dp) => {
      if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))) return `<b>${fmt(U.clean(a, 1e3), dp)}</b> | <b>${fmt(U.clean(b, 1e3), dp)}</b> ${unit}`;
      return `<b>${fmt(U.clean(b, 1e3), dp)}</b> ${unit}`;
    };
    const vx = near ? near.x : x;
    const parts = [`<span class="rx-x">x = ${n2(vx)} m</span>`];
    if (!hide) {
      const vL = near ? (near.x <= 1e-9 ? 0 : res.V(vx, 'L')) : res.V(x), vR = near ? (near.x >= res.L - 1e-9 ? 0 : res.V(vx, 'R')) : res.V(x);
      const mL = near ? (near.x <= 1e-9 ? 0 : res.M(vx, 'L')) : res.M(x), mR = near ? (near.x >= res.L - 1e-9 ? 0 : res.M(vx, 'R')) : res.M(x);
      parts.push(`<span class="rv"><span class="key q-v"></span><i class="mv">V</i> = ${two('V', vL, vR, 'kN', 2)}</span>`);
      parts.push(`<span class="rv"><span class="key q-m"></span><i class="mv">M</i> = ${two('M', mL, mR, 'kN·m', 2)}</span>`);
      if (state.view.slope) {
        const tL = valueAt('T', vx, 'L'), tR = valueAt('T', vx, 'R');
        parts.push(`<span class="rv"><span class="key q-t"></span><i class="mv">θ</i> = ${two('T', tL, tR, state.view.perEI ? '/EI' : '×10⁻³ rad', 3)}</span>`);
      }
      const yv = valueAt('Y', vx);
      parts.push(`<span class="rv"><span class="key q-y"></span><i class="mv">y</i> = <b>${fmt(U.clean(yv, 1e3), state.view.perEI ? 2 : 3)}</b> ${state.view.perEI ? '/EI' : 'mm'}</span>`);
    } else parts.push(`<span class="hint">values hidden while you practise</span>`);
    if (state.cut != null && state.hoverX == null) parts.push(`<span class="pin">cut at x = ${n2(state.cut)} m (free body below the diagrams)</span>`);
    el.innerHTML = parts.join('');
  }

  /* ================= pointer interaction on the diagrams ================= */
  let drag = null, cutDrag = false, rafPending = false;
  function modelX(evt, svg) {
    const r = svg.getBoundingClientRect();
    const px = (evt.clientX - r.left) * (lastGeom.W / r.width);
    return clamp(lastGeom.inv(px), 0, state.beam.L);
  }
  function onPlotDown(evt) {
    const svg = evt.target.closest('svg.plot'); if (!svg || !state.beam) return;
    if (evt.button != null && evt.button > 0) return;
    const x = modelX(evt, svg);
    if (svg.id === 'svgLoad') {
      const elG = evt.target.closest('.el');
      if (elG) {
        const id = elG.dataset.id;
        if (state.selected !== id) { state.selected = id; buildEditor(); }
        const f = findEl(id);
        drag = { id, handle: evt.target.dataset.handle || null, x0: x, orig: JSON.parse(JSON.stringify(f.el)), prev: snapModel(), moved: false, pointerId: evt.pointerId };
        state.hoverX = null; // the snap guide shows the position while dragging
        try { svg.setPointerCapture(evt.pointerId); } catch (e) { /* ignore */ }
        renderDiagrams(); renderList();
        evt.preventDefault();
      } else if (state.selected) { state.selected = null; buildEditor(); renderDiagrams(); renderList(); }
      return;
    }
    if (!res.ok) return;
    state.cut = snap(x, 0.01);
    cutDrag = true;
    try { svg.setPointerCapture(evt.pointerId); } catch (e) { /* ignore */ }
    renderSection(); drawCrosshair();
  }
  function onPlotMove(evt) {
    const svg = evt.target.closest ? evt.target.closest('svg.plot') : null;
    if (drag) {
      const s = $('#svgLoad');
      const x = modelX(evt, s);
      const f = findEl(drag.id); if (!f) return;
      const el = f.el, o = drag.orig, L = state.beam.L, g = state.snap, dx = x - drag.x0;
      if (Math.abs(dx) > 1e-9) drag.moved = true;
      if (el.type === 'dist') {
        if (drag.handle === 'a') { el.a = clamp(snap(o.a + dx, g), 0, o.b - g); dragGuideX = el.a; }
        else if (drag.handle === 'b') { el.b = clamp(snap(o.b + dx, g), o.a + g, L); dragGuideX = el.b; }
        else { const len = o.b - o.a; el.a = clamp(snap(o.a + dx, g), 0, Math.max(0, L - len)); el.b = el.a + len; dragGuideX = el.a; }
      } else if (f.kind === 'hinge') { el.x = clamp(snap(o.x + dx, g), Math.min(g, L / 2), Math.max(L - g, L / 2)); dragGuideX = el.x; }
      else { el.x = clamp(snap(o.x + dx, g), 0, L); dragGuideX = el.x; }
      schedule(() => { update(); });
      return;
    }
    if (cutDrag) {
      const s = svg || $('#svgV');
      state.cut = snap(modelX(evt, s), 0.01);
      schedule(() => { renderSection(); drawCrosshair(); });
      return;
    }
    if (!svg) return;
    state.hoverX = modelX(evt, svg);
    schedule(drawCrosshair);
  }
  function onPlotUp() {
    if (drag) {
      if (drag.moved && drag.prev !== snapModel()) pushUndo(drag.prev);
      drag = null; dragGuideX = null; update();
    }
    cutDrag = false;
  }
  function schedule(fn) {
    if (rafPending) { schedule.fn = fn; return; }
    rafPending = true; schedule.fn = fn;
    requestAnimationFrame(() => { rafPending = false; const f = schedule.fn; schedule.fn = null; if (f) f(); });
  }

  /* keyboard on the loading diagram */
  function onLoadKey(e) {
    const f = findEl(state.selected);
    if (e.key === 'Escape') { state.selected = null; buildEditor(); renderDiagrams(); renderList(); return; }
    if (!f) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.shiftKey ? 1 : state.snap) * (e.key === 'ArrowLeft' ? -1 : 1);
      pushUndo();
      const el = f.el, L = state.beam.L;
      if (el.type === 'dist') { const len = el.b - el.a; el.a = clamp(el.a + step, 0, L - len); el.b = el.a + len; }
      else el.x = clamp(el.x + step, 0, L);
      update();
    }
  }

  /* ================= palette ================= */
  let palDrag = null, suppressClick = false;
  function setupPalette() {
    $$('.tile').forEach((t) => {
      const gk = t.querySelector('.g').dataset.glyph;
      t.querySelector('.g').innerHTML = Draw.glyph(gk);
      t.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button > 0) return;
        palDrag = { add: t.dataset.add, sx: e.clientX, sy: e.clientY, active: false, glyph: gk };
      });
      t.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } addItem(t.dataset.add, null); });
    });
    window.addEventListener('pointermove', (e) => {
      if (!palDrag) return;
      if (!palDrag.active && Math.hypot(e.clientX - palDrag.sx, e.clientY - palDrag.sy) > 6) {
        palDrag.active = true;
        const gh = $('#ghost'); gh.innerHTML = Draw.glyph(palDrag.glyph); gh.style.display = 'block';
      }
      if (palDrag.active) {
        const gh = $('#ghost');
        gh.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 24}px)`;
        const s = $('#svgLoad'), r = s.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 20 && e.clientY <= r.bottom;
        const nx = over ? clamp(snap(modelX(e, s), state.snap), 0, state.beam.L) : null;
        if (nx !== dragGuideX) { dragGuideX = nx; schedule(renderDiagrams); }
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!palDrag) return;
      const pd = palDrag; palDrag = null;
      if (!pd.active) return;
      $('#ghost').style.display = 'none';
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 50);
      const s = $('#svgLoad'), r = s.getBoundingClientRect();
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 20 && e.clientY <= r.bottom;
      dragGuideX = null;
      if (over) addItem(pd.add, clamp(snap(modelX(e, s), state.snap), 0, state.beam.L));
      else renderDiagrams();
    });
    window.addEventListener('pointercancel', () => { if (palDrag) { palDrag = null; $('#ghost').style.display = 'none'; dragGuideX = null; renderDiagrams(); } });
  }

  function occupied(x) {
    const b = state.beam;
    return b.supports.some((s) => Math.abs(s.x - x) < 1e-9) || b.hinges.some((h) => Math.abs(h.x - x) < 1e-9) ||
      b.loads.some((l) => (l.type !== 'dist') && Math.abs(l.x - x) < 1e-9);
  }
  function freeNear(x0, lo, hi) {
    const g = state.snap;
    const start = clamp(snap(x0, g), lo, hi);
    for (let k = 0; k < 400; k++) {
      for (const s of [1, -1]) {
        const x = start + s * k * g;
        if (x >= lo - 1e-9 && x <= hi + 1e-9 && !occupied(x)) return Math.round(x * 1e6) / 1e6;
      }
    }
    return start;
  }
  function addItem(spec, xDrop) {
    pushUndo();
    const b = state.beam, L = b.L, g = state.snap;
    const [cat, type] = spec.split(':');
    let el;
    if (cat === 'support') {
      let x = xDrop;
      if (x == null) x = !b.supports.some((s) => s.x < 1e-9) ? 0 : !b.supports.some((s) => s.x > L - 1e-9) ? L : freeNear(L / 2, 0, L);
      el = { id: uid(), type, x };
      b.supports.push(el);
    } else if (cat === 'hinge') {
      const x = clamp(xDrop != null ? xDrop : freeNear(L / 2, g, L - g), Math.min(g, L / 2), Math.max(L - g, L / 2));
      el = { id: uid(), x };
      b.hinges.push(el);
    } else if (type === 'point') {
      el = { id: uid(), type: 'point', x: xDrop != null ? xDrop : freeNear(L / 2, 0, L), P: 10, dir: 1 };
      b.loads.push(el);
    } else if (type === 'moment') {
      el = { id: uid(), type: 'moment', x: xDrop != null ? xDrop : freeNear(L / 2, 0, L), C: 20, dir: 1 };
      b.loads.push(el);
    } else if (type === 'udl' || type === 'uvl') {
      const len = Math.max(g, snap(type === 'udl' ? L / 4 : L / 3, g));
      let a = xDrop != null ? xDrop : snap(type === 'udl' ? (L - len) / 2 : L - len, g);
      a = clamp(a, 0, Math.max(0, L - len));
      el = type === 'udl' ? { id: uid(), type: 'dist', a, b: a + len, w1: 5, w2: 5, uniform: true, dir: 1 } : { id: uid(), type: 'dist', a, b: a + len, w1: 0, w2: 10, uniform: false, dir: 1 };
      b.loads.push(el);
    }
    state.selected = el.id;
    markPreset(null);
    buildEditor(); update();
  }
  function deleteSelected() {
    const f = findEl(state.selected); if (!f) return;
    pushUndo();
    const b = state.beam;
    b.supports = b.supports.filter((s) => s.id !== f.el.id);
    b.hinges = b.hinges.filter((h) => h.id !== f.el.id);
    b.loads = b.loads.filter((l) => l.id !== f.el.id);
    state.selected = null; markPreset(null);
    buildEditor(); update();
    toast('Removed. Press Undo to bring it back');
  }

  /* ================= editor ================= */
  let editSnapshot = null;
  function supportLabel(id) { const s = res && res.supports ? res.supports.find((q) => q.id === id) : null; return s ? s.label : ''; }
  function fieldHtml(key, label, value, unit, opts) {
    const o = opts || {};
    return `<label class="fld${o.full ? ' full' : ''}"><span>${label}</span><span class="inp"><input data-f="${key}" type="number" inputmode="decimal" step="${o.step || 'any'}" ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''} value="${value}" ${o.disabled ? 'disabled' : ''}><em>${unit}</em></span></label>`;
  }
  const segHtml = (name, items, cur, label) => `<div class="full"><div class="seg" role="group" aria-label="${label}">${items.map(([v, t]) => `<button type="button" data-${name}="${v}" aria-pressed="${String(cur === v)}">${t}</button>`).join('')}</div></div>`;
  const v3 = (v) => String(Math.round(v * 1000) / 1000);

  function buildEditor() {
    const f = findEl(state.selected);
    const body = $('#edBody'), empty = $('#edEmpty'), card = $('#editorCard');
    if (!f) { body.hidden = true; empty.hidden = false; card.classList.remove('floating'); body.innerHTML = ''; return; }
    empty.hidden = true; body.hidden = false; card.classList.add('floating');
    const el = f.el, L = state.beam.L, g = state.snap;
    let title = '', glyph = '', fields = '', hint = 'Drag it along the beam, or type exact values here.';
    if (f.kind === 'support') {
      glyph = el.type; title = `Support ${supportLabel(el.id)}`;
      fields = segHtml('type', [['pinned', 'Pinned'], ['roller', 'Roller'], ['simple', 'Simple'], ['fixed', 'Fixed']], el.type, 'Support type') +
        fieldHtml('x', 'Position <i class="mv">x</i>', v3(el.x), 'm', { full: true, step: g, min: 0, max: L });
    } else if (f.kind === 'hinge') {
      glyph = 'hinge'; title = 'Internal hinge';
      fields = fieldHtml('x', 'Position <i class="mv">x</i>', v3(el.x), 'm', { full: true, step: g, min: 0, max: L });
      hint = 'A hinge carries no moment, so M = 0 there.';
    } else if (el.type === 'point') {
      glyph = 'point'; title = 'Point load';
      fields = segHtml('dir', [['1', 'Downward ↓'], ['-1', 'Upward ↑']], String(el.P < 0 ? -1 : 1), 'Direction') +
        fieldHtml('x', 'Position <i class="mv">x</i>', v3(el.x), 'm', { step: g, min: 0, max: L }) +
        fieldHtml('P', 'Magnitude <i class="mv">P</i>', v3(Math.abs(el.P)), 'kN', { step: 1, min: 0 });
    } else if (el.type === 'moment') {
      glyph = 'moment'; title = 'Couple (applied moment)';
      fields = segHtml('dir', [['1', 'Clockwise ↻'], ['-1', 'Anticlockwise ↺']], String(el.C < 0 ? -1 : 1), 'Direction') +
        fieldHtml('x', 'Position <i class="mv">x</i>', v3(el.x), 'm', { step: g, min: 0, max: L }) +
        fieldHtml('C', 'Magnitude <i class="mv">C</i>', v3(Math.abs(el.C)), 'kN·m', { step: 1, min: 0 });
    } else {
      glyph = el.uniform ? 'udl' : 'uvl'; title = el.uniform ? 'Uniformly distributed load' : 'Varying load (UVL)';
      fields = segHtml('dir', [['1', 'Downward ↓'], ['-1', 'Upward ↑']], String(el.w1 + el.w2 < 0 ? -1 : 1), 'Direction') +
        fieldHtml('a', 'Starts at', v3(el.a), 'm', { step: g, min: 0, max: L }) +
        fieldHtml('b', 'Ends at', v3(el.b), 'm', { step: g, min: 0, max: L }) +
        fieldHtml('w1', el.uniform ? 'Intensity <i class="mv">w</i>' : 'Intensity at start', v3(Math.abs(el.w1)), 'kN/m', { step: 1, min: 0 }) +
        fieldHtml('w2', 'Intensity at end', v3(Math.abs(el.w2)), 'kN/m', { step: 1, min: 0, disabled: el.uniform }) +
        `<label class="chk full"><input type="checkbox" data-uniform ${el.uniform ? 'checked' : ''}> Uniform (same intensity at both ends)</label>`;
      hint = 'Drag the body to move it, or the square handles to change where it starts and ends.';
    }
    body.innerHTML = `<div class="ed-head"><h2>${Draw.glyph(glyph)}<span>${title}</span></h2><button type="button" class="btn small" data-act="done">Done</button></div>
      <div class="ed-fields">${fields}</div>
      <div class="ed-foot"><span class="hint">${hint}</span><button type="button" class="btn small danger" data-act="del">Remove</button></div>`;

    $$('input[data-f]', body).forEach((inp) => {
      inp.addEventListener('focus', () => { editSnapshot = snapModel(); });
      inp.addEventListener('input', () => applyField(inp, false));
      inp.addEventListener('change', () => { applyField(inp, true); commitEdit(); });
      inp.addEventListener('blur', commitEdit);
    });
    $$('[data-type]', body).forEach((b) => b.addEventListener('click', () => { pushUndo(); el.type = b.dataset.type; markPreset(null); buildEditor(); update(); }));
    $$('[data-dir]', body).forEach((b) => b.addEventListener('click', () => {
      pushUndo();
      const d = Number(b.dataset.dir);
      if (el.type === 'point') el.P = d * Math.abs(el.P);
      else if (el.type === 'moment') el.C = d * Math.abs(el.C);
      else { el.w1 = d * Math.abs(el.w1); el.w2 = d * Math.abs(el.w2); }
      el.dir = d; markPreset(null); buildEditor(); update();
    }));
    const uni = $('[data-uniform]', body);
    if (uni) uni.addEventListener('change', () => { pushUndo(); el.uniform = uni.checked; if (el.uniform) el.w2 = el.w1; markPreset(null); buildEditor(); update(); });
    $('[data-act="del"]', body).addEventListener('click', deleteSelected);
    $('[data-act="done"]', body).addEventListener('click', () => { state.selected = null; buildEditor(); renderDiagrams(); renderList(); });
  }
  function commitEdit() { if (editSnapshot && editSnapshot !== snapModel()) { pushUndo(editSnapshot); markPreset(null); } editSnapshot = null; }
  function applyField(inp, final) {
    const v = parseFloat(inp.value);
    if (!Number.isFinite(v)) return;
    const f = findEl(state.selected); if (!f) return;
    const el = f.el, L = state.beam.L;
    const dir = (el.type === 'point' ? el.P : el.type === 'moment' ? el.C : el.type === 'dist' ? el.w1 + el.w2 : 1) < 0 ? -1 : (el.dir || 1);
    switch (inp.dataset.f) {
      case 'x': el.x = f.kind === 'hinge' ? clamp(v, 1e-3 * L, L - 1e-3 * L) : clamp(v, 0, L); break;
      case 'P': el.P = dir * Math.abs(v); break;
      case 'C': el.C = dir * Math.abs(v); break;
      case 'a': el.a = clamp(v, 0, L); if (final && el.a >= el.b) el.b = Math.min(L, el.a + state.snap); break;
      case 'b': el.b = clamp(v, 0, L); if (final && el.b <= el.a) el.a = Math.max(0, el.b - state.snap); break;
      case 'w1': el.w1 = dir * Math.abs(v); if (el.uniform) el.w2 = el.w1; break;
      case 'w2': el.w2 = dir * Math.abs(v); break;
      default: break;
    }
    if (final) syncEditorValues(true);
    update();
  }
  function syncEditorValues(force) {
    const f = findEl(state.selected); if (!f) return;
    const el = f.el;
    $$('#edBody input[data-f]').forEach((inp) => {
      if (!force && document.activeElement === inp) return;
      const k = inp.dataset.f;
      const val = k === 'x' ? el.x : k === 'P' ? Math.abs(el.P) : k === 'C' ? Math.abs(el.C) : k === 'a' ? el.a : k === 'b' ? el.b : k === 'w1' ? Math.abs(el.w1) : Math.abs(el.w2);
      inp.value = v3(val);
      if (k === 'x' || k === 'a' || k === 'b') inp.max = String(state.beam.L);
    });
    const h = $('#edBody .ed-head h2 span');
    if (h && f.kind === 'support') h.textContent = `Support ${supportLabel(f.el.id)}`;
  }

  /* ================= element list ================= */
  function renderList() {
    const b = state.beam;
    const items = [];
    b.supports.slice().sort((p, q) => p.x - q.x).forEach((s) => items.push({ id: s.id, glyph: s.type, text: `Support ${supportLabel(s.id)} (${TYPE_NAME[s.type].toLowerCase()})`, pos: `x = ${n2(s.x)}` }));
    b.hinges.slice().sort((p, q) => p.x - q.x).forEach((h, k) => items.push({ id: h.id, glyph: 'hinge', text: `Hinge H${k + 1}`, pos: `x = ${n2(h.x)}` }));
    b.loads.slice().sort((p, q) => (p.x != null ? p.x : p.a) - (q.x != null ? q.x : q.a)).forEach((l) => {
      if (l.type === 'point') items.push({ id: l.id, glyph: 'point', text: `${n2(Math.abs(l.P))} kN ${l.P < 0 ? '↑' : '↓'}`, pos: `x = ${n2(l.x)}` });
      else if (l.type === 'moment') items.push({ id: l.id, glyph: 'moment', text: `${n2(Math.abs(l.C))} kN·m ${l.C < 0 ? '↺' : '↻'}`, pos: `x = ${n2(l.x)}` });
      else items.push({ id: l.id, glyph: l.uniform ? 'udl' : 'uvl', text: l.uniform ? `UDL ${n2(Math.abs(l.w1))} kN/m${l.w1 < 0 ? ' ↑' : ''}` : `UVL ${n2(Math.abs(l.w1))} → ${n2(Math.abs(l.w2))} kN/m${l.w1 + l.w2 < 0 ? ' ↑' : ''}`, pos: `${n2(l.a)}–${n2(l.b)}` });
    });
    const el = $('#elList');
    if (!items.length) { el.innerHTML = `<li class="el-empty">Nothing yet. Add a support and a load from the palette.</li>`; return; }
    el.innerHTML = items.map((it) => `<li><button type="button" data-id="${it.id}" aria-current="${String(state.selected === it.id)}">${Draw.glyph(it.glyph)}<span>${esc(it.text)}</span><span class="el-x">${it.pos} m</span></button></li>`).join('');
  }

  /* ================= step-by-step ================= */
  let playTimer = null;
  function enterSteps() {
    if (!res.ok) { toast('Build a stable beam first'); return; }
    if (practiceHidden()) { toast('Check your answers first, or choose Show solution'); return; }
    stepsList = Explain.steps(res); state.step = 0; state.cut = null;
    $('#stepBtn').textContent = 'Show all diagrams';
    renderStepper(); renderDiagrams(); renderSection();
    $('#stepper').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function exitSteps(silent) {
    state.step = null; stopPlay();
    $('#stepBtn').textContent = 'Draw it step by step';
    if (!silent) { renderStepper(); renderDiagrams(); }
  }
  function goStep(i) { state.step = clamp(i, 0, stepsList.length - 1); renderStepper(); renderDiagrams(); }
  function stopPlay() { state.playing = false; if (playTimer) clearInterval(playTimer); playTimer = null; }
  function togglePlay() {
    if (state.playing) { stopPlay(); renderStepper(); return; }
    state.playing = true;
    if (state.step >= stepsList.length - 1) state.step = 0;
    playTimer = setInterval(() => { if (state.step >= stepsList.length - 1) { stopPlay(); renderStepper(); return; } goStep(state.step + 1); }, 3800);
    renderStepper(); renderDiagrams();
  }
  function renderStepper() {
    const el = $('#stepper');
    if (state.step == null || !stepsList.length) { el.hidden = true; return; }
    el.hidden = false;
    const st = stepsList[state.step];
    el.innerHTML = `<div class="st-head"><h2>${st.title}</h2><span class="st-count">Step ${state.step + 1} of ${stepsList.length}</span>
      <div class="st-ctrl"><button type="button" class="btn small" data-st="prev" ${state.step === 0 ? 'disabled' : ''}>Back</button>
      <button type="button" class="btn small" data-st="play">${state.playing ? 'Pause' : 'Play'}</button>
      <button type="button" class="btn small primary" data-st="next" ${state.step === stepsList.length - 1 ? 'disabled' : ''}>Next</button>
      <button type="button" class="btn small" data-st="exit">Show all</button></div></div>
      <div class="st-body">${st.html}</div>
      <div class="st-dots">${stepsList.map((s, i) => `<button type="button" data-st-go="${i}" aria-label="Step ${i + 1}" aria-current="${String(i === state.step)}"></button>`).join('')}</div>`;
  }

  /* ================= section card ================= */
  function renderSection() {
    const card = $('#sectionCard');
    if (state.cut == null || !res || !res.ok || practiceHidden() || state.step != null) { card.hidden = true; return; }
    card.hidden = false;
    const w = Math.min(760, Math.max(300, (card.clientWidth || $('#diagrams').clientWidth) - 34));
    const s = Explain.section(res, state.beam, state.cut, w);
    card.innerHTML = `<h2>Section cut at <i class="mv">x</i> = ${n2(state.cut)} m <button type="button" class="btn small close" data-act="cut-close">Remove cut</button></h2>${s.svg}<div class="sc-body">${s.html}</div>`;
  }

  /* ================= worked solution ================= */
  function renderSolution() {
    if (!solDirty) return;
    const el = $('#tab-solution');
    if (practiceHidden()) el.innerHTML = `<p class="sol-empty">The worked solution is hidden while you practise. Check your answers, or choose <b>Show solution</b> in the panel above the diagrams.</p>`;
    else if (!res.ok) {
      el.innerHTML = `<section class="sol"><h3><span class="n">!</span>${esc(res.errors && res.errors.length ? 'Check the set-up' : res.cls.title)}</h3><p>${esc(res.errors && res.errors.length ? res.errors.join(' ') : res.cls.detail)}</p>
        <p class="note">For equilibrium the supports must stop the beam from moving up and down and from rotating: <i class="mv">r</i> ≥ 3 + <i class="mv">c</i>, with the reactions sensibly placed. Try adding a support, or changing a roller to a pin or a fixed support.</p></section>`;
    } else el.innerHTML = Explain.solution(res, state.beam, { perEI: state.view.perEI });
    solDirty = false;
  }

  /* ================= practice ================= */
  function practiceFields() {
    if (!res.ok) return [];
    const out = [];
    const Vs = res.scales.V, Ms = res.scales.M;
    res.supports.forEach((s) => {
      out.push({ key: 'R' + s.label, label: `<i class="mv">R</i><sub>${s.label}</sub> (kN, upward +)`, exp: U.clean(s.R, Vs), unit: 'kN' });
      if (s.type === 'fixed') out.push({ key: 'M' + s.label, label: `Moment at ${s.label}, magnitude (kN·m)`, exp: Math.abs(U.clean(s.M, Ms)), unit: 'kN·m', dirKey: 'D' + s.label, expDir: s.M >= 0 ? 'cw' : 'acw' });
    });
    const mx = U.clean(res.extremes.Mmax.v, Ms), mn = U.clean(res.extremes.Mmin.v, Ms);
    out.push({ key: 'Msag', label: 'Largest sagging moment (kN·m; 0 if none)', exp: Math.max(0, mx), unit: 'kN·m' });
    if (mx > 0) out.push({ key: 'MsagX', label: '…which occurs at <i class="mv">x</i> = (m)', exp: res.extremes.Mmax.x, unit: 'm', check: (x) => x >= -1e-9 && x <= res.L + 1e-9 && Math.abs(Math.max(res.M(x, 'L'), res.M(x, 'R')) - mx) <= Math.max(0.02 * Math.abs(mx), 0.05) });
    out.push({ key: 'Mhog', label: 'Largest hogging moment, magnitude (kN·m; 0 if none)', exp: Math.max(0, -mn), unit: 'kN·m' });
    return out;
  }
  const close = (a, e) => Math.abs(a - e) <= Math.max(0.02 * Math.abs(e), 0.05);
  let practiceKeys = '';
  function renderPractice() {
    const card = $('#practiceCard');
    const p = state.practice;
    $('#practiceBtn').setAttribute('aria-pressed', String(p.on));
    if (!p.on) { card.hidden = true; practiceKeys = ''; return; }
    card.hidden = false;
    const fields = practiceFields();
    const keys = fields.map((f) => f.key).join('|') + (p.revealed ? '|rev' : '') + (res.ok ? '' : '|bad');
    if (keys !== practiceKeys) {
      practiceKeys = keys;
      const intro = res.ok
        ? `<p class="pr-intro">Work out the answers by hand, enter them, then press <b>Check</b>. Answers within 2% count as correct. You can keep editing the beam, or ask for a new random one.</p>`
        : `<p class="pr-intro">This beam is unstable or incomplete, so it has no answers. Press <b>New random beam</b>, or fix the supports.</p>`;
      card.innerHTML = `<div class="st-head"><h2>Test yourself</h2><label class="chk" style="margin-left:auto"><input type="checkbox" id="prIndet" ${p.indet ? 'checked' : ''}> Include indeterminate beams</label></div>${intro}
        <div class="pr-grid">${fields.map((f) => `<div class="pr-field"><span>${f.label}</span><div class="row"><span class="inp"><input type="number" inputmode="decimal" step="any" data-pr="${f.key}" value="${esc(p.answers[f.key] || '')}"><em>${f.unit}</em></span>${f.dirKey ? `<select class="inp" data-prdir="${f.dirKey}" style="padding:6px 4px"><option value="">direction</option><option value="cw" ${p.answers[f.dirKey] === 'cw' ? 'selected' : ''}>clockwise ↻</option><option value="acw" ${p.answers[f.dirKey] === 'acw' ? 'selected' : ''}>anticlockwise ↺</option></select>` : ''}</div><span class="res" data-res="${f.key}"></span></div>`).join('')}</div>
        <div class="pr-actions"><button type="button" class="btn primary" data-pr-act="check" ${res.ok ? '' : 'disabled'}>Check answers</button><button type="button" class="btn" data-pr-act="reveal" ${res.ok ? '' : 'disabled'}>${p.revealed ? 'Hide solution' : 'Show solution'}</button><button type="button" class="btn" data-pr-act="new">New random beam</button><span class="pr-score" id="prScore"></span></div>`;
      $$('[data-pr]', card).forEach((inp) => inp.addEventListener('input', () => { p.answers[inp.dataset.pr] = inp.value; }));
      $$('[data-prdir]', card).forEach((s) => s.addEventListener('change', () => { p.answers[s.dataset.prdir] = s.value; }));
      $('#prIndet', card).addEventListener('change', (e) => { p.indet = e.target.checked; });
    }
    // results
    const r = p.results;
    let score = 0, n = 0;
    fields.forEach((f) => {
      const out = $(`[data-res="${f.key}"]`, card); if (!out) return;
      out.className = 'res';
      if (!r && !p.revealed) { out.textContent = ''; return; }
      const got = r ? r[f.key] : null;
      const expTxt = `${n2(f.exp)}${f.expDir ? (f.expDir === 'cw' ? ' ↻' : ' ↺') : ''}`;
      if (got === true) { out.classList.add('ok'); out.textContent = p.revealed ? `✓ correct (${expTxt})` : '✓ correct'; }
      else if (got === false) { out.classList.add('no'); out.textContent = p.revealed ? `✗ answer: ${expTxt}` : '✗ not yet'; }
      else out.textContent = p.revealed ? `answer: ${expTxt}` : '';
      if (r) { n++; if (got === true) score++; }
    });
    $('#prScore', card).textContent = r ? `${score} of ${n} correct` : '';
  }
  function checkAnswers() {
    const p = state.practice;
    const fields = practiceFields();
    const r = {};
    fields.forEach((f) => {
      const a = parseFloat(p.answers[f.key]);
      if (!Number.isFinite(a)) { r[f.key] = false; return; }
      let ok = f.check ? f.check(a) : close(a, f.exp);
      if (ok && f.dirKey && Math.abs(f.exp) > 1e-9) ok = p.answers[f.dirKey] === f.expDir;
      r[f.key] = ok;
    });
    p.results = r;
    renderPractice();
  }
  function randomBeam(indet) {
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const L = pick([6, 8, 10, 12]);
    const kinds = ['ss', 'ss', 'overhang', 'overhang', 'cantL', 'cantR'];
    if (indet) kinds.push('propped', 'fixedfixed', 'continuous');
    const kind = pick(kinds);
    let supports;
    if (kind === 'ss') supports = [Sp('pinned', 0), Sp('roller', L)];
    else if (kind === 'overhang') { const a = pick([0, 1, 2]); let b = pick([L - 2, L - 1, L]); if (a === 0 && b === L) b = L - 2; supports = [Sp('pinned', a), Sp('roller', b)]; }
    else if (kind === 'cantL') supports = [Sp('fixed', 0)];
    else if (kind === 'cantR') supports = [Sp('fixed', L)];
    else if (kind === 'propped') supports = [Sp('fixed', 0), Sp('roller', L)];
    else if (kind === 'fixedfixed') supports = [Sp('fixed', 0), Sp('fixed', L)];
    else supports = [Sp('pinned', 0), Sp('roller', L / 2), Sp('roller', L)];
    const loads = [];
    const used = new Set();
    const nL = ri(1, 3);
    for (let k = 0; k < nL; k++) {
      const t = pick(['point', 'point', 'udl', 'uvl', 'moment']);
      if (t === 'point') { let x; let tries = 0; do { x = ri(0, L); tries++; } while (used.has(x) && tries < 20); used.add(x); loads.push(Pt(x, 5 * ri(2, 8))); }
      else if (t === 'udl' && !loads.some((l) => l.type === 'dist')) { const a = ri(0, L - 2); const b = ri(a + 2, L); loads.push(Wd(a, b, 2 * ri(1, 5))); }
      else if (t === 'uvl' && !loads.some((l) => l.type === 'dist')) { const a = ri(0, L - 3); const b = ri(a + 3, L); const w = 3 * ri(2, 4); loads.push(Math.random() < 0.5 ? Wd(a, b, 0, w) : Wd(a, b, w, 0)); }
      else if (t === 'moment') { let x; let tries = 0; do { x = ri(1, L - 1); tries++; } while (used.has(x) && tries < 20); used.add(x); loads.push(Cp(x, (Math.random() < 0.5 ? -1 : 1) * 10 * ri(1, 4))); }
    }
    if (!loads.length) loads.push(Pt(L / 2, 20));
    return { L, supports, loads };
  }
  function newPracticeBeam() {
    pushUndo();
    state.beam = withIds(randomBeam(state.practice.indet), state.beam);
    state.selected = null; state.cut = null; exitSteps(true);
    Object.assign(state.practice, { revealed: false, answers: {}, results: null });
    practiceKeys = '';
    markPreset(null); syncBeamInputs(); buildEditor(); update();
  }

  /* ================= presets & beam inputs ================= */
  function markPreset(name) { $$('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === name)); }
  function loadModel(p, name) {
    if (state.beam) pushUndo();
    state.beam = withIds(p, state.beam);
    state.selected = null; state.cut = null; exitSteps(true);
    state.practice.results = null;
    markPreset(name || null); syncBeamInputs(); buildEditor(); update();
  }
  function syncBeamInputs() {
    const b = state.beam;
    if (document.activeElement !== $('#inL')) $('#inL').value = String(b.L);
    if (document.activeElement !== $('#inE')) $('#inE').value = String(b.E);
    if (document.activeElement !== $('#inI')) $('#inI').value = String(b.I);
    $('#inSnap').value = String(state.snap);
  }
  function setLength(Lnew) {
    const b = state.beam, Lold = b.L;
    if (!(Lnew > 0) || Math.abs(Lnew - Lold) < 1e-12) return;
    const atEnd = (x) => Math.abs(x - Lold) < 1e-9;
    b.supports.forEach((s) => { s.x = atEnd(s.x) ? Lnew : Math.min(s.x, Lnew); });
    b.hinges.forEach((h) => { h.x = Math.min(h.x, Lnew * 0.99); });
    b.loads.forEach((l) => {
      if (l.type === 'dist') { l.b = atEnd(l.b) ? Lnew : Math.min(l.b, Lnew); l.a = Math.min(l.a, Math.max(0, l.b - state.snap)); }
      else l.x = atEnd(l.x) ? Lnew : Math.min(l.x, Lnew);
    });
    b.hinges = b.hinges.filter((h) => h.x > 0 && h.x < Lnew);
    b.L = Lnew;
  }

  /* ================= link sharing (URL hash) ================= */
  let hashTimer = null;
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  function encodeBeam(b) {
    const c = { L: r4(b.L), E: r4(b.E), I: r4(b.I), s: b.supports.map((s) => [s.type[0], r4(s.x)]), h: b.hinges.map((h) => r4(h.x)),
      l: b.loads.map((l) => (l.type === 'point' ? ['p', r4(l.x), r4(l.P)] : l.type === 'moment' ? ['m', r4(l.x), r4(l.C)] : ['d', r4(l.a), r4(l.b), r4(l.w1), r4(l.w2)])) };
    return btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeBeam(code) {
    try {
      const c = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))));
      const T = { p: 'pinned', r: 'roller', s: 'simple', f: 'fixed' };
      const L = Number(c.L); if (!(L > 0 && L <= 1000)) return null;
      return {
        L, E: Number(c.E) > 0 ? Number(c.E) : 200, I: Number(c.I) > 0 ? Number(c.I) : 100,
        supports: (c.s || []).filter((s) => T[s[0]]).map((s) => ({ type: T[s[0]], x: Number(s[1]) })),
        hinges: (c.h || []).map((x) => ({ x: Number(x) })),
        loads: (c.l || []).map((l) => (l[0] === 'p' ? Pt(Number(l[1]), Number(l[2])) : l[0] === 'm' ? Cp(Number(l[1]), Number(l[2])) : Wd(Number(l[1]), Number(l[2]), Number(l[3]), Number(l[4])))),
      };
    } catch (e) { return null; }
  }
  function scheduleHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      try { history.replaceState(null, '', '#b=' + encodeBeam(state.beam) + (state.practice.on ? '&test=1' : '')); } catch (e) { /* sandboxed */ }
    }, 300);
  }

  /* ================= theme ================= */
  function effectiveDark() {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function syncThemeLabel() { $('#themeLabel').textContent = effectiveDark() ? 'Light' : 'Dark'; }

  /* ================= toast ================= */
  let toastT = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* ================= theory figures ================= */
  function theoryFigures() {
    $$('.supports-tbl td[data-glyph]').forEach((td) => { td.innerHTML = Draw.glyph(td.dataset.glyph); });
    const shapes = {
      flat: 'M3,10 L37,10', line: 'M3,16 L37,4', parab: 'M3,17 Q20,-7 37,17', cubic: 'M3,17 C14,17 26,12 37,3',
      jump: 'M3,5 L20,5 L20,15 L37,15', kink: 'M3,16 L20,4 L37,16',
    };
    $$('.shapes-tbl td[data-shape]').forEach((td) => {
      td.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 40 20" aria-hidden="true"><line x1="2" y1="19" x2="38" y2="19"/><path d="${shapes[td.dataset.shape]}"/></svg>`);
    });
    const AH = Draw.arrowHead, ARC = Draw.arcArrow;
    // sign convention figure: the two faces of a cut, pulled apart
    const f1 = [];
    f1.push(`<text class="t" x="150" y="40" text-anchor="middle">left part</text><text class="t" x="490" y="40" text-anchor="middle">right part</text>`);
    f1.push(`<rect class="beam" x="40" y="64" width="220" height="14" rx="2"/><rect class="beam" x="380" y="64" width="220" height="14" rx="2"/>`);
    f1.push(`<path class="cut-face" d="M260,56l3,6l-6,6l6,6l-6,6l3,6"/><path class="cut-face" d="M380,56l3,6l-6,6l6,6l-6,6l3,6"/>`);
    // left part, right face: V down, M anticlockwise
    f1.push(`<line class="int-line" x1="272" y1="82" x2="272" y2="118"/>` + AH(272, 124, 0, 1, 8, 'int-head'));
    f1.push(ARC(262, 71, 26, false, 'int-line', 'int-head', { a0: 250, a1: 430 }));
    f1.push(`<text class="mvt" x="280" y="124">V</text><text class="mvt" x="292" y="46">M</text>`);
    // right part, left face: V up, M clockwise
    f1.push(`<line class="int-line" x1="368" y1="124" x2="368" y2="88"/>` + AH(368, 82, 0, -1, 8, 'int-head'));
    f1.push(ARC(378, 71, 26, true, 'int-line', 'int-head', { a0: 110, a1: 290 }));
    f1.push(`<text class="mvt" x="352" y="124">V</text><text class="mvt" x="338" y="46">M</text>`);
    f1.push(`<text class="t" x="320" y="150" text-anchor="middle">positive V: down on the left part's face, up on the right part's face</text>`);
    f1.push(`<text class="t" x="320" y="168" text-anchor="middle">positive M (sagging): anticlockwise on the left part's face, clockwise on the right part's</text>`);
    // sagging / hogging sketches
    f1.push(`<path d="M90,204 Q170,232 250,204" fill="none" stroke="var(--q-m)" stroke-width="10" stroke-linecap="round" opacity="0.3"/><path d="M90,204 Q170,232 250,204" fill="none" stroke="var(--q-m)" stroke-width="2"/>`);
    f1.push(`<text class="t" x="170" y="196" text-anchor="middle">top squeezed (compression)</text><text class="t b" x="170" y="252" text-anchor="middle">sagging, M &gt; 0: a smile</text>`);
    f1.push(`<path d="M390,226 Q470,198 550,226" fill="none" stroke="var(--q-m)" stroke-width="10" stroke-linecap="round" opacity="0.3"/><path d="M390,226 Q470,198 550,226" fill="none" stroke="var(--q-m)" stroke-width="2"/>`);
    f1.push(`<text class="t" x="470" y="196" text-anchor="middle">top stretched (tension)</text><text class="t b" x="470" y="252" text-anchor="middle">hogging, M &lt; 0: a frown</text>`);
    $('#figSigns').innerHTML = `<svg viewBox="0 0 640 262" role="img" aria-label="Positive shear force and bending moment on the two faces of a cut">${f1.join('')}</svg><figcaption>The two faces of a cut, pulled apart. <i class="mv">V</i> and <i class="mv">M</i> act equally and oppositely on the two faces (Newton's third law).</figcaption>`;
    // element figure
    const f2 = [];
    f2.push(`<rect class="beam" x="230" y="70" width="180" height="40" rx="2"/>`);
    for (let x = 240; x <= 400; x += 20) f2.push(`<line class="ld-line thin" x1="${x}" y1="44" x2="${x}" y2="64"/>` + AH(x, 69, 0, 1, 5, 'ld-head'));
    f2.push(`<line class="ld-line" x1="232" y1="44" x2="408" y2="44"/><text class="t" x="320" y="34" text-anchor="middle"><tspan class="mvt">w</tspan> per metre</text>`);
    f2.push(`<line class="int-line" x1="214" y1="122" x2="214" y2="82"/>` + AH(214, 76, 0, -1, 8, 'int-head') + `<text class="mvt" x="206" y="138" text-anchor="end">V</text>`);
    f2.push(`<line class="int-line" x1="426" y1="68" x2="426" y2="108"/>` + AH(426, 114, 0, 1, 8, 'int-head') + `<text class="mvt" x="434" y="138">V + dV</text>`);
    f2.push(ARC(214, 90, 30, true, 'int-line', 'int-head', { a0: 110, a1: 250 }) + `<text class="mvt" x="168" y="80" text-anchor="end">M</text>`);
    f2.push(ARC(426, 90, 30, false, 'int-line', 'int-head', { a0: 290, a1: 430 }) + `<text class="mvt" x="472" y="80">M + dM</text>`);
    f2.push(`<line class="axis" x1="230" y1="150" x2="410" y2="150" stroke="var(--axis)"/><text class="mvt" x="320" y="168" text-anchor="middle">dx</text>`);
    $('#figElement').innerHTML = `<svg viewBox="0 0 640 176" role="img" aria-label="A short element of beam with shear and moment on both faces">${f2.join('')}</svg><figcaption>A slice d<i class="mv">x</i> long, with every force and moment drawn in its positive direction.</figcaption>`;
  }

  /* ================= wiring ================= */
  function init() {
    // theme
    try { const t = localStorage.getItem('beamStudioTheme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
    syncThemeLabel();
    $('#themeBtn').addEventListener('click', () => {
      const next = effectiveDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('beamStudioTheme', next); } catch (e) { /* ignore */ }
      syncThemeLabel();
    });
    if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', syncThemeLabel); }

    // model: from link or default preset
    let start = null, test = false;
    const m = /#b=([^&]+)(&test=1)?/.exec(location.hash || '');
    if (m) { start = decodeBeam(m[1]); test = !!m[2]; }
    state.beam = withIds(start || PRESETS.simplySupported, start ? { E: start.E, I: start.I } : null);
    markPreset(start ? null : 'simplySupported');
    if (test) state.practice.on = true;

    setupPalette();
    theoryFigures();

    $$('[data-preset]').forEach((b) => b.addEventListener('click', () => loadModel(PRESETS[b.dataset.preset], b.dataset.preset)));
    $$('[data-std]').forEach((b) => b.addEventListener('click', () => { loadModel(STD[b.dataset.std], null); document.querySelector('.stage').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast('Loaded. Compare the diagrams with the formula'); }));
    $('#undoBtn').addEventListener('click', doUndo);
    $('#redoBtn').addEventListener('click', doRedo);
    $('#clearBtn').addEventListener('click', () => { pushUndo(); state.beam.supports = []; state.beam.hinges = []; state.beam.loads = []; state.selected = null; state.cut = null; exitSteps(true); markPreset(null); buildEditor(); update(); toast('Beam cleared. Press Undo to restore it'); });
    $('#linkBtn').addEventListener('click', async () => {
      const url = location.href.split('#')[0] + '#b=' + encodeBeam(state.beam) + (state.practice.on ? '&test=1' : '');
      try { await navigator.clipboard.writeText(url); toast(state.practice.on ? 'Link copied. It opens this beam in test mode' : 'Link copied. It opens this exact beam'); }
      catch (e) { window.prompt('Copy this link:', url); }
    });
    $('#practiceBtn').addEventListener('click', () => {
      const p = state.practice; p.on = !p.on; p.revealed = false; p.results = null; practiceKeys = '';
      if (p.on) { exitSteps(true); state.cut = null; }
      update();
      if (p.on) $('#practiceCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    $('#practiceCard').addEventListener('click', (e) => {
      const a = e.target.closest('[data-pr-act]'); if (!a) return;
      if (a.dataset.prAct === 'check') checkAnswers();
      if (a.dataset.prAct === 'reveal') { state.practice.revealed = !state.practice.revealed; practiceKeys = ''; const r = state.practice.results; update(); state.practice.results = r; renderPractice(); }
      if (a.dataset.prAct === 'new') newPracticeBeam();
    });

    // beam inputs
    $('#inL').addEventListener('focus', () => { editSnapshot = snapModel(); });
    $('#inL').addEventListener('change', () => {
      const v = parseFloat($('#inL').value);
      if (Number.isFinite(v) && v >= 1 && v <= 60) { setLength(v); markPreset(null); update(); buildEditor(); }
      else toast('Span must be between 1 m and 60 m');
      syncBeamInputs(); commitEdit();
    });
    const eiInput = (id, key) => {
      $(id).addEventListener('focus', () => { editSnapshot = snapModel(); });
      $(id).addEventListener('input', () => { const v = parseFloat($(id).value); if (Number.isFinite(v) && v > 0) { state.beam[key] = v; update(); } });
      $(id).addEventListener('change', () => { syncBeamInputs(); commitEdit(); });
    };
    eiInput('#inE', 'E'); eiInput('#inI', 'I');
    $('#inSnap').addEventListener('change', () => { state.snap = parseFloat($('#inSnap').value) || 0.5; buildEditor(); });

    // view toggles
    const tg = (id, key) => $(id).addEventListener('change', () => { state.view[key] = $(id).checked; update(); });
    tg('#vShape', 'shape'); tg('#vSlope', 'slope'); tg('#vPerEI', 'perEI'); tg('#vTension', 'tension');
    $('#stepBtn').addEventListener('click', () => { if (state.step == null) enterSteps(); else exitSteps(); });
    $('#stepper').addEventListener('click', (e) => {
      const b = e.target.closest('[data-st],[data-st-go]'); if (!b) return;
      if (b.dataset.stGo != null) { stopPlay(); goStep(Number(b.dataset.stGo)); return; }
      const a = b.dataset.st;
      if (a === 'prev') { stopPlay(); goStep(state.step - 1); }
      if (a === 'next') { stopPlay(); goStep(state.step + 1); }
      if (a === 'play') togglePlay();
      if (a === 'exit') exitSteps();
    });
    $('#stepper').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') goStep(state.step + 1); if (e.key === 'ArrowLeft') goStep(state.step - 1); });

    // diagrams
    const diag = $('#diagrams');
    diag.addEventListener('pointerdown', onPlotDown);
    window.addEventListener('pointermove', onPlotMove);
    window.addEventListener('pointerup', onPlotUp);
    window.addEventListener('pointercancel', onPlotUp);
    diag.addEventListener('pointerleave', () => { if (!drag && !cutDrag) { state.hoverX = null; drawCrosshair(); } });
    $('#svgLoad').addEventListener('keydown', onLoadKey);
    $('#sectionCard').addEventListener('click', (e) => { if (e.target.closest('[data-act="cut-close"]')) { state.cut = null; renderSection(); drawCrosshair(); } });
    $('#elList').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (!b) return; state.selected = b.dataset.id; buildEditor(); renderDiagrams(); renderList(); });

    // tabs
    $$('.tabs [role="tab"]').forEach((t) => t.addEventListener('click', () => {
      state.tab = t.dataset.tab;
      $$('.tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
      $('#tab-solution').hidden = state.tab !== 'solution';
      $('#tab-theory').hidden = state.tab !== 'theory';
      if (state.tab === 'solution') renderSolution();
    }));

    // global keys
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    });

    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { renderDiagrams(); renderSection(); }, 120); });

    syncBeamInputs(); buildEditor(); updateUndoBtns();
    update();
  }

  /* read-only handle for testing / curious students: BeamStudio.result() in the console */
  window.BeamStudio = { state, result: () => res, solve: S.solve, load: (m) => loadModel(m, null) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
