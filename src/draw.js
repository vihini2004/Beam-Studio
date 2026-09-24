/* ---------- SVG drawing: glyphs, loading diagram, result diagrams ---------- */
const Draw = (() => {
  const { fmt, esc, textW } = U;
  const FONT = '500 11.5px Barlow, "Segoe UI", system-ui, sans-serif';
  const FONT_B = '600 11.5px Barlow, "Segoe UI", system-ui, sans-serif';
  const r1 = (v) => Math.round(v * 10) / 10;

  function arrowHead(x, y, dx, dy, size, cls) {
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const bx = x - dx * size, by = y - dy * size, nx = -dy * size * 0.45, ny = dx * size * 0.45;
    return `<path class="${cls}" d="M${r1(x)},${r1(y)}L${r1(bx + nx)},${r1(by + ny)}L${r1(bx - nx)},${r1(by - ny)}Z"/>`;
  }

  /* circular arrow; cw = clockwise on screen. Arc sits over the top of (cx, cy). */
  function arcArrow(cx, cy, r, cw, cls, headCls, opts) {
    const o = opts || {};
    const a0 = (o.a0 != null ? o.a0 : 150) * Math.PI / 180, a1 = (o.a1 != null ? o.a1 : 390) * Math.PI / 180;
    const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    let s = `<path class="${cls}" d="M${r1(x0)},${r1(y0)}A${r},${r} 0 ${large} 1 ${r1(x1)},${r1(y1)}" fill="none"/>`;
    if (cw) s += arrowHead(x1, y1, -Math.sin(a1), Math.cos(a1), 7.5, headCls);
    else s += arrowHead(x0, y0, Math.sin(a0), -Math.cos(a0), 7.5, headCls);
    return s;
  }

  /* support symbol with its top (apex) at (x, y); side = where a fixed wall goes */
  function supportShape(type, x, y, side, k) {
    const s = k || 1;
    if (type === 'pinned') {
      const h = 17 * s, w = 11 * s;
      return `<path class="sp-fill" d="M${x},${y}L${x - w},${y + h}L${x + w},${y + h}Z"/>` +
        `<circle class="sp-pin" cx="${x}" cy="${y + 2.5 * s}" r="${2.6 * s}"/>` +
        `<rect class="hatch" x="${x - 15 * s}" y="${y + h}" width="${30 * s}" height="${6 * s}"/>` +
        `<line class="sp-line" x1="${x - 15 * s}" y1="${y + h}" x2="${x + 15 * s}" y2="${y + h}"/>`;
    }
    if (type === 'roller') {
      const h = 13 * s, w = 10 * s, cr = 3 * s;
      return `<path class="sp-fill" d="M${x},${y}L${x - w},${y + h}L${x + w},${y + h}Z"/>` +
        `<circle class="sp-wheel" cx="${x - 5 * s}" cy="${y + h + cr}" r="${cr}"/><circle class="sp-wheel" cx="${x + 5 * s}" cy="${y + h + cr}" r="${cr}"/>` +
        `<rect class="hatch" x="${x - 15 * s}" y="${y + h + 2 * cr}" width="${30 * s}" height="${5 * s}"/>` +
        `<line class="sp-line" x1="${x - 15 * s}" y1="${y + h + 2 * cr}" x2="${x + 15 * s}" y2="${y + h + 2 * cr}"/>`;
    }
    if (type === 'simple') {
      const h = 15 * s, w = 7 * s;
      return `<path class="sp-open" d="M${x},${y}L${x - w},${y + h}L${x + w},${y + h}Z"/>` +
        `<line class="sp-line" x1="${x - 13 * s}" y1="${y + h}" x2="${x + 13 * s}" y2="${y + h}"/>` +
        `<line class="sp-line thin" x1="${x - 13 * s}" y1="${y + h + 3.5 * s}" x2="${x + 13 * s}" y2="${y + h + 3.5 * s}"/>`;
    }
    if (type === 'fixed') {
      // y here is the beam mid-line
      const hh = 26 * s, t = 12 * s;
      if (side === 'left') return `<rect class="hatch" x="${x - t}" y="${y - hh}" width="${t}" height="${2 * hh}"/><line class="sp-line" x1="${x}" y1="${y - hh}" x2="${x}" y2="${y + hh}"/>`;
      if (side === 'right') return `<rect class="hatch" x="${x}" y="${y - hh}" width="${t}" height="${2 * hh}"/><line class="sp-line" x1="${x}" y1="${y - hh}" x2="${x}" y2="${y + hh}"/>`;
      const bw = 16 * s, bh = 12 * s, g = 5 * s;
      return `<rect class="hatch" x="${x - bw / 2}" y="${y - g - bh}" width="${bw}" height="${bh}"/><rect class="hatch" x="${x - bw / 2}" y="${y + g}" width="${bw}" height="${bh}"/>` +
        `<line class="sp-line" x1="${x - bw / 2}" y1="${y - g}" x2="${x + bw / 2}" y2="${y - g}"/><line class="sp-line" x1="${x - bw / 2}" y1="${y + g}" x2="${x + bw / 2}" y2="${y + g}"/>`;
    }
    return '';
  }

  /* ---------- palette / legend glyphs (40×32 viewBox) ---------- */
  function glyph(kind) {
    const beam = (x0, x1) => `<rect class="beam" x="${x0}" y="11" width="${x1 - x0}" height="5" rx="1"/>`;
    const svg = (inner) => `<svg viewBox="0 0 40 32" aria-hidden="true" class="glyph">${inner}</svg>`;
    switch (kind) {
      case 'pinned': return svg(beam(6, 34) + supportShape('pinned', 20, 16, null, 0.7));
      case 'roller': return svg(beam(6, 34) + supportShape('roller', 20, 16, null, 0.7));
      case 'simple': return svg(beam(6, 34) + supportShape('simple', 20, 16, null, 0.7));
      case 'fixed': return svg(`<rect class="beam" x="14" y="11" width="22" height="5" rx="1"/>` + supportShape('fixed', 14, 13.5, 'left', 0.62));
      case 'hinge': return svg(beam(4, 36) + `<circle class="hinge" cx="20" cy="13.5" r="4"/>`);
      case 'point': return svg(beam(4, 36) + `<line class="ld-line" x1="20" y1="0.5" x2="20" y2="9"/>` + arrowHead(20, 10.5, 0, 1, 5, 'ld-head'));
      case 'udl': {
        let s = `<rect class="ld-fill" x="6" y="3" width="28" height="7"/><line class="ld-line" x1="6" y1="3" x2="34" y2="3"/>`;
        for (const x of [8, 14, 20, 26, 32]) s += `<line class="ld-line thin" x1="${x}" y1="3" x2="${x}" y2="9"/>` + arrowHead(x, 10.5, 0, 1, 3.4, 'ld-head');
        return svg(beam(4, 36) + s);
      }
      case 'uvl': {
        let s = `<path class="ld-fill" d="M6,10L34,1L34,10Z"/><line class="ld-line" x1="6" y1="10" x2="34" y2="1"/>`;
        for (const x of [16, 22, 28, 34]) { const top = 10 - (x - 6) * 9 / 28; s += `<line class="ld-line thin" x1="${x}" y1="${top}" x2="${x}" y2="9"/>` + arrowHead(x, 10.5, 0, 1, 3.2, 'ld-head'); }
        return svg(beam(4, 36) + s);
      }
      case 'moment': return svg(beam(4, 36) + arcArrow(20, 13.5, 8.5, true, 'ld-line', 'ld-head', { a0: 160, a1: 380 }));
      default: return '';
    }
  }

  /* ---------- label placement (greedy, priority-ordered) ---------- */
  function placeLabels(cands, bounds, blocked) {
    const boxes = (blocked || []).slice();
    const out = [];
    cands.sort((a, b) => (b.pri || 0) - (a.pri || 0) || a.px - b.px);
    for (const c of cands) {
      const font = c.bold ? FONT_B : FONT;
      const w = textW(c.text, font) + 2, h = 12;
      const offs = c.offs || (c.pref === 'below'
        ? [[0, 15, 'middle'], [9, 15, 'start'], [-9, 15, 'end'], [0, 27, 'middle'], [11, 4, 'start'], [-11, 4, 'end']]
        : [[0, -7, 'middle'], [9, -7, 'start'], [-9, -7, 'end'], [0, -19, 'middle'], [11, 4, 'start'], [-11, 4, 'end']]);
      let placed = null;
      for (const [dx, dy, anchor] of offs) {
        const tx = c.px + dx, ty = c.py + dy;
        const x0 = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
        const box = { x0: x0 - 2, x1: x0 + w + 2, y0: ty - h + 1, y1: ty + 3 };
        if (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1) continue;
        if (boxes.some((b) => !(box.x1 <= b.x0 || box.x0 >= b.x1 || box.y1 <= b.y0 || box.y0 >= b.y1))) continue;
        placed = { tx, ty, anchor, box }; break;
      }
      if (!placed && c.force) {
        const [dx, dy, anchor] = offs[0];
        const tx = Math.min(bounds.x1 - w / 2, Math.max(bounds.x0 + w / 2, c.px + dx)), ty = c.py + dy;
        placed = { tx, ty, anchor: 'middle', box: { x0: tx - w / 2, x1: tx + w / 2, y0: ty - h, y1: ty + 3 } };
      }
      if (placed) { boxes.push(placed.box); out.push({ ...c, ...placed }); }
    }
    return out;
  }
  const labelSvg = (l) => `<text class="lbl${l.bold ? ' b' : ''}${l.cls ? ' ' + l.cls : ''}" x="${r1(l.tx)}" y="${r1(l.ty)}" text-anchor="${l.anchor}">${esc(l.text)}</text>`;

  /* ---------- ruler / grid ---------- */
  function ticks(L, pw) {
    const target = pw < 380 ? 5 : pw < 700 ? 8 : 12;
    let step = U.niceStep(L, target);
    if (step < 0.5 && L >= 4) step = 0.5;
    const out = [];
    for (let x = 0; x <= L + 1e-9; x += step) out.push(Math.round(x * 1e6) / 1e6);
    if (L - out[out.length - 1] > step * 0.35) out.push(L);
    else out[out.length - 1] = L;
    return out;
  }
  function vgrid(g, y0, y1) {
    return ticks(g.L, g.pw).map((x) => `<line class="grid" x1="${r1(g.X(x))}" y1="${y0}" x2="${r1(g.X(x))}" y2="${y1}"/>`).join('');
  }

  /* ================= LOADING DIAGRAM ================= */
  function loading(model, res, g, o) {
    const H = o.height;
    const beamTop = o.beamTop, beamBot = beamTop + 10, beamMid = beamTop + 5;
    const X = g.X;
    const parts = [];
    const labels = [];
    const blocked = [];
    const sel = o.selected;
    const L = g.L;

    parts.push(vgrid(g, 8, H - 26));
    // ruler
    const rulerY = H - 20;
    parts.push(`<line class="axis" x1="${X(0)}" y1="${rulerY}" x2="${X(L)}" y2="${rulerY}"/>`);
    for (const x of ticks(L, g.pw)) {
      parts.push(`<line class="axis" x1="${r1(X(x))}" y1="${rulerY}" x2="${r1(X(x))}" y2="${rulerY + 4}"/>`);
      parts.push(`<text class="tick" x="${r1(X(x))}" y="${rulerY + 15}" text-anchor="middle">${fmt(x)}${Math.abs(x - L) < 1e-9 ? ' m' : ''}</text>`);
    }

    // step-mode focus band
    if (o.focus) parts.push(`<rect class="focus-band" x="${r1(X(o.focus[0]))}" y="6" width="${Math.max(2, r1(X(o.focus[1]) - X(o.focus[0])))}" height="${rulerY - 6}"/>`);

    // distributed loads
    const dists = model.loads.filter((l) => l.type === 'dist');
    const wMax = Math.max(1e-9, ...dists.map((l) => Math.max(Math.abs(l.w1), Math.abs(l.w2))));
    const hOf = (w) => (Math.abs(w) < 1e-12 ? 0 : 10 + 30 * Math.abs(w) / wMax);
    const selBoxes = {};

    for (const l of dists) {
      const a = Math.max(0, Math.min(L, l.a)), b = Math.max(0, Math.min(L, l.b));
      if (b - a <= 1e-9) continue;
      const dir = (l.w1 + l.w2) >= 0 ? 1 : -1; // 1 = downward drawn above beam
      const baseY = dir > 0 ? beamTop : beamBot;
      const t1 = baseY - dir * hOf(l.w1), t2 = baseY - dir * hOf(l.w2);
      const xa = X(a), xb = X(b);
      let s = `<g class="el${sel === l.id ? ' is-sel' : ''}" data-id="${l.id}">`;
      if (sel === l.id) s += `<rect class="sel-swash" x="${r1(xa - 5)}" y="${r1(Math.min(t1, t2, baseY) - 6)}" width="${r1(xb - xa + 10)}" height="${r1(Math.abs(Math.min(t1, t2) - baseY) + 12)}" rx="4"/>`;
      s += `<path class="ld-fill" d="M${r1(xa)},${baseY}L${r1(xa)},${r1(t1)}L${r1(xb)},${r1(t2)}L${r1(xb)},${baseY}Z"/>`;
      s += `<path class="ld-line" d="M${r1(xa)},${r1(t1)}L${r1(xb)},${r1(t2)}" fill="none"/>`;
      const n = Math.max(2, Math.round((xb - xa) / 22));
      for (let k = 0; k <= n; k++) {
        const px = xa + (xb - xa) * k / n, ty = t1 + (t2 - t1) * k / n;
        if (Math.abs(ty - baseY) < 5) continue;
        const tip = dir > 0 ? baseY - 1 : baseY + 1;
        s += `<line class="ld-line thin" x1="${r1(px)}" y1="${r1(ty)}" x2="${r1(px)}" y2="${r1(tip - dir * 4)}"/>` + arrowHead(px, tip, 0, dir, 5, 'ld-head');
      }
      s += `<rect class="hit" x="${r1(xa)}" y="${r1(Math.min(t1, t2, baseY) - 4)}" width="${r1(xb - xa)}" height="${r1(Math.abs(Math.min(t1, t2) - baseY) + 8)}"/>`;
      if (sel === l.id) {
        s += `<rect class="handle" data-handle="a" x="${r1(xa - 5)}" y="${r1(t1 - 5)}" width="10" height="10" rx="2"/>`;
        s += `<rect class="handle" data-handle="b" x="${r1(xb - 5)}" y="${r1(t2 - 5)}" width="10" height="10" rx="2"/>`;
      }
      s += '</g>';
      parts.push(s);
      const uniform = Math.abs(l.w1 - l.w2) < 1e-9;
      const txt = uniform ? `${fmt(Math.abs(l.w1))} kN/m` : `${fmt(Math.abs(l.w1))} → ${fmt(Math.abs(l.w2))} kN/m`;
      labels.push({ px: (xa + xb) / 2, py: Math.min(t1, t2), text: txt, pri: 2, pref: 'above' });
      selBoxes[l.id] = [xa, xb];
    }

    // beam
    parts.push(`<rect class="beam" x="${X(0)}" y="${beamTop}" width="${r1(X(L) - X(0))}" height="10" rx="1.5"/>`);
    blocked.push({ x0: X(0), x1: X(L), y0: beamTop, y1: beamBot });

    // supports
    for (const s of model.supports) {
      const x = X(s.x);
      let side = null;
      if (s.type === 'fixed') side = s.x <= 1e-9 ? 'left' : s.x >= L - 1e-9 ? 'right' : 'mid';
      let str = `<g class="el${sel === s.id ? ' is-sel' : ''}" data-id="${s.id}">`;
      if (sel === s.id) str += s.type === 'fixed' ? `<rect class="sel-swash" x="${r1(x - 20)}" y="${beamMid - 32}" width="40" height="64" rx="4"/>` : `<rect class="sel-swash" x="${r1(x - 20)}" y="${beamBot - 4}" width="40" height="34" rx="4"/>`;
      str += s.type === 'fixed' ? supportShape('fixed', x, beamMid, side) : supportShape(s.type, x, beamBot);
      str += s.type === 'fixed' ? `<rect class="hit" x="${r1(x - 18)}" y="${beamMid - 30}" width="36" height="60"/>` : `<rect class="hit" x="${r1(x - 18)}" y="${beamBot}" width="36" height="30"/>`;
      str += '</g>';
      parts.push(str);
      blocked.push({ x0: x - 16, x1: x + 16, y0: beamBot, y1: beamBot + 26 });
    }
    // support letters
    if (res && res.supports) {
      for (const s of res.supports) {
        const x = X(s.x);
        const fixedEnd = s.type === 'fixed' && (s.x <= 1e-9 || s.x >= L - 1e-9);
        labels.push({ px: x, py: fixedEnd ? beamTop - 30 : beamBot + 14, text: s.label, pri: 4, bold: true, cls: 'letter', force: true,
          offs: fixedEnd ? [[s.x <= 1e-9 ? -7 : 7, 0, s.x <= 1e-9 ? 'end' : 'start'], [0, -2, 'middle']] : [[-17, 0, 'end'], [17, 0, 'start'], [-17, 12, 'end']] });
      }
    }

    // hinges
    for (const h of model.hinges) {
      const x = X(h.x);
      let str = `<g class="el${sel === h.id ? ' is-sel' : ''}" data-id="${h.id}">`;
      if (sel === h.id) str += `<circle class="sel-swash" cx="${r1(x)}" cy="${beamMid}" r="13"/>`;
      str += `<circle class="hinge" cx="${r1(x)}" cy="${beamMid}" r="5"/><rect class="hit" x="${r1(x - 12)}" y="${beamMid - 12}" width="24" height="24"/></g>`;
      parts.push(str);
    }

    // point loads & couples
    for (const l of model.loads) {
      if (l.type === 'point') {
        const x = X(l.x), down = l.P >= 0, len = 46;
        let str = `<g class="el${sel === l.id ? ' is-sel' : ''}" data-id="${l.id}">`;
        if (down) {
          const y0 = beamTop - len;
          if (sel === l.id) str += `<rect class="sel-swash" x="${r1(x - 11)}" y="${y0 - 4}" width="22" height="${len + 4}" rx="4"/>`;
          str += `<line class="ld-line" x1="${r1(x)}" y1="${y0}" x2="${r1(x)}" y2="${beamTop - 5}"/>` + arrowHead(x, beamTop - 0.5, 0, 1, 8, 'ld-head');
          str += `<rect class="hit" x="${r1(x - 11)}" y="${y0 - 4}" width="22" height="${len + 4}"/>`;
          labels.push({ px: x, py: y0, text: `${fmt(Math.abs(l.P))} kN`, pri: 2, pref: 'above' });
          blocked.push({ x0: x - 3, x1: x + 3, y0, y1: beamTop });
        } else {
          const y1 = beamBot + len;
          if (sel === l.id) str += `<rect class="sel-swash" x="${r1(x - 11)}" y="${beamBot}" width="22" height="${len + 4}" rx="4"/>`;
          str += `<line class="ld-line" x1="${r1(x)}" y1="${y1}" x2="${r1(x)}" y2="${beamBot + 5}"/>` + arrowHead(x, beamBot + 0.5, 0, -1, 8, 'ld-head');
          str += `<rect class="hit" x="${r1(x - 11)}" y="${beamBot}" width="22" height="${len + 4}"/>`;
          labels.push({ px: x, py: y1, text: `${fmt(Math.abs(l.P))} kN`, pri: 2, pref: 'below' });
        }
        str += '</g>';
        parts.push(str);
      } else if (l.type === 'moment') {
        const x = X(l.x);
        let str = `<g class="el${sel === l.id ? ' is-sel' : ''}" data-id="${l.id}">`;
        if (sel === l.id) str += `<circle class="sel-swash" cx="${r1(x)}" cy="${beamMid}" r="25"/>`;
        str += arcArrow(x, beamMid, 17, l.C >= 0, 'ld-line', 'ld-head');
        str += `<circle class="hit" cx="${r1(x)}" cy="${beamMid}" r="24"/></g>`;
        parts.push(str);
        labels.push({ px: x, py: beamMid - 18, text: `${fmt(Math.abs(l.C))} kN·m`, pri: 2, pref: 'above' });
      }
    }

    // reactions
    if (res && res.ok && o.showReactions) {
      for (const s of res.supports) {
        const x = X(s.x);
        const baseY = s.type === 'fixed' ? beamBot + 3 : beamBot + 27;
        const R = s.R;
        const tol = 1e-9 * Math.max(1, res.scales.V);
        if (o.hideValues) {
          parts.push(`<line class="rx-line" x1="${r1(x)}" y1="${baseY + 36}" x2="${r1(x)}" y2="${baseY + 6}"/>` + arrowHead(x, baseY + 1, 0, -1, 8, 'rx-head'));
          labels.push({ px: x, py: baseY + 36, text: `R${s.label} = ?`, pri: 3, pref: 'below', cls: 'rx' });
        } else if (Math.abs(R) > tol) {
          if (R > 0) parts.push(`<line class="rx-line" x1="${r1(x)}" y1="${baseY + 36}" x2="${r1(x)}" y2="${baseY + 6}"/>` + arrowHead(x, baseY + 1, 0, -1, 8, 'rx-head'));
          else parts.push(`<line class="rx-line" x1="${r1(x)}" y1="${baseY + 2}" x2="${r1(x)}" y2="${baseY + 31}"/>` + arrowHead(x, baseY + 37, 0, 1, 8, 'rx-head'));
          labels.push({ px: x, py: baseY + 36, text: `${fmt(Math.abs(R))} kN`, pri: 3, pref: 'below', cls: 'rx', bold: true, force: true });
        } else {
          labels.push({ px: x, py: baseY + 20, text: `R = 0`, pri: 3, pref: 'below', cls: 'rx' });
        }
        if (s.type === 'fixed') {
          const onLeft = s.x <= 1e-9, onRight = s.x >= L - 1e-9;
          const cx = onLeft ? x + 34 : onRight ? x - 34 : x + 30;
          const cy = beamMid;
          const arcOpts = { a0: 25, a1: 155 };
          const mOffs = [[0, 44, 'middle'], [onRight ? -24 : 24, 40, onRight ? 'end' : 'start'], [0, 56, 'middle']];
          if (o.hideValues) {
            parts.push(arcArrow(cx, cy, 24, true, 'rx-line', 'rx-head', arcOpts));
            labels.push({ px: cx, py: cy, text: `M${s.label} = ?`, pri: 3, cls: 'rx', offs: mOffs, force: true });
          } else if (Math.abs(s.M) > 1e-9 * Math.max(1, res.scales.M)) {
            parts.push(arcArrow(cx, cy, 24, s.M > 0, 'rx-line', 'rx-head', arcOpts));
            labels.push({ px: cx, py: cy, text: `${fmt(Math.abs(s.M))} kN·m`, pri: 3, cls: 'rx', bold: true, force: true, offs: mOffs });
          }
        }
      }
    }

    // deflected shape (exaggerated)
    if (res && res.ok && o.showShape && !o.hideValues && res.scales.Y > 1e-12) {
      const ymax = Math.max(...res.events.map((e) => Math.abs(e.Y)), res.extremes.Ymin ? Math.abs(res.extremes.Ymin.v) : 0, res.extremes.Ymax ? Math.abs(res.extremes.Ymax.v) : 0) || 1;
      const k = 22 / ymax;
      let d = '';
      const N = Math.max(60, Math.round(g.pw / 3));
      for (let i = 0; i <= N; i++) { const x = L * i / N; d += (i ? 'L' : 'M') + r1(X(x)) + ',' + r1(beamMid - k * res.EIy(x)); }
      parts.push(`<path class="shape" d="${d}"/>`);
    }

    // snap guide while dragging
    if (o.guideX != null) {
      parts.push(`<line class="guide" x1="${r1(X(o.guideX))}" y1="10" x2="${r1(X(o.guideX))}" y2="${rulerY}"/>`);
      const t = `x = ${fmt(o.guideX)} m`;
      const w = textW(t, FONT_B) + 12;
      const gx = Math.min(X(L) - w / 2, Math.max(X(0) + w / 2, X(o.guideX)));
      parts.push(`<rect class="pill" x="${r1(gx - w / 2)}" y="${rulerY - 22}" width="${r1(w)}" height="17" rx="8.5"/><text class="pill-t" x="${r1(gx)}" y="${rulerY - 10}" text-anchor="middle">${t}</text>`);
    }

    // cut marker
    if (o.cutX != null) {
      const cx = X(o.cutX);
      parts.push(`<line class="cut-line" x1="${r1(cx)}" y1="12" x2="${r1(cx)}" y2="${rulerY}"/>`);
    }

    const placed = placeLabels(labels, { x0: 2, x1: g.W - 2, y0: 2, y1: rulerY - 2 }, blocked);
    parts.push(placed.map(labelSvg).join(''));
    return parts.join('');
  }

  /* ================= RESULT DIAGRAMS (V, M, θ, y) ================= */
  const KIND = {
    V: { cls: 'q-v' }, M: { cls: 'q-m' }, T: { cls: 'q-t' }, Y: { cls: 'q-y' },
  };

  /* value accessor in display units */
  function accessor(kind, res, o) {
    if (kind === 'V') return (x, s) => res.V(x, s);
    if (kind === 'M') return (x, s) => res.M(x, s);
    if (kind === 'T') return o.perEI ? (x, s) => res.EIt(x, s) : (x, s) => res.theta(x, s) * 1000;
    return o.perEI ? (x) => res.EIy(x) : (x) => res.y(x) * 1000;
  }

  function diagram(kind, res, g, o) {
    const H = o.height;
    const top = 16, bot = H - 14;
    const X = g.X;
    const f = accessor(kind, res, o);
    const flip = kind === 'M' && o.tension ? -1 : 1; // plot sagging downward when asked

    // samples (with jumps)
    const pts = [];
    for (const sg of res.segments) {
      const n = Math.max(2, Math.ceil((X(sg.x1) - X(sg.x0)) / 2.5));
      for (let k = 0; k <= n; k++) {
        const x = sg.x0 + (sg.x1 - sg.x0) * k / n;
        pts.push([x, f(x, k === n ? 'L' : 'R')]);
      }
    }
    let vmin = 0, vmax = 0;
    for (const p of pts) { const v = p[1] * flip; if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
    const scale = Math.max(Math.abs(vmin), Math.abs(vmax));
    const tiny = scale < 1e-9 * (kind === 'V' || kind === 'M' ? 1 : 1e-3);
    if (tiny) { vmin = -1; vmax = 1; }
    const span = vmax - vmin;
    vmax += span * 0.14; vmin -= span * 0.14;
    const Y = (v) => top + (vmax - v * flip) / (vmax - vmin) * (bot - top);
    const y0 = Y(0);
    const parts = [];
    parts.push(vgrid(g, top - 6, bot + 4));

    // y ticks
    const step = U.niceStep(vmax - vmin, 3);
    const tks = [];
    for (let t = Math.ceil(vmin / step) * step; t <= vmax + 1e-12; t += step) tks.push(Math.abs(t) < step * 1e-6 ? 0 : t);
    for (const t of tks) {
      const yy = Y(t * flip);
      if (t !== 0) parts.push(`<line class="grid" x1="${X(0)}" y1="${r1(yy)}" x2="${X(g.L)}" y2="${r1(yy)}"/>`);
      if (!tiny && !o.hideValues) parts.push(`<text class="tick" x="${g.padL - 7}" y="${r1(yy + 4)}" text-anchor="end">${fmt(t * flip, Math.abs(step) < 0.1 ? 3 : Math.abs(step) < 1 ? 2 : 1)}</text>`);
    }

    if (o.focus) parts.push(`<rect class="focus-band" x="${r1(X(o.focus[0]))}" y="${top - 6}" width="${Math.max(2, r1(X(o.focus[1]) - X(o.focus[0])))}" height="${bot - top + 10}"/>`);

    const reveal = o.revealX == null ? g.L : o.revealX;
    const clipId = 'clip-' + kind;
    parts.push(`<clipPath id="${clipId}"><rect x="${X(0) - 2}" y="0" width="${Math.max(0, X(reveal) - X(0) + 3)}" height="${H}"/></clipPath>`);
    parts.push(`<clipPath id="${clipId}-p"><rect x="0" y="0" width="${g.W}" height="${r1(y0)}"/></clipPath><clipPath id="${clipId}-n"><rect x="0" y="${r1(y0)}" width="${g.W}" height="${H}"/></clipPath>`);

    // path
    const cls = KIND[kind].cls;
    if (!o.hideValues && !tiny) {
      let d = `M${r1(X(0))},${r1(y0)}`;
      for (const [x, v] of pts) d += `L${r1(X(x))},${r1(Y(v))}`;
      d += `L${r1(X(g.L))},${r1(y0)}`;
      const area = d + 'Z';
      parts.push(`<g clip-path="url(#${clipId})">`);
      parts.push(`<path class="area ${cls} pos" d="${area}" clip-path="url(#${clipId}-p)"/><path class="area ${cls} neg" d="${area}" clip-path="url(#${clipId}-n)"/>`);
      parts.push(`<path class="curve ${cls}" d="${d}"/>`);
      parts.push('</g>');
    }
    // zero axis on top of fill
    parts.push(`<line class="zero" x1="${X(0)}" y1="${r1(y0)}" x2="${X(g.L)}" y2="${r1(y0)}"/>`);

    if (o.hideValues) {
      parts.push(`<text class="hidden-note" x="${(X(0) + X(g.L)) / 2}" y="${(top + bot) / 2 + 4}" text-anchor="middle">Hidden while you practise</text>`);
      return { svg: parts.join(''), Y, f, flip, tiny };
    }
    if (tiny) {
      parts.push(`<text class="hidden-note" x="${(X(0) + X(g.L)) / 2}" y="${r1(y0 - 8)}" text-anchor="middle">Zero everywhere</text>`);
      return { svg: parts.join(''), Y, f, flip, tiny };
    }

    // sign glyphs in regions (textbook ⊕ / ⊖), on V and M only
    const glyphs = [];
    if (kind === 'V' || kind === 'M') {
      let run = null;
      const flush = () => {
        if (!run) return;
        const wpx = X(run.x1) - X(run.x0), hpx = Math.abs(Y(run.peak) - y0);
        if (wpx > 34 && hpx > 20) {
          const gx = X((run.x0 + run.x1) / 2), gy = y0 + (Y(run.peak) - y0) * 0.42;
          glyphs.push({ x: gx, y: gy, s: run.sign });
        }
        run = null;
      };
      for (const [x, v] of pts) {
        const s = Math.abs(v) < 1e-9 * scale ? 0 : Math.sign(v);
        if (!s) { flush(); continue; }
        if (!run || run.sign !== s) { flush(); run = { sign: s, x0: x, x1: x, peak: v, px: x }; }
        run.x1 = x; if (Math.abs(v) > Math.abs(run.peak)) { run.peak = v; run.px = x; }
      }
      flush();
    }

    // labels
    const labels = [];
    const sc = scale;
    const clean = (v) => U.clean(v, sc);
    const pref = (v) => ((v * flip) >= 0 ? 'above' : 'below');
    const units = { V: '', M: '', T: '', Y: '' };
    const lab = (x, v, pri, extra) => {
      if (x > reveal + 1e-9) return;
      const cv = clean(v);
      labels.push({ px: X(x), py: Y(cv), text: fmt(cv, kind === 'T' && !o.perEI ? 3 : 2) + units[kind], pri, pref: pref(cv), ...(extra || {}) });
    };
    const ex = res.extremes;
    if (kind === 'V' || kind === 'M') {
      const tolv = 1e-9 * Math.max(1, sc);
      const segs = res.segments;
      const flat = segs.map((sg) => Math.abs(f(sg.x0, 'R') - f(sg.x1, 'L')) <= 1e-7 * Math.max(1, sc));
      const cand = [];
      const push = (x, v, pri, side) => { if (Math.abs(v) > tolv && x <= reveal + 1e-9) cand.push({ x, v, pri, side }); };
      for (let k = 0; k < segs.length; k++) {
        if (!flat[k]) continue;
        const v = f(segs[k].x0, 'R');
        let j = k;
        while (j + 1 < segs.length && flat[j + 1] && Math.abs(f(segs[j + 1].x0, 'R') - v) <= 1e-7 * Math.max(1, sc)) j++;
        push((segs[k].x0 + segs[j].x1) / 2, v, 1.6, 'C');
        k = j;
      }
      res.events.forEach((e, k) => {
        const hasL = k > 0, hasR = k < res.events.length - 1;
        const vl = hasL ? (kind === 'V' ? e.VL : e.ML) : 0, vr = hasR ? (kind === 'V' ? e.VR : e.MR) : 0;
        const leftFlat = hasL && flat[k - 1], rightFlat = hasR && flat[k];
        if (Math.abs(vl - vr) > tolv) {
          if (hasL && !leftFlat) push(e.x, vl, 2, 'L');
          if (hasR && !rightFlat) push(e.x, vr, 2, 'R');
        } else if (!leftFlat && !rightFlat) push(e.x, hasR ? vr : vl, 1.8, 'C');
      });
      if (kind === 'M') res.zeroShear.forEach((z) => push(z.x, z.M, 2.6, 'C'));
      const vmaxAll = kind === 'V' ? ex.Vmax.v : ex.Mmax.v, vminAll = kind === 'V' ? ex.Vmin.v : ex.Mmin.v;
      const isExt = (v) => (Math.abs(v - vmaxAll) <= 1e-7 * Math.max(1, sc) && v > 0) || (Math.abs(v - vminAll) <= 1e-7 * Math.max(1, sc) && v < 0);
      cand.sort((a, b) => b.pri - a.pri);
      const kept = [];
      for (const c of cand) {
        const txt = fmt(clean(c.v), 2);
        if (kept.some((k2) => k2.txt === txt && Math.abs(X(k2.x) - X(c.x)) < 44)) continue;
        kept.push({ ...c, txt });
      }
      for (const c of kept) {
        const up = pref(c.v) === 'above';
        const dy = up ? -7 : 15, dy2 = up ? -19 : 27;
        const offs = c.side === 'L' ? [[-5, dy, 'end'], [-5, dy2, 'end'], [5, dy, 'start']]
          : c.side === 'R' ? [[5, dy, 'start'], [5, dy2, 'start'], [-5, dy, 'end']]
            : [[0, dy, 'middle'], [8, dy, 'start'], [-8, dy, 'end'], [0, dy2, 'middle']];
        const ext = isExt(c.v);
        labels.push({ px: X(c.x), py: Y(clean(c.v)), text: c.txt, pri: ext ? 3 : c.pri, bold: ext, force: ext, offs });
      }
      if (kind === 'V') for (const z of res.zeroShear) if (z.x <= reveal) labels.push({ px: X(z.x), py: y0, text: `x = ${fmt(z.x)}`, pri: 2.5, offs: [[0, 14, 'middle'], [0, -6, 'middle']], cls: 'mark' });
      if (kind === 'M') for (const c of res.contraflexure) if (!c.jump && c.x <= reveal) {
        parts.push(`<circle class="cf-dot" cx="${r1(X(c.x))}" cy="${r1(y0)}" r="3.5"/>`);
        labels.push({ px: X(c.x), py: y0, text: c.atHinge ? 'hinge' : `x = ${fmt(c.x)}`, pri: 2.4, offs: [[0, 15, 'middle'], [0, -7, 'middle'], [6, 15, 'start']], cls: 'mark' });
      }
    } else if (kind === 'T') {
      res.supports.forEach((s) => lab(s.x, f(s.x, 'R'), 1.5));
      lab(0, f(0, 'R'), 1.2); lab(g.L, f(g.L, 'L'), 1.2);
      res.hinges.forEach((h) => { lab(h.x, f(h.x, 'L'), 1.4, { offs: [[-5, -6, 'end'], [-5, 14, 'end']] }); lab(h.x, f(h.x, 'R'), 1.4, { offs: [[5, -6, 'start'], [5, 14, 'start']] }); });
    } else if (kind === 'Y') {
      const ends = [0, g.L].filter((x) => !res.supports.some((s) => Math.abs(s.x - x) < 1e-9));
      ends.forEach((x) => lab(x, f(x), 2));
      res.hinges.forEach((h) => lab(h.x, f(h.x), 2));
      const lo = ex.Ymin, hi = ex.Ymax;
      if (lo && lo.v < -1e-9 * res.scales.Y) { lab(lo.x, f(lo.x), 3, { bold: true }); parts.push(`<circle class="ext-dot ${cls}" cx="${r1(X(lo.x))}" cy="${r1(Y(f(lo.x)))}" r="4"/>`); }
      if (hi && hi.v > 1e-9 * res.scales.Y) { lab(hi.x, f(hi.x), 3, { bold: true }); parts.push(`<circle class="ext-dot ${cls}" cx="${r1(X(hi.x))}" cy="${r1(Y(f(hi.x)))}" r="4"/>`); }
      res.supports.forEach((s) => { const x = X(s.x); parts.push(`<path class="sup-mark" d="M${r1(x)},${r1(y0 + 1)}l-5,8h10z"/>`); });
      res.contraflexure.filter((c) => !c.jump && !c.atHinge).forEach((c) => { if (c.x <= reveal) parts.push(`<circle class="infl" cx="${r1(X(c.x))}" cy="${r1(Y(f(c.x)))}" r="3.5"/>`); });
    }
    if (kind === 'M' || kind === 'V') glyphs.forEach((gl) => { if (gl.x <= X(reveal)) parts.push(`<text class="sign" x="${r1(gl.x)}" y="${r1(gl.y + 5)}" text-anchor="middle">${gl.s > 0 ? '+' : '−'}</text>`); });

    const placed = placeLabels(labels, { x0: g.padL - 6, x1: g.W - 2, y0: 1, y1: H - 1 }, glyphs.map((gl) => ({ x0: gl.x - 7, x1: gl.x + 7, y0: gl.y - 8, y1: gl.y + 8 })));
    parts.push(placed.map(labelSvg).join(''));
    return { svg: parts.join(''), Y, f, flip, tiny };
  }

  return { glyph, loading, diagram, supportShape, arcArrow, arrowHead, ticks, FONT, placeLabels, labelSvg };
})();
