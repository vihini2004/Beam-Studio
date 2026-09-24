/* ---------- worked solution, step-by-step walkthrough, section free body ---------- */
const Explain = (() => {
  const { fmt, i, sym, sup, X, mac, esc } = U;
  const FACT = BeamSolver.FACT;
  const TYPES = BeamSolver.SUPPORT_TYPES;
  const MINUS = '−';
  const n2 = (v) => fmt(v, 2);
  const n3 = (v) => fmt(v, 3);
  const pm = (v) => (v < 0 ? ` ${MINUS} ` : ' + ');
  const typeName = { pinned: 'pinned support', roller: 'roller', simple: 'simple support', fixed: 'fixed support' };
  const EQ = (lhs, rhs) => `<div class="eq">${lhs}${rhs != null ? ` = ${rhs}` : ''}</div>`;
  const R_ = (s) => sym('R', s.label), M_ = (s) => sym('M', s.label), H_ = (s) => sym('H', s.label);
  const arrowR = (R) => (R >= 0 ? '↑' : '↓');
  const rot = (M) => (M >= 0 ? 'clockwise ↻' : 'anticlockwise ↺');

  function loadWords(l) {
    if (l.type === 'point') return `${n2(Math.abs(l.P))} kN point load (${l.P >= 0 ? 'downward' : 'upward'}) at ${X} = ${n2(l.x)} m`;
    if (l.type === 'moment') return `${n2(Math.abs(l.C))} kN·m ${l.C >= 0 ? 'clockwise' : 'anticlockwise'} couple at ${X} = ${n2(l.x)} m`;
    const u = Math.abs(l.w1 - l.w2) < 1e-12;
    const dir = l.w1 + l.w2 >= 0 ? '' : ' (upward)';
    if (u) return `uniform load ${n2(Math.abs(l.w1))} kN/m${dir} on ${n2(l.a)} ≤ ${X} ≤ ${n2(l.b)} m`;
    return `varying load ${n2(Math.abs(l.w1))} → ${n2(Math.abs(l.w2))} kN/m${dir} on ${n2(l.a)} ≤ ${X} ≤ ${n2(l.b)} m`;
  }

  /* resultant (for reactions) of each distributed load, with the reasoning */
  function resultantHtml(l) {
    const len = l.b - l.a, w1 = l.w1, w2 = l.w2;
    const r = BeamSolver.distResultant(l, l.a, l.b);
    const up = w1 + w2 < 0 ? ' (upward)' : '';
    if (Math.abs(w1 - w2) < 1e-12) {
      return `<p><b>Uniform load</b> ${n2(Math.abs(w1))} kN/m over ${n2(len)} m${up}:</p>` +
        EQ(`${i('W')} = ${i('w')} × length = ${n2(Math.abs(w1))} × ${n2(len)}`, `<b>${n2(Math.abs(r.W))} kN</b>`) +
        `<p class="note">It acts at the middle of the loaded length, ${i('x̄')} = (${n2(l.a)} + ${n2(l.b)}) / 2 = <b>${n2(r.xbar)} m</b>.</p>`;
    }
    if (Math.abs(w1) < 1e-12 || Math.abs(w2) < 1e-12) {
      const peak = Math.abs(w1) < 1e-12 ? w2 : w1;
      const heavyRight = Math.abs(w1) < 1e-12;
      return `<p><b>Triangular load</b> rising to ${n2(Math.abs(peak))} kN/m over ${n2(len)} m${up}:</p>` +
        EQ(`${i('W')} = ½ × ${i('w')} × length = ½ × ${n2(Math.abs(peak))} × ${n2(len)}`, `<b>${n2(Math.abs(r.W))} kN</b>`) +
        `<p class="note">It acts at the centroid of the triangle, one-third of the length from the heavy end: ${i('x̄')} = ${n2(l.a)} + ${heavyRight ? '⅔' : '⅓'} × ${n2(len)} = <b>${n2(r.xbar)} m</b>.</p>`;
    }
    const lo = Math.abs(w1) < Math.abs(w2) ? w1 : w2, hi = Math.abs(w1) < Math.abs(w2) ? w2 : w1;
    const Wr = lo * len, xr = l.a + len / 2;
    const Wt = 0.5 * (hi - lo) * len, xt = Math.abs(w1) < Math.abs(w2) ? l.a + 2 * len / 3 : l.a + len / 3;
    return `<p><b>Trapezoidal load</b> ${n2(Math.abs(w1))} → ${n2(Math.abs(w2))} kN/m over ${n2(len)} m${up}. Split it into a rectangle and a triangle:</p>` +
      EQ(`${i('W')}<sub>1</sub> = ${n2(Math.abs(lo))} × ${n2(len)} = ${n2(Math.abs(Wr))} kN at ${n2(xr)} m,&nbsp;&nbsp; ${i('W')}<sub>2</sub> = ½ × ${n2(Math.abs(hi - lo))} × ${n2(len)} = ${n2(Math.abs(Wt))} kN at ${n2(xt)} m`) +
      EQ(`${i('W')} = ${n2(Math.abs(r.W))} kN,&nbsp;&nbsp; ${i('x̄')} = (${n2(Math.abs(Wr))} × ${n2(xr)} + ${n2(Math.abs(Wt))} × ${n2(xt)}) / ${n2(Math.abs(r.W))}`, `<b>${n2(r.xbar)} m</b>`);
  }

  /* list of (force, position) for moment equations: downward positive */
  function forceList(model) {
    const out = [];
    for (const l of model.loads) {
      if (l.type === 'point') out.push({ F: l.P, x: l.x, txt: n2(Math.abs(l.P)) });
      else if (l.type === 'dist') { const r = BeamSolver.distResultant(l, l.a, l.b); out.push({ F: r.W, x: r.xbar, txt: n2(Math.abs(r.W)), dist: true }); }
    }
    return out;
  }

  /* moment equation about point p (clockwise +): terms of loads & couples; unknown reaction terms given separately */
  function momentTerms(model, p) {
    const t = [];
    for (const f of forceList(model)) {
      const d = f.x - p;
      if (Math.abs(d) < 1e-12 || Math.abs(f.F) < 1e-12) continue;
      const val = f.F * d; // clockwise +
      t.push({ val, html: `${f.txt} × ${n2(Math.abs(d))}` });
    }
    for (const l of model.loads) if (l.type === 'moment' && Math.abs(l.C) > 1e-12) t.push({ val: l.C, html: n2(Math.abs(l.C)) });
    return t;
  }
  const joinTerms = (terms) => terms.map((t, k) => (k === 0 ? (t.val < 0 ? MINUS : '') : pm(t.val)) + t.html).join('');

  /* ---------- polynomial of a quantity inside a segment ---------- */
  function binom(n, k) { let r = 1; for (let j = 1; j <= k; j++) r = r * (n - k + j) / j; return r; }
  function segPoly(res, q, x0, x1) {
    const xm = 0.5 * (x0 + x1);
    const c = [0, 0, 0, 0, 0, 0, 0];
    const add = (base, a, p) => { // base·(x − a)^p / p!
      if (p < 0 || !(xm > a)) return;
      const k = base / FACT[p];
      for (let j = 0; j <= p; j++) c[j] += k * binom(p, j) * Math.pow(-a, p - j);
    };
    const shift = { V: -1, M: 0, T: 1, Y: 2 }[q];
    for (const t of res.allTerms) add(t.base, t.a, t.m + shift);
    if (q === 'T') { c[0] += res.C1; res.hinges.forEach((h) => { if (xm > h.x) c[0] += h.D; }); }
    if (q === 'Y') { c[1] += res.C1; c[0] += res.C2; res.hinges.forEach((h) => { if (xm > h.x) { c[1] += h.D; c[0] -= h.D * h.x; } }); }
    return c;
  }
  function polyHtml(c, scale) {
    const tol = 1e-9 * Math.max(1, scale);
    const parts = [];
    for (let k = c.length - 1; k >= 0; k--) {
      const v = Math.abs(c[k]) < tol ? 0 : c[k];
      if (!v) continue;
      const mag = Math.abs(v);
      const coef = k > 0 && Math.abs(mag - 1) < 1e-12 ? '' : n3(mag);
      const xp = k === 0 ? '' : k === 1 ? X : X + sup(k);
      parts.push({ neg: v < 0, s: coef + xp });
    }
    if (!parts.length) return '0';
    return parts.map((p, k) => (k === 0 ? (p.neg ? MINUS : '') : p.neg ? ` ${MINUS} ` : ' + ') + p.s).join('');
  }

  /* ---------- Macaulay expression at level q with numeric or symbolic reactions ---------- */
  function macaulayHtml(res, q, symbolic) {
    const shift = { V: -1, M: 0, T: 1, Y: 2 }[q];
    const L = res.L;
    const items = [];
    // reactions first (left to right), then loads in order of position
    const react = [];
    res.supports.forEach((s) => {
      react.push({ base: s.R, a: s.x, m: 1, symHtml: R_(s) });
      if (s.type === 'fixed') react.push({ base: s.M, a: s.x, m: 0, symHtml: M_(s) });
    });
    const loads = res.terms.slice();
    const all = react.concat(loads).filter((t) => t.a < L - 1e-9 && t.m + shift >= 0).sort((p, q2) => p.a - q2.a);
    for (const t of all) {
      const p = t.m + shift;
      const den = FACT[p] > 1 ? `/${FACT[p]}` : '';
      const br = mac(t.a, p);
      if (t.symHtml && symbolic) {
        items.push({ neg: false, s: `${t.symHtml}${br === '1' ? '' : '&thinsp;' + br}${den}` });
      } else {
        const v = t.base;
        if (Math.abs(v) < 1e-12) continue;
        const mag = Math.abs(v);
        const coef = br !== '1' && Math.abs(mag - 1) < 1e-12 ? '' : n3(mag);
        items.push({ neg: v < 0, s: `${coef}${br === '1' ? '' : br}${den}` });
      }
    }
    if (q === 'T' || q === 'Y') {
      res.hinges.forEach((h) => items.push({ neg: false, s: `${sym('Δ', h.label)}${q === 'T' ? mac(h.x, 0) : mac(h.x, 1)}` }));
      items.push({ neg: false, s: q === 'T' ? sym('C', 1) : `${sym('C', 1)}${X}` });
      if (q === 'Y') items.push({ neg: false, s: sym('C', 2) });
    }
    if (!items.length) return '0';
    return items.map((it, k) => (k === 0 ? (it.neg ? MINUS : '') : it.neg ? ` ${MINUS} ` : ' + ') + it.s).join('');
  }

  /* numeric evaluation, term by term, of EI·y or EI·θ at x (for boundary-condition lines) */
  function substituted(res, q, x, symbolic) {
    const shift = q === 'T' ? 1 : 2;
    const terms = [];
    const react = [];
    res.supports.forEach((s) => {
      react.push({ base: s.R, a: s.x, m: 1, symHtml: R_(s), unknown: true });
      if (s.type === 'fixed') react.push({ base: s.M, a: s.x, m: 0, symHtml: M_(s), unknown: true });
    });
    const all = react.concat(res.terms).filter((t) => x > t.a + 1e-12).sort((p, q2) => p.a - q2.a);
    let known = 0;
    for (const t of all) {
      const p = t.m + shift;
      const val = Math.pow(x - t.a, p) / FACT[p];
      if (t.unknown && symbolic) terms.push({ neg: false, s: `${n3(val)}${t.symHtml}` });
      else { const v = t.base * val; if (Math.abs(v) < 1e-12) continue; known += v; terms.push({ neg: v < 0, s: n2(Math.abs(v)) }); }
    }
    res.hinges.forEach((h) => { if (x > h.x + 1e-12) terms.push({ neg: false, s: `${q === 'T' ? '' : n3(x - h.x)}${sym('Δ', h.label)}` }); });
    if (q === 'T') terms.push({ neg: false, s: sym('C', 1) });
    else { terms.push({ neg: false, s: Math.abs(x) < 1e-12 ? `0·${sym('C', 1)}` : `${n3(x)}${sym('C', 1)}` }); terms.push({ neg: false, s: sym('C', 2) }); }
    const str = terms.map((it, k) => (k === 0 ? (it.neg ? MINUS : '') : it.neg ? ` ${MINUS} ` : ' + ') + it.s).join('');
    return { str, known };
  }

  /* print one row of the solver's linear system with symbols */
  function unkSym(u) {
    if (u.kind === 'R') return R_(u.s);
    if (u.kind === 'MR') return M_(u.s);
    if (u.kind === 'C1') return sym('C', 1);
    if (u.kind === 'C2') return sym('C', 2);
    return sym('Δ', u.h.label);
  }
  function eqRowHtml(res, eq, scale) {
    const ts = [];
    eq.coef.forEach((c, j) => {
      if (Math.abs(c) < 1e-12) return;
      const mag = Math.abs(c);
      ts.push({ val: c, html: `${Math.abs(mag - 1) < 1e-12 ? '' : n3(mag)}${unkSym(res.unknowns[j])}` });
    });
    return `${joinTerms(ts) || '0'} = ${n2(U.clean(eq.rhs, scale))}`;
  }

  /* ================= WORKED SOLUTION ================= */
  function solution(res, model, opts) {
    const o = opts || {};
    const h = [];
    const L = res.L;
    const cls = res.cls;
    const Vs = res.scales.V, Ms = res.scales.M;
    const clean = (v, s) => U.clean(v, s);
    const perEI = o.perEI;

    /* 1 — FBD & determinacy */
    h.push(`<section class="sol"><h3><span class="n">1</span>Free-body diagram and determinacy</h3>`);
    h.push(`<p>Replace every support by the reactions it can supply:</p><ul class="tight">`);
    res.supports.forEach((s) => {
      const u = [];
      if (TYPES[s.type].horizontal) u.push(H_(s));
      u.push(R_(s));
      if (s.type === 'fixed') u.push(M_(s));
      h.push(`<li><b>${s.label}</b>: ${typeName[s.type]} at ${X} = ${n2(s.x)} m → ${u.join(', ')}</li>`);
    });
    res.hinges.forEach((hg) => h.push(`<li><b>${hg.label}</b>: internal hinge at ${X} = ${n2(hg.x)} m → adds one condition, ${i('M')} = 0 there</li>`));
    h.push(`</ul>`);
    h.push(EQ(`${i('r')} = ${cls.r} reaction components,&nbsp;&nbsp; equations available = ${cls.c ? `3 + ${cls.c} = ${cls.eqs}` : '3'}`));
    h.push(`<p class="verdict ${cls.status}"><b>${esc(cls.title)}.</b> ${esc(cls.detail)}</p>`);
    h.push(`</section>`);

    /* 2 — resultants */
    const dists = model.loads.filter((l) => l.type === 'dist').slice().sort((p, q) => p.a - q.a);
    let secN = 2;
    if (dists.length) {
      h.push(`<section class="sol"><h3><span class="n">${secN++}</span>Resultants of the distributed loads</h3>`);
      h.push(`<p class="note">A distributed load can be replaced by one force (its area) at its centroid, but <b>only for finding reactions</b>. For shear and moment at a section, use only the part of the load that lies to the left of the section.</p>`);
      dists.forEach((l) => h.push(resultantHtml(l)));
      h.push(`</section>`);
    }

    /* 3 — reactions */
    h.push(`<section class="sol"><h3><span class="n">${secN++}</span>Support reactions</h3>`);
    const hs = res.supports.filter((s) => TYPES[s.type].horizontal);
    const total = forceList(model).reduce((a, f) => a + f.F, 0);
    if (hs.length === 1) h.push(EQ(`Σ${i('F')}<sub>x</sub> = 0:&nbsp; ${H_(hs[0])}`, '0&nbsp; (every load is vertical)'));
    else if (hs.length > 1) h.push(EQ(`Σ${i('F')}<sub>x</sub> = 0:&nbsp; ${hs.map(H_).join(' + ')} = 0`) + `<p class="note">With no horizontal load (and ignoring axial shortening) each horizontal reaction is zero.</p>`);

    const nF = res.supports.filter((s) => s.type === 'fixed').length;
    const verticalDet = cls.dv === 0;
    if (verticalDet && !res.hinges.length && res.supports.length === 2 && nF === 0) {
      const [A, B] = res.supports;
      const mt = momentTerms(model, A.x);
      const lever = B.x - A.x;
      const lhs = mt.length ? joinTerms(mt) + ` ${MINUS} ${R_(B)} × ${n2(lever)}` : `${MINUS}${R_(B)} × ${n2(lever)}`;
      h.push(`<p>Take moments about <b>${A.label}</b> so that ${R_(A)} drops out (clockwise positive):</p>`);
      h.push(EQ(`Σ${i('M')}<sub>${A.label}</sub> = 0:&nbsp; ${lhs}`, '0'));
      const sumM = mt.reduce((a, t) => a + t.val, 0);
      h.push(EQ(`${R_(B)} = ${n2(clean(sumM, Ms))} / ${n2(lever)}`, `<b>${n2(clean(B.R, Vs))} kN</b>`));
      h.push(`<p>Then resolve vertically:</p>`);
      h.push(EQ(`Σ${i('F')}<sub>y</sub> = 0:&nbsp; ${R_(A)} + ${R_(B)}${Math.abs(total) > 1e-12 ? ` ${MINUS} ${n2(total)}` : ''}`, '0'));
      h.push(EQ(`${R_(A)} = ${Math.abs(total) > 1e-12 ? `${n2(total)} ${MINUS} ` : `${MINUS}`}${n2(clean(B.R, Vs))}`, `<b>${n2(clean(A.R, Vs))} kN</b>`));
    } else if (verticalDet && !res.hinges.length && res.supports.length === 1 && nF === 1) {
      const [A] = res.supports;
      h.push(`<p>A cantilever: the fixed support alone must balance every load.</p>`);
      h.push(EQ(`Σ${i('F')}<sub>y</sub> = 0:&nbsp; ${R_(A)} ${MINUS} ${n2(total)} = 0&nbsp; ⇒&nbsp; ${R_(A)}`, `<b>${n2(clean(A.R, Vs))} kN</b>`));
      const mt = momentTerms(model, A.x);
      h.push(`<p>Moments about <b>${A.label}</b> (clockwise positive; ${M_(A)} is the moment the wall applies to the beam):</p>`);
      h.push(EQ(`Σ${i('M')}<sub>${A.label}</sub> = 0:&nbsp; ${M_(A)}${mt.length ? ' + ' + joinTerms(mt) : ''}`, '0'));
      h.push(EQ(`${M_(A)}`, `<b>${n2(clean(A.M, Ms))} kN·m</b>&nbsp; (${Math.abs(A.M) < 1e-9 ? 'no moment' : A.M < 0 ? 'negative, so it acts anticlockwise' : 'positive, so it acts clockwise'})`));
    } else if (verticalDet) {
      // general determinate (compound beams with hinges, etc.): show the equation system
      const A = res.supports[0];
      h.push(`<p>Write the independent equations and solve them together:</p><ol class="eqlist">`);
      const unk = [];
      res.supports.forEach((s) => { unk.push({ s, kind: 'R' }); if (s.type === 'fixed') unk.push({ s, kind: 'M' }); });
      const term = (c, u) => ({ val: c, html: `${Math.abs(Math.abs(c) - 1) < 1e-12 ? '' : n2(Math.abs(c))}${u.kind === 'R' ? R_(u.s) : M_(u.s)}` });
      const show = (coefs, rhs, label) => {
        const ts = coefs.map((c, k) => (Math.abs(c) > 1e-12 ? term(c, unk[k]) : null)).filter(Boolean);
        h.push(`<li>${label}:&nbsp; ${joinTerms(ts)} = ${n2(clean(rhs, Math.max(Ms, Vs)))}</li>`);
      };
      show(unk.map((u) => (u.kind === 'R' ? 1 : 0)), total, `Σ${i('F')}<sub>y</sub> = 0`);
      // moments about A, clockwise +:  −Σ R(x−p) + Σ M + Σ load moments = 0  →  Σ R(x−p) − Σ M = Σ load moments
      const mt = momentTerms(model, A.x);
      show(unk.map((u) => (u.kind === 'R' ? u.s.x - A.x : -1)), mt.reduce((a, t) => a + t.val, 0), `Σ${i('M')}<sub>${A.label}</sub> = 0`);
      res.hinges.forEach((hg) => {
        // M at hinge from the left = 0:  Σ R(h−x) + Σ M − Σ loads... = 0
        const coefs = unk.map((u) => (u.s.x < hg.x - 1e-12 ? (u.kind === 'R' ? hg.x - u.s.x : 1) : 0));
        let known = 0;
        for (const l of model.loads) {
          if (l.type === 'point' && l.x < hg.x) known -= l.P * (hg.x - l.x);
          if (l.type === 'moment' && l.x < hg.x) known += l.C;
          if (l.type === 'dist') { const r = BeamSolver.distResultant(l, l.a, hg.x); known -= r.W * (hg.x - r.xbar); }
        }
        show(coefs, -known, `${i('M')} = 0 at hinge ${hg.label} (forces to its left)`);
      });
      h.push(`</ol>`);
    } else {
      const nUnk = cls.nVert;
      h.push(`<p>There are ${nUnk} unknown vertical reactions${nF ? ' and moments' : ''}, but statics gives only ${2 + cls.c} equations (Σ${i('F')}<sub>y</sub> = 0, Σ${i('M')} = 0${cls.c ? `, and ${i('M')} = 0 at each hinge` : ''}). The other ${cls.dv > 1 ? `${cls.dv} equations come` : 'equation comes'} from <b>compatibility</b>: the deflection is zero at every support${nF ? ' and the slope is zero at every fixed support' : ''}. Step ${dists.length ? 6 : 5}, Macaulay's method, writes those conditions out and solves everything together. The results are:</p>`);
    }
    // results table
    h.push(`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Support</th><th>Type</th><th>Vertical reaction</th><th>Moment reaction</th></tr></thead><tbody>`);
    res.supports.forEach((s) => {
      const R = clean(s.R, Vs), Mv = s.M == null ? null : clean(s.M, Ms);
      h.push(`<tr><td><b>${s.label}</b> (${X} = ${n2(s.x)} m)</td><td>${typeName[s.type]}</td><td>${R_(s)} = <b>${n2(R)} kN</b> ${Math.abs(R) > 0 ? arrowR(R) : ''}</td><td>${Mv == null ? '—' : `${M_(s)} = <b>${n2(Mv)} kN·m</b> ${Math.abs(Mv) > 0 ? rot(Mv) : ''}`}</td></tr>`);
    });
    h.push(`</tbody></table></div>`);
    const sumR = res.supports.reduce((a, s) => a + s.R, 0);
    h.push(`<p class="check">Check: Σ${i('F')}<sub>y</sub> = ${res.supports.map((s) => n2(clean(s.R, Vs))).join(' + ').replace(/\+ −/g, MINUS + ' ')} ${MINUS} ${n2(total)} = ${n2(clean(sumR - total, Vs))} ✓</p>`);
    h.push(`</section>`);

    /* 4 — V and M */
    const secVM = secN++;
    h.push(`<section class="sol"><h3><span class="n">${secVM}</span>Shear force and bending moment</h3>`);
    h.push(`<p>Cut the beam at a distance ${X} from the left end and look at the part to the <b>left</b> of the cut. ${i('V')} is the sum of the vertical forces on that part (upward +); ${i('M')} is the sum of their moments about the cut (clockwise +, i.e. sagging +). With Macaulay brackets (${mac(1, 1).replace('1', i('a'))} is zero while ${X} &lt; ${i('a')}), one expression covers the whole beam:</p>`);
    h.push(EQ(`${i('V')}(${X}) = ${macaulayHtml(res, 'V', false)}`));
    h.push(EQ(`${i('M')}(${X}) = ${macaulayHtml(res, 'M', false)}`));
    if (res.loads.some((l) => l.type === 'dist' && l.b < L - 1e-9)) h.push(`<p class="note">A distributed load that stops before the end of the beam is written as a load running to the end, plus an equal and opposite load starting where the real one stops. That is why some terms appear with the opposite sign.</p>`);
    h.push(`<p>Written out segment by segment (this is also the data behind the diagrams):</p>`);
    h.push(`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Segment (m)</th><th>Load on segment</th><th>${i('V')}(${X}) kN</th><th>${i('M')}(${X}) kN·m</th><th>${i('V')} at ends</th><th>${i('M')} at ends</th></tr></thead><tbody>`);
    res.segments.forEach((sg) => {
      const q = Math.abs(sg.q0) < 1e-12 && Math.abs(sg.q1) < 1e-12 ? 'none' : Math.abs(sg.q0 - sg.q1) < 1e-12 ? `${i('w')} = ${n2(sg.q0)} kN/m` : `${i('w')}: ${n2(sg.q0)} → ${n2(sg.q1)} kN/m`;
      const V0 = clean(res.V(sg.x0, 'R'), Vs), V1 = clean(res.V(sg.x1, 'L'), Vs), M0 = clean(res.M(sg.x0, 'R'), Ms), M1 = clean(res.M(sg.x1, 'L'), Ms);
      h.push(`<tr><td>${n2(sg.x0)} &lt; ${X} &lt; ${n2(sg.x1)}</td><td>${q}</td><td>${polyHtml(segPoly(res, 'V', sg.x0, sg.x1), Vs)}</td><td>${polyHtml(segPoly(res, 'M', sg.x0, sg.x1), Ms)}</td><td>${n2(V0)} → ${n2(V1)}</td><td>${n2(M0)} → ${n2(M1)}</td></tr>`);
    });
    h.push(`</tbody></table></div></section>`);

    /* 5 — key values */
    h.push(`<section class="sol"><h3><span class="n">${secN++}</span>Key values</h3><ul class="keys">`);
    const ex = res.extremes;
    const where = (x, side) => `${X} = ${n2(x)} m`;
    const vmx = clean(ex.Vmax.v, Vs), vmn = clean(ex.Vmin.v, Vs);
    const vBig = Math.abs(vmx) >= Math.abs(vmn) ? ex.Vmax : ex.Vmin;
    const atJump = res.events.some((e) => Math.abs(e.x - vBig.x) < 1e-7 * L && Math.abs(e.VL - e.VR) > 1e-9 * Math.max(1, Vs));
    const sideTxt = atJump ? (vBig.side === 'L' ? ' (just to the left)' : ' (just to the right)') : '';
    h.push(`<li><span>Largest shear force</span><span><b>${n2(clean(vBig.v, Vs))} kN</b> at ${where(vBig.x)}${sideTxt}</span></li>`);
    const mmx = clean(ex.Mmax.v, Ms), mmn = clean(ex.Mmin.v, Ms);
    const whyM = (x) => {
      const z = res.zeroShear.find((zz) => Math.abs(zz.x - x) < 1e-7 * L);
      if (z) return `where ${i('V')} = 0`;
      const e = res.shearSignAtEvents.find((zz) => Math.abs(zz.x - x) < 1e-7 * L);
      if (e) return `where ${i('V')} changes sign`;
      if (res.supports.some((s) => Math.abs(s.x - x) < 1e-7 * L)) return 'at a support';
      return 'at a load point';
    };
    h.push(`<li><span>Maximum sagging moment</span><span>${mmx > 0 ? `<b>${n2(mmx)} kN·m</b> at ${where(ex.Mmax.x)} (${whyM(ex.Mmax.x)})` : '<b>none</b> (the beam never sags)'}</span></li>`);
    h.push(`<li><span>Maximum hogging moment</span><span>${mmn < 0 ? `<b>${n2(mmn)} kN·m</b> at ${where(ex.Mmin.x)} (${whyM(ex.Mmin.x)})` : '<b>none</b> (the beam never hogs)'}</span></li>`);
    const zs = res.zeroShear.map((z) => n2(z.x) + ' m');
    if (zs.length) h.push(`<li><span>Zero shear</span><span>${X} = ${zs.join(', ')}</span></li>`);
    const cf = res.contraflexure.filter((c) => !c.jump);
    h.push(`<li><span>Points of contraflexure</span><span>${cf.length ? cf.map((c) => `${X} = <b>${n2(c.x)} m</b>${c.atHinge ? ', at the hinge' : ''}`).join('; ') + `. ${i('M')} changes sign ${cf.length > 1 ? 'at each' : 'here'}.` : 'none'}</span></li>`);
    const jumps = res.contraflexure.filter((c) => c.jump);
    if (jumps.length) h.push(`<li><span>Sign change by a jump</span><span>${jumps.map((c) => `${X} = ${n2(c.x)} m`).join(', ')} (a couple flips the sign of ${i('M')})</span></li>`);
    h.push(`</ul></section>`);

    /* 6 — deflection */
    const EI = res.EI;
    h.push(`<section class="sol"><h3><span class="n">${secN++}</span>Slope and deflection by Macaulay's method</h3>`);
    const symbolic = cls.dv > 0;
    h.push(`<p>Start from the equation of the elastic curve (${i('y')} measured upward, so a downward deflection is negative):</p>`);
    h.push(EQ(`${i('EI')} ${U.frac(`d<sup>2</sup>${i('y')}`, `d${X}<sup>2</sup>`)} = ${i('M')}(${X}) = ${macaulayHtml(res, 'M', symbolic)}`));
    h.push(`<p>Integrate twice, treating each bracket as a single variable: ∫⟨${X} − ${i('a')}⟩<sup>${i('n')}</sup>d${X} = ⟨${X} − ${i('a')}⟩<sup>${i('n')}+1</sup>/(${i('n')}+1).${res.hinges.length ? ` At a hinge the slope may jump, so each hinge adds a term ${sym('Δ', 'H')}⟨${X} − ${i('h')}⟩<sup>0</sup> to the slope.` : ''}</p>`);
    h.push(EQ(`${i('EI')} ${U.frac(`d${i('y')}`, `d${X}`)} = ${macaulayHtml(res, 'T', symbolic)}`));
    h.push(EQ(`${i('EI')} ${i('y')} = ${macaulayHtml(res, 'Y', symbolic)}`));
    h.push(`<p><b>Boundary conditions.</b> ${symbolic ? 'Together with the two equilibrium equations' + (res.hinges.length ? ' and the hinge conditions' : '') + ', these give one equation per unknown:' : 'The deflection is zero at every support' + (nF ? ' and the slope is zero at a fixed support' : '') + ':'}</p><ol class="eqlist">`);
    res.supports.forEach((s) => {
      const r = substituted(res, 'Y', s.x, symbolic);
      h.push(`<li>At ${s.label} (${X} = ${n2(s.x)} m), ${i('y')} = 0:&nbsp; ${r.str} = 0</li>`);
      if (s.type === 'fixed') { const t = substituted(res, 'T', s.x, symbolic); h.push(`<li>At ${s.label}, d${i('y')}/d${X} = 0:&nbsp; ${t.str} = 0</li>`); }
    });
    if (symbolic) {
      res.eqs.forEach((eq) => {
        if (eq.kind === 'SFy') h.push(`<li>Σ${i('F')}<sub>y</sub> = 0:&nbsp; ${eqRowHtml(res, eq, Vs)}</li>`);
        if (eq.kind === 'SM') h.push(`<li>Σ${i('M')} = 0 about the right end (clockwise +):&nbsp; ${eqRowHtml(res, eq, Ms)}</li>`);
        if (eq.kind === 'hinge') h.push(`<li>${i('M')} = 0 at hinge ${eq.h.label}:&nbsp; ${eqRowHtml(res, eq, Ms)}</li>`);
      });
    }
    h.push(`</ol>`);
    const cons = [`${sym('C', 1)} = <b>${n2(clean(res.C1, res.scales.T))}</b>`, `${sym('C', 2)} = <b>${n2(clean(res.C2, res.scales.Y))}</b>`];
    res.hinges.forEach((hg) => cons.push(`${sym('Δ', hg.label)} = <b>${n2(clean(hg.D, res.scales.T))}</b>`));
    if (symbolic) res.supports.forEach((s) => { cons.push(`${R_(s)} = <b>${n2(clean(s.R, Vs))}</b>`); if (s.type === 'fixed') cons.push(`${M_(s)} = <b>${n2(clean(s.M, Ms))}</b>`); });
    h.push(`<p>Solving:</p>` + EQ(cons.join(',&nbsp;&nbsp; ')));

    const yUnit = (v) => (perEI ? `${n2(v)}/${i('EI')} m` : `${n2(v / EI * 1000)} mm`);
    const lo = ex.Ymin, hi = ex.Ymax;
    h.push(`<p><b>Results</b> (${i('EI')} = ${fmt(EI, 0)} kN·m²):</p><ul class="keys">`);
    const yLine = (e, label) => {
      const v = clean(e.v, res.scales.Y);
      const byZero = res.zeroSlope.some((z) => Math.abs(z.x - e.x) < 1e-7 * L);
      h.push(`<li><span>${label}</span><span><b>${n2(Math.abs(v / EI * 1000))} mm ${v < 0 ? 'down' : 'up'}</b> at ${X} = ${n2(e.x)} m${byZero ? ` (where d${i('y')}/d${X} = 0)` : ''}. ${i('EI')}&thinsp;${i('y')} = ${n2(v)} kN·m³, so ${i('y')} = ${n2(v)}/${i('EI')}.</span></li>`);
    };
    if (lo && lo.v < -1e-9 * Math.max(1, res.scales.Y)) yLine(lo, 'Maximum downward deflection');
    if (hi && hi.v > 1e-9 * Math.max(1, res.scales.Y)) yLine(hi, 'Maximum upward deflection');
    if (!(lo && lo.v < -1e-9 * Math.max(1, res.scales.Y)) && !(hi && hi.v > 1e-9 * Math.max(1, res.scales.Y))) h.push(`<li><span>Deflection</span><span>zero everywhere</span></li>`);
    res.supports.filter((s) => s.type !== 'fixed').forEach((s) => {
      const tR = res.EIt(s.x, 'R');
      h.push(`<li><span>Slope at ${s.label}</span><span>${i('θ')}<sub>${s.label}</sub> = ${n2(clean(tR, res.scales.T))}/${i('EI')} = <b>${fmt(tR / EI, 5)} rad</b> (${fmt(tR / EI * 180 / Math.PI, 3)}°)</span></li>`);
    });
    [0, L].filter((x) => !res.supports.some((s) => Math.abs(s.x - x) < 1e-9)).forEach((x) => {
      const v = clean(res.EIy(x), res.scales.Y);
      h.push(`<li><span>Free end, ${X} = ${n2(x)} m</span><span>${i('y')} = ${n2(v)}/${i('EI')} = <b>${n2(v / EI * 1000)} mm</b>, slope ${fmt(res.EIt(x, x < 1e-9 ? 'R' : 'L') / EI, 5)} rad</span></li>`);
    });
    h.push(`</ul></section>`);

    /* 7 — checks */
    h.push(`<section class="sol"><h3><span class="n">${secN++}</span>Checks</h3><p>Every condition is substituted back into the solution:</p><ul class="checks">`);
    res.residuals.forEach((r) => h.push(`<li>${esc(r.label)} <span>residual ${Math.abs(r.value) / r.scale < 1e-9 ? '0' : Math.abs(r.value).toExponential(1)}</span> ✓</li>`));
    h.push(`<li>Diagrams close: ${i('V')}(${n2(L)}⁺) = ${n2(clean(res.V(L, 'R'), Vs))}, ${i('M')}(${n2(L)}⁺) = ${n2(clean(res.M(L, 'R'), Ms))} ✓</li>`);
    h.push(`</ul></section>`);
    return h.join('');
  }

  /* ================= STEP-BY-STEP WALKTHROUGH ================= */
  function steps(res) {
    const out = [];
    const L = res.L, Vs = res.scales.V, Ms = res.scales.M;
    const tolV = 1e-9 * Math.max(1, Vs), tolM = 1e-9 * Math.max(1, Ms);
    const c = (v, s) => U.clean(v, s);
    out.push({
      title: 'Start at the left end',
      html: `<p>Walk along the beam from left to right. At each point ask: <i>what do the forces on the left do?</i> Before the beam begins nothing has acted yet, so ${i('V')} = 0 and ${i('M')} = 0.</p><p class="rule">Rules used at every step: a point force makes ${i('V')} jump by its size; a couple makes ${i('M')} jump by its size; along the beam d${i('V')}/d${X} = −${i('w')} and d${i('M')}/d${X} = ${i('V')}, so the change in ${i('M')} equals the area under the SFD.</p>`,
      reveal: 0, focus: null,
    });
    res.events.forEach((e, k) => {
      const seg = res.segments[k];
      const bits = [];
      let pointForce = false;
      for (const it of e.items) {
        if (it.kind === 'support') {
          const s = it.ref;
          if (Math.abs(s.R) > tolV) { bits.push(`Support <b>${s.label}</b> pushes ${s.R > 0 ? 'up' : 'down'} with ${n2(Math.abs(s.R))} kN, so ${i('V')} ${s.R > 0 ? 'jumps up' : 'drops'} by ${n2(Math.abs(s.R))}.`); pointForce = true; }
          else bits.push(`Support <b>${s.label}</b> carries no load here (${R_(s)} = 0).`);
          if (s.type === 'fixed' && Math.abs(s.M) > tolM) bits.push(`The fixed support also applies a ${n2(Math.abs(s.M))} kN·m ${s.M > 0 ? 'clockwise' : 'anticlockwise'} moment, so ${i('M')} ${s.M > 0 ? 'jumps up' : 'drops'} by ${n2(Math.abs(s.M))}${s.M < 0 && k === 0 ? ' and the beam starts out hogging' : ''}.`);
        } else if (it.kind === 'point' && Math.abs(it.ref.P) > 0) {
          bits.push(`A ${n2(Math.abs(it.ref.P))} kN load acts ${it.ref.P > 0 ? 'down' : 'up'}, so ${i('V')} ${it.ref.P > 0 ? 'drops' : 'rises'} by ${n2(Math.abs(it.ref.P))}.`); pointForce = true;
        } else if (it.kind === 'moment' && Math.abs(it.ref.C) > 0) {
          bits.push(`A ${n2(Math.abs(it.ref.C))} kN·m ${it.ref.C > 0 ? 'clockwise' : 'anticlockwise'} couple makes ${i('M')} ${it.ref.C > 0 ? 'jump up' : 'drop'} by ${n2(Math.abs(it.ref.C))}. A couple has no vertical force, so ${i('V')} is unchanged.`);
        } else if (it.kind === 'hinge') {
          bits.push(`Hinge <b>${it.ref.label}</b>: a hinge cannot carry a moment, so ${i('M')} must be zero here. Check: ${i('M')} = ${n2(c(e.ML, Ms))} ✓. The deflected shape can have a kink here.`);
        } else if (it.kind === 'distStart') {
          bits.push(`A distributed load (${n2(Math.abs(it.ref.w1))}${Math.abs(it.ref.w1 - it.ref.w2) > 1e-12 ? ' → ' + n2(Math.abs(it.ref.w2)) : ''} kN/m) starts here.`);
        } else if (it.kind === 'distEnd') {
          bits.push(`The distributed load ends here.`);
        }
      }
      const VL = c(e.VL, Vs), VR = c(e.VR, Vs), ML = c(e.ML, Ms), MR = c(e.MR, Ms);
      let pt = '';
      if (bits.length) pt += `<p>${bits.join(' ')}</p>`;
      const vJump = Math.abs(VR - VL) > tolV, mJump = Math.abs(MR - ML) > tolM;
      pt += `<p class="vals"><span class="k q-v"></span>${i('V')}: ${vJump ? `${n2(VL)} → <b>${n2(VR)}</b> kN` : `<b>${n2(VR)}</b> kN (no jump)`}&emsp;<span class="k q-m"></span>${i('M')}: ${mJump ? `${n2(ML)} → <b>${n2(MR)}</b> kN·m` : `<b>${n2(MR)}</b> kN·m (no jump${pointForce && k > 0 && k < res.events.length - 1 ? '; the BMD has a corner here because its slope, V, changes' : ''})`}</p>`;
      if (k > 0 && k < res.events.length - 1 && VL * VR < 0) pt += `<p>${i('V')} changes sign here (from ${VL > 0 ? 'positive to negative' : 'negative to positive'}), so ${i('M')} has a local ${VL > 0 ? 'maximum' : 'minimum'} at this point: ${i('M')} = <b>${n2(MR)} kN·m</b>.</p>`;

      if (seg) {
        const len = seg.x1 - seg.x0;
        const V0 = c(res.V(seg.x0, 'R'), Vs), V1 = c(res.V(seg.x1, 'L'), Vs), M0 = c(res.M(seg.x0, 'R'), Ms), M1 = c(res.M(seg.x1, 'L'), Ms);
        const dM = M1 - M0;
        let st = '';
        if (Math.abs(seg.q0) < 1e-12 && Math.abs(seg.q1) < 1e-12) {
          st = `<p>From ${X} = ${n2(seg.x0)} to ${n2(seg.x1)} m there is <b>no load</b>, so d${i('V')}/d${X} = 0: the SFD is flat at ${n2(V0)} kN. The BMD is therefore a <b>straight line</b> with slope ${n2(V0)}. ${i('M')} changes by the area under the SFD, ${n2(V0)} × ${n2(len)} = ${n2(c(dM, Ms))}, going from ${n2(M0)} to <b>${n2(M1)} kN·m</b>.</p>`;
        } else if (Math.abs(seg.q0 - seg.q1) < 1e-12) {
          st = `<p>From ${X} = ${n2(seg.x0)} to ${n2(seg.x1)} m a <b>uniform load</b> ${i('w')} = ${n2(seg.q0)} kN/m acts, so d${i('V')}/d${X} = −${n2(seg.q0)}: the SFD is a <b>sloping straight line</b> from ${n2(V0)} to ${n2(V1)} kN (a change of −${n2(seg.q0)} × ${n2(len)}). The BMD is a <b>parabola</b>. ${i('M')} changes by the area under the SFD, ½(${n2(V0)} ${V1 < 0 ? MINUS : '+'} ${n2(Math.abs(V1))}) × ${n2(len)} = ${n2(c(dM, Ms))}, going from ${n2(M0)} to <b>${n2(M1)} kN·m</b>.</p>`;
        } else {
          st = `<p>From ${X} = ${n2(seg.x0)} to ${n2(seg.x1)} m the load <b>varies linearly</b> from ${n2(seg.q0)} to ${n2(seg.q1)} kN/m, so the SFD is a <b>parabola</b> (${i('V')}: ${n2(V0)} → ${n2(V1)} kN, a change equal to minus the load's area) and the BMD is a <b>cubic</b>. ${i('M')} changes by the area under the SFD, ${n2(c(dM, Ms))}, going from ${n2(M0)} to <b>${n2(M1)} kN·m</b>.</p>`;
        }
        (seg.zeroShear || []).forEach((z) => {
          const before = res.V(z.x - 1e-6 * L), turn = before > 0 ? 'maximum' : 'minimum';
          st += `<p>${i('V')} crosses zero at ${X} = <b>${n2(z.x)} m</b>, so ${i('M')} has a local ${turn} there: ${i('M')} = <b>${n2(c(z.M, Ms))} kN·m</b>.</p>`;
        });
        out.push({ title: `${X} = ${n2(seg.x0)} → ${n2(seg.x1)} m`, html: pt + st, reveal: seg.x1, focus: [seg.x0, seg.x1], at: e.x });
      } else {
        const closes = Math.abs(VR) <= 1e-7 * Math.max(1, Vs) && Math.abs(MR) <= 1e-7 * Math.max(1, Ms);
        out.push({ title: `Right end, ${X} = ${n2(e.x)} m`, html: pt + `<p>${closes ? `After the last force ${i('V')} = 0 and ${i('M')} = 0: <b>both diagrams close at zero</b>. That confirms the reactions are right and the beam is in equilibrium ✓.` : 'The diagrams do not close, so the reactions are wrong.'}</p>`, reveal: L, focus: [Math.max(0, e.x - L * 0.004), e.x], at: e.x });
      }
    });
    return out;
  }

  /* ================= SECTION CUT: free body of the left part ================= */
  function section(res, model, xc, width) {
    const L = res.L;
    const eps = 1e-9 * L;
    const Vs = res.scales.V, Ms = res.scales.M;
    const inc = (x) => x <= xc + eps; // forces at the cut are included (just right of it)
    const Fy = [], Mt = [];
    res.supports.forEach((s) => {
      if (!inc(s.x)) return;
      Fy.push({ val: s.R, html: R_(s), num: n2(Math.abs(s.R)) });
      Mt.push({ val: s.R * (xc - s.x), html: `${R_(s)}(${n2(xc - s.x)})`, num: `${n2(Math.abs(s.R))} × ${n2(xc - s.x)}` });
      if (s.type === 'fixed') Mt.push({ val: s.M, html: M_(s), num: n2(Math.abs(s.M)) });
    });
    const drawLoads = [];
    model.loads.forEach((l) => {
      if (l.type === 'point' && inc(l.x)) { Fy.push({ val: -l.P, num: n2(Math.abs(l.P)) }); Mt.push({ val: -l.P * (xc - l.x), num: `${n2(Math.abs(l.P))} × ${n2(xc - l.x)}` }); drawLoads.push(l); }
      if (l.type === 'moment' && inc(l.x)) { Mt.push({ val: l.C, num: n2(Math.abs(l.C)) }); drawLoads.push(l); }
      if (l.type === 'dist' && l.a < xc - eps) {
        const r = BeamSolver.distResultant(l, l.a, xc);
        Fy.push({ val: -r.W, num: `${n2(Math.abs(r.W))}` });
        Mt.push({ val: -r.W * (xc - r.xbar), num: `${n2(Math.abs(r.W))} × ${n2(xc - r.xbar)}` });
        drawLoads.push({ ...l, b: Math.min(l.b, xc), w2: r.wb, part: r });
      }
    });
    const V = res.V(xc, 'R'), M = res.M(xc, 'R');
    const sumF = Fy.reduce((a, t) => a + t.val, 0), sumM = Mt.reduce((a, t) => a + t.val, 0);
    const js = (arr) => (arr.length ? arr.map((t, k) => (k === 0 ? (t.val < 0 ? MINUS : '') : pm(t.val)) + t.num).join('') : '0');

    /* SVG free body */
    const W = Math.max(280, width || 520), H = 170;
    const padL = 26, padR = 118;
    const seg = Math.max(xc, 1e-6);
    const Xs = (x) => padL + (x / seg) * (W - padL - padR);
    const top = 78, bot = 88, mid = 83;
    const p = [];
    const hatchEnd = Xs(xc);
    p.push(`<rect class="beam" x="${padL}" y="${top}" width="${Math.max(2, hatchEnd - padL)}" height="10" rx="1.5"/>`);
    p.push(`<path class="cut-face" d="M${hatchEnd},${top - 8}l3,5l-6,5l6,5l-6,5l3,5"/>`);
    const wMax = Math.max(1e-9, ...drawLoads.filter((l) => l.type === 'dist').map((l) => Math.max(Math.abs(l.w1), Math.abs(l.w2))));
    const lbl = [];
    drawLoads.forEach((l) => {
      if (l.type === 'dist') {
        const xa = Xs(l.a), xb = Xs(l.b), h1 = 8 + 22 * Math.abs(l.w1) / wMax, h2 = 8 + 22 * Math.abs(l.w2) / wMax;
        p.push(`<path class="ld-fill" d="M${xa},${top}L${xa},${top - h1}L${xb},${top - h2}L${xb},${top}Z"/><path class="ld-line" fill="none" d="M${xa},${top - h1}L${xb},${top - h2}"/>`);
        lbl.push({ px: (xa + xb) / 2, py: top - Math.max(h1, h2), text: `${n2(Math.abs(l.part.W))} kN (resultant of this part)`, pri: 1, pref: 'above' });
      } else if (l.type === 'point') {
        const x = Xs(l.x);
        if (l.P >= 0) { p.push(`<line class="ld-line" x1="${x}" y1="${top - 36}" x2="${x}" y2="${top - 5}"/>` + Draw.arrowHead(x, top - 0.5, 0, 1, 7, 'ld-head')); lbl.push({ px: x, py: top - 36, text: `${n2(l.P)} kN`, pri: 2, pref: 'above' }); }
        else { p.push(`<line class="ld-line" x1="${x}" y1="${bot + 36}" x2="${x}" y2="${bot + 5}"/>` + Draw.arrowHead(x, bot + 0.5, 0, -1, 7, 'ld-head')); lbl.push({ px: x, py: bot + 36, text: `${n2(-l.P)} kN`, pri: 2, pref: 'below' }); }
      } else if (l.type === 'moment') {
        p.push(Draw.arcArrow(Xs(l.x), mid, 14, l.C >= 0, 'ld-line', 'ld-head'));
        lbl.push({ px: Xs(l.x), py: mid - 16, text: `${n2(Math.abs(l.C))} kN·m`, pri: 2, pref: 'above' });
      }
    });
    res.supports.forEach((s) => {
      if (!inc(s.x)) return;
      const x = Xs(s.x);
      if (Math.abs(s.R) > 1e-9 * Math.max(1, Vs)) {
        if (s.R > 0) p.push(`<line class="rx-line" x1="${x}" y1="${bot + 38}" x2="${x}" y2="${bot + 6}"/>` + Draw.arrowHead(x, bot + 1, 0, -1, 7, 'rx-head'));
        else p.push(`<line class="rx-line" x1="${x}" y1="${bot + 2}" x2="${x}" y2="${bot + 32}"/>` + Draw.arrowHead(x, bot + 38, 0, 1, 7, 'rx-head'));
        lbl.push({ px: x, py: bot + 38, text: `R${s.label} = ${n2(Math.abs(s.R))} kN`, pri: 3, pref: 'below' });
      }
      if (s.type === 'fixed' && Math.abs(s.M) > 1e-9 * Math.max(1, Ms)) {
        p.push(Draw.arcArrow(x + 18, mid, 13, s.M > 0, 'rx-line', 'rx-head', { a0: 200, a1: 340 }));
        lbl.push({ px: x + 18, py: mid - 15, text: `M${s.label} = ${n2(Math.abs(s.M))} kN·m`, pri: 3, pref: 'above' });
      }
    });
    // internal forces at the cut, drawn in their POSITIVE directions
    const cx = hatchEnd + 8;
    p.push(`<line class="int-line" x1="${cx}" y1="${bot + 2}" x2="${cx}" y2="${bot + 34}"/>` + Draw.arrowHead(cx, bot + 38, 0, 1, 7, 'int-head'));
    p.push(Draw.arcArrow(cx, mid, 20, false, 'int-line', 'int-head', { a0: 250, a1: 430 }));
    p.push(`<text class="lbl b int" x="${cx + 26}" y="${mid - 10}">M = ${n2(U.clean(M, Ms))} kN·m</text>`);
    p.push(`<text class="lbl b int" x="${cx + 10}" y="${bot + 36}">V = ${n2(U.clean(V, Vs))} kN</text>`);
    const intBoxes = [
      { x0: cx + 22, x1: W, y0: mid - 24, y1: mid - 4 },
      { x0: cx + 6, x1: W, y0: bot + 24, y1: bot + 40 },
      { x0: padL, x1: hatchEnd, y0: top, y1: bot },
    ];
    const labelsSvg = Draw.placeLabels(lbl.map((l) => ({ ...l, force: l.pri >= 3, cls: l.pri >= 3 ? 'rx' : '' })), { x0: 2, x1: W - 2, y0: 2, y1: H - 2 }, intBoxes).map(Draw.labelSvg).join('');
    const svg = `<svg class="fbd" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Free-body diagram of the beam to the left of the cut">${p.join('')}${labelsSvg}</svg>`;

    const html = `<p>Everything to the left of the cut, plus the internal shear ${i('V')} and moment ${i('M')} at the cut. They are drawn in their <b>positive</b> directions: ${i('V')} down and ${i('M')} anticlockwise on this face, which means sagging.</p>` +
      EQ(`Σ${i('F')}<sub>y</sub> = 0 (↑ +):&nbsp; ${js(Fy)} ${MINUS} ${i('V')} = 0&nbsp; ⇒&nbsp; ${i('V')}`, `<b>${n2(U.clean(sumF, Vs))} kN</b>`) +
      EQ(`Σ${i('M')}<sub>cut</sub> = 0:&nbsp; ${i('M')} = ${js(Mt)}`, `<b>${n2(U.clean(sumM, Ms))} kN·m</b>`) +
      `<p class="note">${i('M')} is the sum of the clockwise moments of the left-hand forces about the cut. The right-hand part gives the same ${i('V')} and ${i('M')}, acting in the opposite directions on its face (Newton's third law).${Math.abs(sumF - V) > 1e-6 * Math.max(1, Vs) || Math.abs(sumM - M) > 1e-6 * Math.max(1, Ms) ? ' ⚠ mismatch' : ''}</p>`;
    return { svg, html, V, M };
  }

  return { solution, steps, section, loadWords, segPoly, polyHtml, macaulayHtml };
})();
