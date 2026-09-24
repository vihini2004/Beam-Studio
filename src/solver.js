/* =====================================================================
   Beam solver — Macaulay's method (singularity functions), exact.
   Works for statically determinate AND indeterminate beams, any mix of
   roller / simple / pinned / fixed supports, internal hinges, point loads,
   linearly varying distributed loads (UDL, triangle, trapezoid) and couples.

   Conventions (stated once, used everywhere)
   • x runs from the left end (x = 0) to the right end (x = L), metres.
   • Point loads P and load intensities w are positive DOWNWARD (kN, kN/m).
   • Reactions R are positive UPWARD.
   • Couples C and support reaction moments are positive CLOCKWISE (kN·m).
   • Shear V(x): resultant of all vertical forces LEFT of the section,
     upward positive (left part tends to move up relative to the right part).
   • Bending moment M(x): moment about the section of all forces LEFT of it,
     clockwise positive  →  sagging (smile) is positive.
   • Elastic curve: EI y'' = M(x) with y measured UPWARD (so a sagging
     beam deflects downward: y < 0).
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BeamSolver = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUPPORT_TYPES = {
    pinned: { name: 'Pinned support', short: 'Pin', r: 2, rotation: false, horizontal: true },
    roller: { name: 'Roller support', short: 'Roller', r: 1, rotation: false, horizontal: false },
    simple: { name: 'Simple support', short: 'Simple', r: 1, rotation: false, horizontal: false },
    fixed: { name: 'Fixed support', short: 'Fixed', r: 3, rotation: true, horizontal: true },
  };

  const FACT = [1, 1, 2, 6, 24, 120, 720];

  /* Macaulay bracket <x − a>^n. For n = 0 it is a unit step; exactly at x = a
     the side decides: 'R' (just right of a) → 1, 'L' (just left) → 0.        */
  function mac(x, a, n, side, eps) {
    const d = x - a;
    if (n === 0) {
      if (d > eps) return 1;
      if (d < -eps) return 0;
      return side === 'R' ? 1 : 0;
    }
    return d > 0 ? Math.pow(d, n) : 0;
  }

  /* A "moment term" contributes  base·<x − a>^m / m!  to M(x).
     Differentiate once for V, integrate for EIθ and EIy.                   */
  function termQ(base, a, m, q, x, side, eps) {
    switch (q) {
      case 'V': return m >= 1 ? base * mac(x, a, m - 1, side, eps) / FACT[m - 1] : 0;
      case 'M': return base * mac(x, a, m, side, eps) / FACT[m];
      case 'T': return base * mac(x, a, m + 1, side, eps) / FACT[m + 1];
      case 'Y': return base * mac(x, a, m + 2, side, eps) / FACT[m + 2];
      default: return 0;
    }
  }

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function num(v, d) { const x = Number(v); return Number.isFinite(x) ? x : d; }

  /* ---------- normalise the model (clamp, sort, label) ---------- */
  function prepare(model) {
    const L = Math.max(0.1, num(model.L, 10));
    const eps = 1e-9 * Math.max(1, L);
    const warnings = [];
    const clampX = (x) => Math.min(L, Math.max(0, num(x, 0)));

    const supports = (model.supports || []).map((s) => ({ ...s, x: clampX(s.x) }))
      .sort((p, q) => p.x - q.x)
      .map((s, i) => ({ ...s, label: LETTERS[i % 26] + (i >= 26 ? Math.floor(i / 26) : '') }));
    const hinges = (model.hinges || []).map((h) => ({ ...h, x: clampX(h.x) }))
      .sort((p, q) => p.x - q.x)
      .map((h, i) => ({ ...h, label: 'H' + (i + 1) }));

    const loads = [];
    for (const l of model.loads || []) {
      if (l.type === 'point') {
        loads.push({ ...l, x: clampX(l.x), P: num(l.P, 0) });
      } else if (l.type === 'moment') {
        loads.push({ ...l, x: clampX(l.x), C: num(l.C, 0) });
      } else if (l.type === 'dist') {
        let a = clampX(l.a), b = clampX(l.b);
        if (b < a) { const t = a; a = b; b = t; }
        if (num(l.b, 0) > L + eps || num(l.a, 0) < -eps) warnings.push('A distributed load ran past the end of the beam; only the part on the beam is used.');
        if (b - a > eps) loads.push({ ...l, a, b, w1: num(l.w1, 0), w2: num(l.w2, 0) });
      }
    }

    const errors = [];
    for (let i = 1; i < supports.length; i++) {
      if (Math.abs(supports[i].x - supports[i - 1].x) <= 1e-6 * L) errors.push(`Two supports sit at the same point (x = ${fmt(supports[i].x)} m). Move one of them or delete it.`);
    }
    for (let i = 0; i < hinges.length; i++) {
      const h = hinges[i];
      if (h.x <= 1e-6 * L || h.x >= L - 1e-6 * L) errors.push(`A hinge at the end of the beam (x = ${fmt(h.x)} m) does nothing. Move it inside the span.`);
      if (i > 0 && Math.abs(h.x - hinges[i - 1].x) <= 1e-6 * L) errors.push(`Two hinges sit at the same point (x = ${fmt(h.x)} m).`);
      for (const s of supports) if (s.type === 'fixed' && Math.abs(s.x - h.x) <= 1e-6 * L) errors.push(`A hinge cannot sit on a fixed support (x = ${fmt(h.x)} m).`);
      for (const l of loads) if (l.type === 'moment' && Math.abs(l.x - h.x) <= 1e-6 * L) warnings.push(`A couple acts exactly at hinge ${h.label}; it is taken to act just to the right of the hinge.`);
    }
    return { L, eps, supports, hinges, loads, errors, warnings };
  }

  /* ---------- terms from applied loads ---------- */
  function loadTerms(loads) {
    const t = [];
    for (const l of loads) {
      if (l.type === 'point') t.push({ base: -l.P, a: l.x, m: 1, src: l });
      else if (l.type === 'moment') t.push({ base: l.C, a: l.x, m: 0, src: l });
      else if (l.type === 'dist') {
        const k = (l.w2 - l.w1) / (l.b - l.a);
        // w(x) = w1<x−a>^0 + k<x−a>^1 − w2<x−b>^0 − k<x−b>^1   (extend-and-cancel)
        t.push({ base: -l.w1, a: l.a, m: 2, src: l });
        if (k !== 0) t.push({ base: -k, a: l.a, m: 3, src: l });
        t.push({ base: l.w2, a: l.b, m: 2, src: l, cancel: true });
        if (k !== 0) t.push({ base: k, a: l.b, m: 3, src: l, cancel: true });
      }
    }
    return t;
  }

  /* ---------- the unknowns ---------- */
  function buildUnknowns(supports, hinges) {
    const u = [];
    supports.forEach((s) => u.push({ kind: 'R', s, a: s.x, m: 1, sym: 'R_' + s.label }));
    supports.forEach((s) => { if (s.type === 'fixed') u.push({ kind: 'MR', s, a: s.x, m: 0, sym: 'M_' + s.label }); });
    u.push({ kind: 'C1', sym: 'C_1' });
    u.push({ kind: 'C2', sym: 'C_2' });
    hinges.forEach((h) => u.push({ kind: 'D', h, a: h.x, sym: 'Δ_' + h.label }));
    return u;
  }

  function unknownQ(uk, q, x, side, eps) {
    switch (uk.kind) {
      case 'R': case 'MR': return termQ(1, uk.a, uk.m, q, x, side, eps);
      case 'C1': return q === 'T' ? 1 : q === 'Y' ? x : 0;
      case 'C2': return q === 'Y' ? 1 : 0;
      case 'D': return q === 'T' ? mac(x, uk.a, 0, side, eps) : q === 'Y' ? mac(x, uk.a, 1, side, eps) : 0;
      default: return 0;
    }
  }

  function knownQ(terms, q, x, side, eps) {
    let s = 0;
    for (const t of terms) s += termQ(t.base, t.a, t.m, q, x, side, eps);
    return s;
  }

  /* ---------- equations ---------- */
  function buildEquations(prep, unknowns, terms) {
    const { L, eps, supports, hinges } = prep;
    const eqs = [];
    const row = (q, x, side) => unknowns.map((uk) => unknownQ(uk, q, x, side, eps));
    const rhs = (q, x, side) => -knownQ(terms, q, x, side, eps);
    eqs.push({ kind: 'SFy', label: 'ΣFy = 0', coef: row('V', L, 'R'), rhs: rhs('V', L, 'R') });
    eqs.push({ kind: 'SM', label: 'ΣM = 0', coef: row('M', L, 'R'), rhs: rhs('M', L, 'R') });
    for (const h of hinges) eqs.push({ kind: 'hinge', h, label: `M = 0 at hinge ${h.label}`, coef: row('M', h.x, 'L'), rhs: rhs('M', h.x, 'L') });
    for (const s of supports) eqs.push({ kind: 'y0', s, label: `y = 0 at ${s.label}`, coef: row('Y', s.x, 'R'), rhs: rhs('Y', s.x, 'R') });
    for (const s of supports) if (s.type === 'fixed') eqs.push({ kind: 't0', s, label: `dy/dx = 0 at ${s.label}`, coef: row('T', s.x, 'R'), rhs: rhs('T', s.x, 'R') });
    return eqs;
  }

  /* Gaussian elimination with row & column equilibration + partial pivoting. */
  function solveLinear(Ain, bin) {
    const n = bin.length;
    const A = Ain.map((r) => r.slice());
    const b = bin.slice();
    const rs = A.map((r) => Math.max(...r.map(Math.abs)) || 1);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] /= rs[i]; b[i] /= rs[i]; }
    const cs = [];
    for (let j = 0; j < n; j++) { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(A[i][j])); cs[j] = m || 1; }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[i][j] /= cs[j];
    let minPivot = Infinity;
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
      if (Math.abs(A[p][k]) < 1e-10) return { singular: true };
      minPivot = Math.min(minPivot, Math.abs(A[p][k]));
      [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]];
      for (let i = k + 1; i < n; i++) {
        const f = A[i][k] / A[k][k];
        if (f === 0) continue;
        for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
        b[i] -= f * b[k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return { singular: false, x: x.map((v, j) => v / cs[j]), minPivot };
  }

  /* ---------- determinacy & stability ---------- */
  function classify(prep, singular) {
    const { supports, hinges } = prep;
    const r = supports.reduce((s, sp) => s + (SUPPORT_TYPES[sp.type] || SUPPORT_TYPES.roller).r, 0);
    const c = hinges.length;
    const nVert = supports.length + supports.filter((s) => s.type === 'fixed').length;
    const dv = nVert - (2 + c);           // vertical/rotational degree of indeterminacy
    const h = supports.filter((s) => SUPPORT_TYPES[s.type] && SUPPORT_TYPES[s.type].horizontal).length;
    const degree = r - (3 + c);
    const out = { r, c, eqs: 3 + c, degree, dv, h, nVert };
    if (!supports.length) {
      return { ...out, status: 'unstable', title: 'No supports', detail: 'Add at least one support. A beam with nothing holding it up cannot be in equilibrium.' };
    }
    if (singular) {
      const detail = dv < 0
        ? `${nVert === 1 ? 'There is only 1 unknown reaction' : `There are only ${nVert} unknown reactions`} (vertical forces${supports.some((s) => s.type === 'fixed') ? ' and moments' : ''}), but ${2 + c} equilibrium equations (ΣFy, ΣM${c ? ` and M = 0 at ${c} hinge${c > 1 ? 's' : ''}` : ''}) must hold. With too few reactions the beam moves as a mechanism.`
        : 'The reactions are numerous enough but badly arranged, so part of the beam can still move as a mechanism. This happens, for example, when a hinge leaves one piece with only one support.';
      return { ...out, status: 'unstable', title: 'Unstable (mechanism)', detail };
    }
    if (h === 0) {
      return {
        ...out, status: 'vertical', title: dv === 0 ? 'Stable for vertical loads only' : `Stable for vertical loads only, indeterminate to degree ${dv}`,
        detail: `No support resists sideways movement: r = ${r}, and every reaction is vertical (parallel). Strictly this makes the beam unstable, since any horizontal force would slide it. Every load here is vertical, though, so ΣFx = 0 holds on its own and the ${nVert} vertical reaction${nVert > 1 ? 's' : ''} can still be found${dv === 0 ? ' from ΣFy = 0 and ΣM = 0' : ' (statics plus compatibility)'}.`,
      };
    }
    if (degree === 0) {
      return { ...out, status: 'determinate', title: 'Statically determinate', detail: c ? `r = ${r} = 3 + ${c}, so ΣFx = 0, ΣFy = 0, ΣM = 0 and ${c} hinge condition${c > 1 ? 's' : ''} (M = 0) are exactly enough to find every reaction.` : `r = 3 matches the three equations ΣFx = 0, ΣFy = 0 and ΣM = 0, so statics alone gives every reaction.` };
    }
    const horizExtra = h - 1;
    let detail = `r = ${r} > 3${c ? ' + ' + c : ''}. Statics alone leaves ${degree} unknown${degree > 1 ? 's' : ''} undetermined.`;
    if (dv === 0 && horizExtra > 0) detail += ` The extra unknown${horizExtra > 1 ? 's are' : ' is'} horizontal (H_A + H_B = 0 cannot split between two pins). The vertical reactions still follow from statics, and with no horizontal load every H = 0.`;
    else detail += ` The extra ${dv > 1 ? `${dv} conditions come` : 'condition comes'} from compatibility: the beam's deflection must be zero at every support${supports.some((s) => s.type === 'fixed') ? ', and its slope zero at every fixed support' : ''}.`;
    return { ...out, status: 'indeterminate', title: `Statically indeterminate (degree ${degree})`, detail };
  }

  /* ---------- helpers for results ---------- */
  /* Number → short string: 2 decimals (trailing zeros trimmed), 2 significant
     figures for tiny values, true minus sign.                                */
  function fmt(v, dp) {
    if (!Number.isFinite(v)) return '—';
    const d = dp == null ? 2 : dp;
    if (Math.abs(v) < 1e-10) return '0';
    let s;
    if (d > 0 && Math.abs(v) < 0.5 * Math.pow(10, -d)) s = String(Number(v.toPrecision(2)));
    else {
      s = v.toFixed(d);
      if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }

  function findRoots(f, x0, x1, n, tol) {
    const roots = [];
    const N = n || 160;
    let px = x0, pf = f(x0 + (x1 - x0) * 1e-9);
    let lastNZx = Math.abs(pf) > tol ? px : null, lastNZs = Math.abs(pf) > tol ? Math.sign(pf) : 0;
    for (let i = 1; i <= N; i++) {
      const x = i === N ? x1 - (x1 - x0) * 1e-9 : x0 + (x1 - x0) * i / N;
      const fx = f(x);
      if (Math.abs(fx) > tol) {
        const s = Math.sign(fx);
        if (lastNZs !== 0 && s !== lastNZs) {
          let lo = lastNZx, hi = x, flo = lastNZs;
          for (let k = 0; k < 80; k++) {
            const mid = 0.5 * (lo + hi), fm = f(mid);
            if (Math.abs(fm) <= tol * 1e-3) { lo = hi = mid; break; }
            if (Math.sign(fm) === flo) lo = mid; else hi = mid;
          }
          roots.push(0.5 * (lo + hi));
        }
        lastNZx = x; lastNZs = s;
      }
      px = x; pf = fx;
    }
    return roots;
  }

  /* ---------- main entry ---------- */
  function solve(model) {
    const prep = prepare(model);
    const { L, eps, supports, hinges, loads } = prep;
    const EI = Math.max(1e-9, num(model.E, 200) * num(model.I, 100)); // kN·m²  (E in GPa × I in 10⁶ mm⁴)
    const base = { L, EI, supports, hinges, loads, warnings: prep.warnings };

    if (prep.errors.length) {
      return { ...base, ok: false, errors: prep.errors, cls: classify(prep, true) };
    }
    const terms = loadTerms(loads);
    const unknowns = buildUnknowns(supports, hinges);
    const eqs = buildEquations(prep, unknowns, terms);
    const sol = solveLinear(eqs.map((e) => e.coef), eqs.map((e) => e.rhs));
    const cls = classify(prep, sol.singular);
    if (sol.singular || !supports.length) {
      return { ...base, ok: false, errors: [], cls, terms, unknowns, eqs };
    }
    const u = sol.x;
    unknowns.forEach((uk, i) => { uk.value = u[i]; });

    // attach reactions
    const sup = supports.map((s) => {
      const R = unknowns.find((k) => k.kind === 'R' && k.s === s).value;
      const mk = unknowns.find((k) => k.kind === 'MR' && k.s === s);
      return { ...s, R, M: mk ? mk.value : null, H: SUPPORT_TYPES[s.type].horizontal ? 0 : null };
    });
    const hin = hinges.map((h) => ({ ...h, D: unknowns.find((k) => k.kind === 'D' && k.h === h).value }));
    const C1 = unknowns.find((k) => k.kind === 'C1').value;
    const C2 = unknowns.find((k) => k.kind === 'C2').value;

    // all moment terms with numeric coefficients (loads + solved reactions)
    const allTerms = terms.slice();
    unknowns.forEach((uk) => { if (uk.kind === 'R' || uk.kind === 'MR') allTerms.push({ base: uk.value, a: uk.a, m: uk.m, src: uk }); });

    const Q = (q, x, side) => {
      let s = knownQ(allTerms, q, x, side || 'R', eps);
      if (q === 'T') { s += C1; for (const h of hin) s += h.D * mac(x, h.x, 0, side || 'R', eps); }
      if (q === 'Y') { s += C1 * x + C2; for (const h of hin) s += h.D * mac(x, h.x, 1, side || 'R', eps); }
      return s;
    };
    const V = (x, side) => Q('V', x, side);
    const M = (x, side) => Q('M', x, side);
    const EIt = (x, side) => Q('T', x, side);
    const EIy = (x) => Q('Y', x, 'R');
    const w = (x) => { // load intensity (kN/m, downward +) at x (right side)
      let s = 0;
      for (const l of loads) if (l.type === 'dist' && x >= l.a && x < l.b) s += l.w1 + (l.w2 - l.w1) * (x - l.a) / (l.b - l.a);
      return s;
    };

    // event points
    const xsSet = [0, L];
    supports.forEach((s) => xsSet.push(s.x));
    hinges.forEach((h) => xsSet.push(h.x));
    loads.forEach((l) => { if (l.type === 'dist') { xsSet.push(l.a, l.b); } else xsSet.push(l.x); });
    xsSet.sort((p, q) => p - q);
    const xs = [];
    for (const x of xsSet) if (!xs.length || x - xs[xs.length - 1] > 1e-7 * L) xs.push(x);

    const events = xs.map((x) => {
      const items = [];
      sup.forEach((s) => { if (Math.abs(s.x - x) <= 1e-7 * L) items.push({ kind: 'support', ref: s }); });
      hin.forEach((h) => { if (Math.abs(h.x - x) <= 1e-7 * L) items.push({ kind: 'hinge', ref: h }); });
      loads.forEach((l) => {
        if (l.type === 'point' && Math.abs(l.x - x) <= 1e-7 * L) items.push({ kind: 'point', ref: l });
        if (l.type === 'moment' && Math.abs(l.x - x) <= 1e-7 * L) items.push({ kind: 'moment', ref: l });
        if (l.type === 'dist' && Math.abs(l.a - x) <= 1e-7 * L) items.push({ kind: 'distStart', ref: l });
        if (l.type === 'dist' && Math.abs(l.b - x) <= 1e-7 * L) items.push({ kind: 'distEnd', ref: l });
      });
      return { x, items, VL: x <= eps ? 0 : V(x, 'L'), VR: x >= L - eps ? 0 : V(x, 'R'), ML: x <= eps ? 0 : M(x, 'L'), MR: x >= L - eps ? 0 : M(x, 'R'), TL: EIt(x, 'L'), TR: EIt(x, 'R'), Y: EIy(x) };
    });
    // exact end values (the free-body just outside the beam is zero; the value just inside is what matters)
    events[0].VR = V(0, 'R'); events[0].MR = M(0, 'R');
    const lastE = events[events.length - 1];
    lastE.VL = V(L, 'L'); lastE.ML = M(L, 'L');

    // load intensity at both ends of a segment: a distributed load either covers
    // a whole segment or none of it (its ends are event points)
    const segQ = (x0, x1) => {
      let q0 = 0, q1 = 0;
      const xm = 0.5 * (x0 + x1);
      for (const l of loads) {
        if (l.type !== 'dist' || !(l.a < xm && l.b > xm)) continue;
        const k = (l.w2 - l.w1) / (l.b - l.a);
        q0 += l.w1 + k * (x0 - l.a); q1 += l.w1 + k * (x1 - l.a);
      }
      return [q0, q1];
    };
    const segments = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1];
      const [q0, q1] = segQ(x0, x1);
      segments.push({ i, x0, x1, q0, q1 });
    }

    // scales & tolerances
    let Vabs = 0, Mabs = 0, Tabs = 0, Yabs = 0;
    for (const sg of segments) {
      for (let k = 0; k <= 24; k++) {
        const x = sg.x0 + (sg.x1 - sg.x0) * (k === 0 ? 1e-9 : k === 24 ? 1 - 1e-9 : k / 24);
        Vabs = Math.max(Vabs, Math.abs(V(x))); Mabs = Math.max(Mabs, Math.abs(M(x)));
        Tabs = Math.max(Tabs, Math.abs(EIt(x))); Yabs = Math.max(Yabs, Math.abs(EIy(x)));
      }
    }
    const tolV = Math.max(1e-9, Vabs * 1e-9), tolM = Math.max(1e-9, Mabs * 1e-9), tolT = Math.max(1e-12, Tabs * 1e-9);

    // per-segment analysis: zero shear, contraflexure, zero slope, load-intensity zero
    const zeroShear = [], contraflexure = [], zeroSlope = [];
    for (const sg of segments) {
      const inner = (f, tol) => findRoots(f, sg.x0, sg.x1, 200, tol).filter((r) => r > sg.x0 + 1e-7 * L && r < sg.x1 - 1e-7 * L);
      inner((x) => V(x), tolV).forEach((x) => zeroShear.push({ x, M: M(x) }));
      inner((x) => M(x), tolM).forEach((x) => contraflexure.push({ x, jump: false }));
      inner((x) => EIt(x), tolT).forEach((x) => zeroSlope.push({ x, EIy: EIy(x) }));
      sg.zeroShear = zeroShear.filter((z) => z.x > sg.x0 && z.x < sg.x1);
    }
    // sign changes exactly at event points (jumps or zero crossings)
    const shearSignAtEvents = [];
    events.forEach((e, i) => {
      if (i === 0 || i === events.length - 1) return;
      if (e.VL * e.VR < 0 || (Math.abs(e.VL) <= tolV && Math.abs(e.VR) > tolV) || (Math.abs(e.VR) <= tolV && Math.abs(e.VL) > tolV)) shearSignAtEvents.push({ x: e.x, M: e.MR, VL: e.VL, VR: e.VR });
      if (e.ML * e.MR < -tolM * tolM && Math.abs(e.ML - e.MR) > tolM) contraflexure.push({ x: e.x, jump: true });
      else if (Math.abs(e.ML) <= tolM && Math.abs(e.MR) <= tolM) {
        // continuous zero crossing exactly at an event point
        const h = 1e-4 * L;
        const a = M(Math.max(0, e.x - h)), b = M(Math.min(L, e.x + h));
        if (a * b < 0) contraflexure.push({ x: e.x, jump: false, atHinge: e.items.some((it) => it.kind === 'hinge') });
      }
    });
    contraflexure.sort((p, q) => p.x - q.x);
    zeroShear.sort((p, q) => p.x - q.x);

    // extremes
    const cand = (arr) => arr.filter((c) => Number.isFinite(c.v));
    const Vc = [], Mc = [], Yc = [], Tc = [];
    events.forEach((e, i) => {
      if (i > 0) { Vc.push({ x: e.x, v: e.VL, side: 'L' }); Mc.push({ x: e.x, v: e.ML, side: 'L' }); Tc.push({ x: e.x, v: e.TL, side: 'L' }); }
      if (i < events.length - 1) { Vc.push({ x: e.x, v: e.VR, side: 'R' }); Mc.push({ x: e.x, v: e.MR, side: 'R' }); Tc.push({ x: e.x, v: e.TR, side: 'R' }); }
      Yc.push({ x: e.x, v: e.Y });
    });
    zeroShear.forEach((z) => Mc.push({ x: z.x, v: z.M, side: 'R' }));
    zeroSlope.forEach((z) => Yc.push({ x: z.x, v: z.EIy }));
    // interior shear extremes where the load intensity crosses zero
    segments.forEach((sg) => {
      if (sg.q0 * sg.q1 < 0) { const x = sg.x0 + (sg.x1 - sg.x0) * sg.q0 / (sg.q0 - sg.q1); Vc.push({ x, v: V(x), side: 'R' }); }
    });
    // slope extremes are at zero-moment points or event points
    contraflexure.filter((c) => !c.jump).forEach((c) => Tc.push({ x: c.x, v: EIt(c.x), side: 'R' }));
    const maxOf = (arr) => arr.reduce((p, c) => (c.v > p.v ? c : p), { v: -Infinity });
    const minOf = (arr) => arr.reduce((p, c) => (c.v < p.v ? c : p), { v: Infinity });
    const extremes = {
      Vmax: maxOf(cand(Vc)), Vmin: minOf(cand(Vc)),
      Mmax: maxOf(cand(Mc)), Mmin: minOf(cand(Mc)),
      Tmax: maxOf(cand(Tc)), Tmin: minOf(cand(Tc)),
      Ymax: maxOf(cand(Yc)), Ymin: minOf(cand(Yc)),
    };

    // residual checks
    const resid = [];
    resid.push({ label: 'ΣFy = 0', value: V(L, 'R'), scale: Math.max(1, Vabs) });
    resid.push({ label: 'ΣM = 0', value: M(L, 'R'), scale: Math.max(1, Mabs) });
    sup.forEach((s) => resid.push({ label: `y = 0 at ${s.label}`, value: EIy(s.x), scale: Math.max(1, Yabs) }));
    sup.filter((s) => s.type === 'fixed').forEach((s) => resid.push({ label: `slope = 0 at ${s.label}`, value: EIt(s.x), scale: Math.max(1, Tabs) }));
    hin.forEach((h) => resid.push({ label: `M = 0 at ${h.label}`, value: M(h.x, 'L'), scale: Math.max(1, Mabs) }));
    const maxResidual = resid.reduce((m, r) => Math.max(m, Math.abs(r.value) / r.scale), 0);

    return {
      ...base, ok: true, errors: [], cls,
      supports: sup, hinges: hin, C1, C2,
      terms, allTerms, unknowns, eqs,
      V, M, EIt, EIy, w,
      theta: (x, side) => EIt(x, side) / EI,
      y: (x) => EIy(x) / EI,
      events, segments, zeroShear, shearSignAtEvents, contraflexure, zeroSlope, extremes,
      scales: { V: Vabs, M: Mabs, T: Tabs, Y: Yabs },
      residuals: resid, maxResidual,
    };
  }

  /* Resultant of a (part of a) linear distributed load between u0 and u1. */
  function distResultant(l, u0, u1) {
    const a = Math.max(l.a, u0), b = Math.min(l.b, u1);
    if (b <= a) return { W: 0, xbar: a };
    const k = (l.w2 - l.w1) / (l.b - l.a);
    const wa = l.w1 + k * (a - l.a), wb = l.w1 + k * (b - l.a);
    const W = 0.5 * (wa + wb) * (b - a);
    // centroid of trapezoid measured from a
    const xbar = Math.abs(wa + wb) < 1e-12 ? a + (b - a) / 2 : a + (b - a) * (wa + 2 * wb) / (3 * (wa + wb));
    return { W, xbar, wa, wb, a, b };
  }

  return { solve, SUPPORT_TYPES, distResultant, mac, fmt, FACT };
});
