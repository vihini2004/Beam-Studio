// Solver tests (run with: npm test)
//  1. Textbook benchmarks: closed-form reactions, bending moments and deflections
//     for the course presets and standard cases.
//  2. Random beams (4,000 per run): every solvable beam is compared with an
//     independent finite-element solver (test/fem.js) for reactions and nodal
//     deflections, and checked against dM/dx = V, dV/dx = -w and EI y'' = M.
//     Beams the solver calls unstable must also be singular for the FEM model.
const { solve } = require('../src/solver.js');
const { femSolve } = require('./fem.js');

let pass = 0, fail = 0;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
function check(name, got, exp, tol) {
  if (near(got, exp, tol)) { pass++; }
  else { fail++; console.log(`  ✗ ${name}: got ${got}, expected ${exp}`); }
}
function ok(name, cond) { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}`); } }

const base = { E: 200, I: 100 }; // EI = 20000 kN·m²
const P = (x, P) => ({ type: 'point', x, P });
const U = (a, b, w) => ({ type: 'dist', a, b, w1: w, w2: w });
const T = (a, b, w1, w2) => ({ type: 'dist', a, b, w1, w2 });
const C = (x, C) => ({ type: 'moment', x, C });
const S = (type, x) => ({ type, x });

function run(name, model, fn) {
  const r = solve({ ...base, ...model });
  const before = fail;
  fn(r);
  console.log(`${fail === before ? '✓' : '✗'} ${name}`);
  return r;
}
const R = (r, x) => r.supports.find(s => Math.abs(s.x - x) < 1e-9);

// ---------------- textbook benchmarks ----------------
run('Simply supported preset: R, Mmax, deflection', { L: 10, supports: [S('pinned', 0), S('roller', 10)], loads: [P(4, 20), U(6, 10, 5)] }, r => {
  check('R_A', R(r, 0).R, 16); check('R_B', R(r, 10).R, 24);
  check('Mmax', r.extremes.Mmax.v, 64); check('Mmax at', r.extremes.Mmax.x, 4);
  check('EI·y min', r.extremes.Ymin.v, -616.6743, 1e-5);
  check('x of y min', r.extremes.Ymin.x, (80 - Math.sqrt(6400 - 8 * (160 + 189.3333333333))) / 4, 1e-6);
  check('C1', r.C1, -189.333333333, 1e-8); check('C2', r.C2, 0);
  ok('status determinate', r.cls.status === 'determinate');
});
run('Cantilever preset: wall moment, tip deflection & slope', { L: 10, supports: [S('fixed', 0)], loads: [P(10, 15), U(0, 10, 4)] }, r => {
  check('R_A', R(r, 0).R, 55); check('M_A (clockwise +)', R(r, 0).M, -350);
  check('M(0+)', r.M(0, 'R'), -350); check('M(10-)', r.M(10, 'L'), 0);
  check('EI y tip', r.EIy(10), -10000); check('EI θ tip', r.EIt(10), -(15 * 100 / 2 + 4 * 1000 / 6));
  check('tip deflection mm', r.y(10) * 1000, -500);
});
run('Fixed–fixed, central point load', { L: 10, supports: [S('fixed', 0), S('fixed', 10)], loads: [P(5, 30)] }, r => {
  check('R_A', R(r, 0).R, 15); check('R_B', R(r, 10).R, 15);
  check('M_A', R(r, 0).M, -37.5); check('M_B', R(r, 10).M, 37.5);
  check('M mid', r.M(5), 37.5); check('δ mid', r.EIy(5), -30 * 1000 / 192);
  ok('indeterminate degree 3', r.cls.status === 'indeterminate' && r.cls.degree === 3);
});
run('Fixed–fixed, UDL', { L: 6, supports: [S('fixed', 0), S('fixed', 6)], loads: [U(0, 6, 12)] }, r => {
  check('M end', r.M(0, 'R'), -36); check('M mid', r.M(3), 18); check('δ mid', r.EIy(3), -12 * 6 ** 4 / 384);
});
run('Overhanging preset', { L: 10, supports: [S('pinned', 2), S('roller', 8)], loads: [P(0, 10), P(10, 10), P(5, 25)] }, r => {
  check('R_A', R(r, 2).R, 22.5); check('R_B', R(r, 8).R, 22.5);
  check('M at A', r.M(2), -20); check('M mid', r.M(5), 17.5);
  check('EI y tip', r.EIy(0), -34.1666667, 1e-6); check('EI y mid', r.EIy(5), -22.5, 1e-6);
  ok('two contraflexure points', r.contraflexure.filter(c => !c.jump).length === 2);
});
run('Two-span continuous, UDL (three-moment check)', { L: 10, supports: [S('pinned', 0), S('roller', 5), S('roller', 10)], loads: [U(0, 10, 10)] }, r => {
  check('R_A', R(r, 0).R, 18.75); check('R_B', R(r, 5).R, 62.5); check('R_C', R(r, 10).R, 18.75);
  check('M_B', r.M(5), -31.25); check('Mmax', r.extremes.Mmax.v, 9 * 10 * 25 / 128); check('Mmax at', r.extremes.Mmax.x, 1.875);
  check('δmax', r.extremes.Ymin.v, -0.00541612 * 10 * 625, 1e-5);
});
run('Propped cantilever, UDL', { L: 10, supports: [S('fixed', 0), S('roller', 10)], loads: [U(0, 10, 10)] }, r => {
  check('R_A', R(r, 0).R, 62.5); check('R_B', R(r, 10).R, 37.5); check('M_A', R(r, 0).M, -125);
  check('Mmax sag', r.extremes.Mmax.v, 9 * 10 * 100 / 128); check('at', r.extremes.Mmax.x, 6.25);
  check('δmax', r.extremes.Ymin.v, -0.00541612 * 10 * 1e4, 1e-5);
  ok('degree 1', r.cls.degree === 1 && r.cls.dv === 1);
});
run('Triangular load 0→12 on SS beam', { L: 10, supports: [S('pinned', 0), S('roller', 10)], loads: [T(0, 10, 0, 12)] }, r => {
  check('R_A', R(r, 0).R, 20); check('R_B', R(r, 10).R, 40);
  check('Mmax', r.extremes.Mmax.v, 12 * 100 / (9 * Math.sqrt(3))); check('at', r.extremes.Mmax.x, 10 / Math.sqrt(3));
  check('δmax', r.extremes.Ymin.v, -0.00652 * 12 * 1e4, 1e-3);
});
run('Trapezoidal load 2→8 kN/m on 6 m SS beam', { L: 6, supports: [S('pinned', 0), S('roller', 6)], loads: [T(0, 6, 2, 8)] }, r => {
  check('R_A', R(r, 0).R, 12); check('R_B', R(r, 6).R, 18);
});
run('Clockwise couple 20 kNm at midspan', { L: 10, supports: [S('pinned', 0), S('roller', 10)], loads: [C(5, 20)] }, r => {
  check('R_A', R(r, 0).R, -2); check('R_B', R(r, 10).R, 2);
  check('M(5−)', r.M(5, 'L'), -10); check('M(5+)', r.M(5, 'R'), 10); check('M(10)', r.M(10, 'L'), 0);
  ok('jump sign change listed', r.contraflexure.some(c => c.jump && Math.abs(c.x - 5) < 1e-9));
});
run('Cantilever with the wall on the right', { L: 10, supports: [S('fixed', 10)], loads: [P(0, 10)] }, r => {
  check('R_B', R(r, 10).R, 10); check('M_B', R(r, 10).M, 100); check('EI y(0)', r.EIy(0), -10000 / 3);
});
run('Gerber beam: fixed 0, hinge 4, roller 10, UDL 6', { L: 10, supports: [S('fixed', 0), S('roller', 10)], hinges: [{ x: 4 }], loads: [U(0, 10, 6)] }, r => {
  check('R_A', R(r, 0).R, 42); check('M_A', R(r, 0).M, -120); check('R_C', R(r, 10).R, 18);
  check('M at hinge', r.M(4), 0); check('M(7)', r.M(7), 27);
  ok('determinate', r.cls.status === 'determinate');
});
run('Pinned–pinned: horizontal indeterminacy only', { L: 8, supports: [S('pinned', 0), S('pinned', 8)], loads: [P(4, 10)] }, r => {
  check('R_A', R(r, 0).R, 5); ok('degree 1, dv 0', r.cls.degree === 1 && r.cls.dv === 0 && r.cls.status === 'indeterminate');
});
run('Three rollers: vertical-only stability', { L: 10, supports: [S('roller', 0), S('roller', 5), S('roller', 10)], loads: [U(0, 10, 10)] }, r => {
  ok('status vertical', r.cls.status === 'vertical'); check('R_B', R(r, 5).R, 62.5);
});
run('Single roller → unstable', { L: 10, supports: [S('roller', 5)], loads: [P(2, 10)] }, r => { ok('not ok', !r.ok && r.cls.status === 'unstable'); });
run('Pin–hinge–roller → mechanism', { L: 10, supports: [S('pinned', 0), S('roller', 10)], hinges: [{ x: 5 }], loads: [P(2, 10)] }, r => { ok('unstable', !r.ok && r.cls.status === 'unstable'); });
run('No supports → unstable', { L: 10, supports: [], loads: [P(2, 10)] }, r => { ok('unstable', !r.ok); });
run('Two supports at one point → error', { L: 10, supports: [S('pinned', 3), S('roller', 3)], loads: [] }, r => { ok('error', !r.ok && r.errors.length > 0); });
run('Hinge on a fixed support → error', { L: 10, supports: [S('fixed', 0), S('roller', 10)], hinges: [{ x: 0 }], loads: [] }, r => { ok('error', !r.ok && r.errors.length > 0); });
run('UDL past the end is clipped with a warning', { L: 10, supports: [S('pinned', 0), S('roller', 10)], loads: [U(9, 12, 15)] }, r => {
  check('R_A', R(r, 0).R, 0.75); check('R_B', R(r, 10).R, 14.25); ok('warning', r.warnings.length > 0);
});
run('No loads → all zero', { L: 10, supports: [S('pinned', 0), S('roller', 10)], loads: [] }, r => {
  check('R_A', R(r, 0).R, 0); check('Mmax', Math.abs(r.extremes.Mmax.v), 0);
});

// ---------------- random beams: compare with FEM + differential identities ----------------
function rnd(a, b) { return a + Math.random() * (b - a); }
function grid(x, g = 0.25) { return Math.round(x / g) * g; }
let fuzzN = 0, fuzzBad = 0, unstableAgree = 0, unstableN = 0;
const types = ['pinned', 'roller', 'simple', 'fixed'];
for (let trial = 0; trial < 4000; trial++) {
  const L = grid(rnd(3, 16), 0.5);
  const ns = 1 + Math.floor(Math.random() * 4);
  const supports = [];
  const used = new Set();
  for (let i = 0; i < ns; i++) {
    let x = grid(Math.random() < 0.35 ? (Math.random() < 0.5 ? 0 : L) : rnd(0, L));
    if (used.has(x)) continue; used.add(x);
    supports.push({ type: types[Math.floor(Math.random() * 4)], x });
  }
  const hinges = [];
  if (Math.random() < 0.3) { const x = grid(rnd(0.5, L - 0.5)); if (!supports.some(s => s.x === x && s.type === 'fixed') && x > 0 && x < L) hinges.push({ x }); }
  const loads = [];
  const nl = 1 + Math.floor(Math.random() * 4);
  for (let i = 0; i < nl; i++) {
    const k = Math.random();
    if (k < 0.4) loads.push(P(grid(rnd(0, L)), grid(rnd(-20, 60), 5)));
    else if (k < 0.75) { let a = grid(rnd(0, L)), b = grid(rnd(0, L)); if (a > b) [a, b] = [b, a]; if (b - a < 0.5) continue; loads.push(T(a, b, grid(rnd(0, 15), 1), grid(rnd(0, 15), 1))); }
    else { const x = grid(rnd(0, L)); if (hinges.some(h => h.x === x)) continue; loads.push(C(x, grid(rnd(-40, 40), 5))); }
  }
  const model = { L, E: 200, I: rnd(20, 500), supports, hinges, loads };
  const r = solve(model);
  const f = femSolve(model, 3);
  if (!r.ok) {
    if (r.errors && r.errors.length) continue;
    unstableN++; if (f.singular) unstableAgree++; else { /* FEM may be solvable only when every support restrains v; report */ console.log('  ! solver unstable but FEM solvable', JSON.stringify(model)); fuzzBad++; }
    continue;
  }
  fuzzN++;
  if (f.singular) { fuzzBad++; console.log('  ! FEM singular but solver ok', JSON.stringify(model)); continue; }
  const EI = model.E * model.I;
  let bad = false;
  const scaleR = Math.max(1, ...r.supports.map(s => Math.abs(s.R)));
  for (const s of r.supports) {
    const fr = f.react[s.x];
    if (!near(s.R, fr.R, 1e-6 * scaleR / Math.max(1, Math.abs(fr.R)))) { bad = true; console.log(`  ! R mismatch at ${s.x}: ${s.R} vs FEM ${fr.R}`); }
    if (s.type === 'fixed' && !near(s.M, fr.M, 1e-6 * Math.max(1, r.scales.M) / Math.max(1, Math.abs(fr.M)))) { bad = true; console.log(`  ! M mismatch at ${s.x}: ${s.M} vs FEM ${fr.M}`); }
  }
  const ys = Math.max(1e-9, ...f.v.map(Math.abs)); // metres; 1e-9 m floor (loads sitting on supports give y ≡ 0)
  f.nodes.forEach((x, i) => { if (Math.abs(r.y(x) - f.v[i]) > 1e-6 * ys) { bad = true; console.log(`  ! y mismatch at ${x}: ${r.y(x)} vs FEM ${f.v[i]}`); } });
  // differential identities: dM/dx = V, dV/dx = −w, EI y'' = M (central differences inside segments)
  for (const sg of r.segments) {
    if (sg.x1 - sg.x0 < 0.05) continue;
    const len = sg.x1 - sg.x0, x = sg.x0 + len * 0.37;
    const h1 = 1e-5 * len;                       // first derivatives: small step (round-off ~1e-11)
    const h2 = 1e-2 * len;                       // second derivative: 5-point stencil, truncation O(h^4)
    const dM = (r.M(x + h1) - r.M(x - h1)) / (2 * h1), dV = (r.V(x + h1) - r.V(x - h1)) / (2 * h1);
    const Y = t => r.EIy(t);
    const d2y = (-Y(x + 2 * h2) + 16 * Y(x + h2) - 30 * Y(x) + 16 * Y(x - h2) - Y(x - 2 * h2)) / (12 * h2 * h2);
    if (Math.abs(dM - r.V(x)) > 1e-5 * Math.max(1, r.scales.V)) { bad = true; console.log('  ! dM/dx≠V', dM, r.V(x)); }
    if (Math.abs(dV + r.w(x)) > 1e-4 * Math.max(1, Math.abs(r.w(x)))) { bad = true; console.log('  ! dV/dx≠−w', dV, -r.w(x)); }
    if (Math.abs(d2y - r.M(x)) > 1e-5 * Math.max(1, r.scales.M, r.scales.Y / (h2 * h2) * 1e-10)) { bad = true; console.log('  ! EIy″≠M', d2y, r.M(x)); }
  }
  if (r.maxResidual > 1e-8) { bad = true; console.log('  ! residual', r.maxResidual); }
  if (bad) { fuzzBad++; console.log('  ! mismatch', JSON.stringify(model)); }
}
console.log(`\nrandom beams: ${fuzzN} solved and compared with FEM, ${fuzzBad} mismatches; ${unstableN} flagged unstable (${unstableAgree} confirmed singular by FEM)`);
console.log(`benchmarks: ${pass} checks passed, ${fail} failed`);
process.exit(fail || fuzzBad ? 1 : 0);
