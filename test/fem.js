// Independent reference: Euler–Bernoulli beam finite elements (Hermite cubics).
// With consistent nodal loads the nodal displacements and reactions are exact for
// polynomial loading, so this is a strong, method-independent check of the
// Macaulay solver. Sign conventions: v upward +, θ = dv/dx (anticlockwise +).
function femSolve(model, nSub = 4) {
  const L = model.L, EI = model.E * model.I;
  const pts = new Set([0, L]);
  (model.supports || []).forEach(s => pts.add(s.x));
  (model.hinges || []).forEach(h => pts.add(h.x));
  (model.loads || []).forEach(l => { if (l.type === 'dist') { pts.add(l.a); pts.add(l.b); } else pts.add(l.x); });
  let xs = [...pts].sort((a, b) => a - b);
  // subdivide
  const nodes = [];
  for (let i = 0; i < xs.length - 1; i++) for (let k = 0; k < nSub; k++) nodes.push(xs[i] + (xs[i + 1] - xs[i]) * k / nSub);
  nodes.push(L);
  const near = (a, b) => Math.abs(a - b) < 1e-9 * L;
  const isHinge = nodes.map(x => (model.hinges || []).some(h => near(h.x, x)));
  // dof numbering
  const vDof = [], tL = [], tR = [];
  let nd = 0;
  nodes.forEach((x, i) => {
    vDof[i] = nd++;
    if (isHinge[i]) { tL[i] = nd++; tR[i] = nd++; } else { tL[i] = tR[i] = nd++; }
  });
  const K = Array.from({ length: nd }, () => new Array(nd).fill(0));
  const F = new Array(nd).fill(0);
  for (let e = 0; e < nodes.length - 1; e++) {
    const h = nodes[e + 1] - nodes[e];
    const d = [vDof[e], tR[e], vDof[e + 1], tL[e + 1]];
    const c = EI / h ** 3;
    const k = [[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[d[i]][d[j]] += c * k[i][j];
    // distributed loads on this element (q upward = -w)
    const xm = 0.5 * (nodes[e] + nodes[e + 1]);
    for (const l of model.loads || []) {
      if (l.type !== 'dist' || !(xm > l.a && xm < l.b)) continue;
      const wAt = x => l.w1 + (l.w2 - l.w1) * (x - l.a) / (l.b - l.a);
      const q1 = -wAt(nodes[e]), q2 = -wAt(nodes[e + 1]);
      const f = [h * (7 * q1 + 3 * q2) / 20, h * h * (3 * q1 + 2 * q2) / 60, h * (3 * q1 + 7 * q2) / 20, -h * h * (2 * q1 + 3 * q2) / 60];
      for (let i = 0; i < 4; i++) F[d[i]] += f[i];
    }
  }
  for (const l of model.loads || []) {
    if (l.type === 'point') { const i = nodes.findIndex(x => near(x, l.x)); F[vDof[i]] += -l.P; }
    if (l.type === 'moment') { const i = nodes.findIndex(x => near(x, l.x)); F[tR[i]] += -l.C; } // clockwise + → anticlockwise −
  }
  const fixed = new Set();
  for (const s of model.supports || []) {
    const i = nodes.findIndex(x => near(x, s.x));
    fixed.add(vDof[i]);
    if (s.type === 'fixed') { fixed.add(tL[i]); fixed.add(tR[i]); }
  }
  const free = [...Array(nd).keys()].filter(i => !fixed.has(i));
  const A = free.map(i => free.map(j => K[i][j]));
  const b = free.map(i => F[i]);
  // Gaussian elimination with scaling to detect singularity
  const n = free.length;
  const scale = Math.max(...A.map(r => Math.max(...r.map(Math.abs))), 1e-300);
  let singular = false;
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if (Math.abs(A[p][k]) < 1e-10 * scale) { singular = true; break; }
    [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]];
    for (let i = k + 1; i < n; i++) { const f = A[i][k] / A[k][k]; for (let j = k; j < n; j++) A[i][j] -= f * A[k][j]; b[i] -= f * b[k]; }
  }
  if (singular) return { singular: true };
  const xsol = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * xsol[j]; xsol[i] = s / A[i][i]; }
  const D = new Array(nd).fill(0); free.forEach((g, i) => { D[g] = xsol[i]; });
  // reactions R = K D − F at constrained dofs
  const react = {};
  for (const s of model.supports || []) {
    const i = nodes.findIndex(x => near(x, s.x));
    const r = g => K[g].reduce((acc, kij, j) => acc + kij * D[j], 0) - F[g];
    const R = r(vDof[i]);
    let M = null;
    if (s.type === 'fixed') M = -(r(tL[i]) + (tR[i] !== tL[i] ? r(tR[i]) : 0)); // anticlockwise dof → clockwise +
    react[s.x] = { R, M };
  }
  return { singular: false, nodes, v: nodes.map((x, i) => D[vDof[i]]), react };
}
module.exports = { femSolve };
