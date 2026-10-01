// Geographic features (M6, docs/plans/geography.md): mountain ranges, rivers, lakes and the character of the coast.
// Rendering only: nothing here affects placement, line of sight or exploration. Deterministic from the geometry.
import type { Geometry } from './geometry.ts';
import type { MapFeatures, MapRidge, MultiPolygon } from './mapdata.ts';
import { hash32, mulberry32 } from './prng.ts';
import type { Vec2 } from './types.ts';

/** Ridges at least this high are drawn as mountain ranges. */
export const RANGE_MIN_H = 3;
/** Peak spacing along a range, and how close a peak may come to a shrine glyph. */
const PEAK_SPACING = 20;
const GLYPH_CLEARANCE = 16;
/** River grid step (world units) and the drainage area (in cells) at which a stream is drawn. */
const RIVER_STEP = 6;
const RIVER_MIN_FLOW = 260;
/** Rivers shorter than this (in points) are dropped as noise. */
const RIVER_MIN_POINTS = 8;

const q = (v: number) => Math.round(v * 10) / 10;

export function buildFeatures(geo: Geometry, ridges: MapRidge[], coast: MultiPolygon, shrineXY: Vec2[]): MapFeatures {
  return {
    ranges: ranges(ridges, shrineXY),
    rivers: rivers(geo),
    lakes: geo.lakes.map((l, i) => ({ id: `lake-${i + 1}`, xy: [q(l.xy[0]), q(l.xy[1])] as Vec2, r: q(l.r) })),
    shore: shore(geo, coast),
  };
}

/** Peaks along every h ≥ 3 ridge line, sized by the ridge height, kept clear of shrine glyphs. */
function ranges(ridges: MapRidge[], shrineXY: Vec2[]): MapFeatures['ranges'] {
  const out: MapFeatures['ranges'] = [];
  for (const r of ridges) {
    if (r.h < RANGE_MIN_H) continue;
    const rand = mulberry32(hash32(`range:${r.between.join('|')}`));
    const peaks: MapFeatures['ranges'][number]['peaks'] = [];
    for (const line of r.lines) {
      let carry = PEAK_SPACING / 2;
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1]!;
        const b = line[k]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = carry; t < len; t += PEAK_SPACING) {
          const p: Vec2 = [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len];
          // Peaks sit a little either side of the border line, so a range reads as a band, not a fence.
          const off = (rand() - 0.5) * 10;
          const nx = -(b[1] - a[1]) / len;
          const ny = (b[0] - a[0]) / len;
          const xy: Vec2 = [q(p[0] + nx * off), q(p[1] + ny * off)];
          const size = q((0.75 + 0.5 * rand()) * (r.h >= 4 ? 1.35 : 1));
          if (shrineXY.every((s) => Math.hypot(s[0] - xy[0], s[1] - xy[1]) > GLYPH_CLEARANCE)) peaks.push({ xy, size, snow: r.h >= 4 && rand() < 0.75 });
        }
        carry = (carry - len) % PEAK_SPACING;
        if (carry < 0) carry += PEAK_SPACING;
      }
    }
    if (peaks.length) out.push({ id: `range-${r.between.join('-')}`, between: r.between, h: r.h, peaks });
  }
  return out;
}

/**
 * Rivers from a priority flood (Barnes et al.): water cells seed a queue, and every land cell drains to the neighbour it
 * was reached from, so there are no pits and every stream reaches the sea or a lake. Each cell collects one unit of rain;
 * cells draining at least RIVER_MIN_FLOW are river. Polylines run from each river head down to the mouth, or to the
 * point where they join a river already traced. Widths grow with the flow.
 */
function rivers(geo: Geometry): MapFeatures['rivers'] {
  const n = Math.floor(geo.width / RIVER_STEP) + 1;
  const m = Math.floor(geo.height / RIVER_STEP) + 1;
  const N = n * m;
  const elev = new Float64Array(N);
  const water = new Uint8Array(N);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const x = i * RIVER_STEP;
    const y = j * RIVER_STEP;
    const c = j * n + i;
    water[c] = geo.landSigned(x, y) <= 0 ? 1 : 0;
    elev[c] = geo.elevation(x, y);
  }
  const down = new Int32Array(N).fill(-1);
  const filled = Float64Array.from(elev);
  const done = new Uint8Array(N);
  // A binary heap keyed by filled elevation; ties broken by cell index, so the result is deterministic.
  const heap: number[] = [];
  const less = (a: number, b: number) => filled[a]! < filled[b]! || (filled[a] === filled[b] && a < b);
  const push = (c: number) => {
    heap.push(c);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!less(heap[i]!, heap[p]!)) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < heap.length && less(heap[l]!, heap[s]!)) s = l;
        if (r < heap.length && less(heap[r]!, heap[s]!)) s = r;
        if (s === i) break;
        [heap[i], heap[s]] = [heap[s]!, heap[i]!];
        i = s;
      }
    }
    return top;
  };
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  for (let c = 0; c < N; c++) {
    if (!water[c]) continue;
    const i = c % n;
    const j = (c - i) / n;
    // Seed with water cells on the shore only.
    if (NB.some(([di, dj]) => { const a = i + di, b = j + dj; return a >= 0 && b >= 0 && a < n && b < m && !water[b * n + a]; })) {
      done[c] = 1;
      push(c);
    } else done[c] = 1;
  }
  const order: number[] = [];
  while (heap.length) {
    const c = pop();
    const i = c % n;
    const j = (c - i) / n;
    for (const [di, dj] of NB) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= m) continue;
      const d = b * n + a;
      if (done[d]) continue;
      done[d] = 1;
      filled[d] = Math.max(elev[d]!, filled[c]! + 1e-6);
      down[d] = c;
      order.push(d);
      push(d);
    }
  }
  // Flow accumulation, upstream first (reverse of the order cells were reached in).
  const flow = new Float64Array(N);
  for (let k = order.length - 1; k >= 0; k--) {
    const c = order[k]!;
    flow[c]! += 1;
    const d = down[c]!;
    if (d >= 0 && !water[d]) flow[d]! += flow[c]!;
  }
  const isRiver = (c: number) => !water[c] && flow[c]! >= RIVER_MIN_FLOW;
  // Heads: river cells with no river cell draining into them.
  const fed = new Uint8Array(N);
  for (let c = 0; c < N; c++) if (isRiver(c) && down[c]! >= 0 && isRiver(down[c]!)) fed[down[c]!] = 1;
  const heads: number[] = [];
  for (let c = 0; c < N; c++) if (isRiver(c) && !fed[c]) heads.push(c);
  // Longest rivers first, so a tributary stops where it meets one already drawn.
  const length = (c: number) => { let k = 0; for (let d = c; d >= 0 && isRiver(d); d = down[d]!) k++; return k; };
  heads.sort((a, b) => length(b) - length(a) || a - b);
  const drawn = new Uint8Array(N);
  const xy = (c: number): Vec2 => [(c % n) * RIVER_STEP, Math.floor(c / n) * RIVER_STEP];
  const out: MapFeatures['rivers'] = [];
  for (const h of heads) {
    const cells: number[] = [];
    let c = h;
    while (c >= 0 && !drawn[c] && !water[c]) {
      cells.push(c);
      c = down[c]!;
    }
    if (c >= 0) cells.push(c); // the mouth (a water cell) or the junction
    // Too short to draw: leave its cells free, or a longer river would stop at a junction nobody can see.
    if (cells.length < RIVER_MIN_POINTS) continue;
    for (const k of cells) if (!water[k]) drawn[k] = 1;
    const line = smooth(meander(cells.map(xy), h), 3).map(([x, y]) => [q(x), q(y)] as Vec2);
    const widths = cells.map((k) => q(Math.min(4, 0.8 + Math.sqrt(flow[k]! / RIVER_MIN_FLOW))));
    out.push({ id: '', line, width: [widths[0]!, widths[widths.length - 1]!] });
  }
  // Ids by mouth position (west to east, then north to south): stable while the geometry is.
  out.sort((a, b) => a.line.at(-1)![0] - b.line.at(-1)![0] || a.line.at(-1)![1] - b.line.at(-1)![1]);
  out.forEach((r, i) => (r.id = `river-${i + 1}`));
  return out;
}

/**
 * Across flats the flood routes water in straight grid lines; bend them a little sideways with two sines along the arc
 * length (phases from the river's head), fading to nothing at both ends so mouths and junctions stay where they are.
 */
function meander(pts: Vec2[], key: number): Vec2[] {
  if (pts.length < 4) return pts;
  const rand = mulberry32(hash32(`river:${key}`));
  const p1 = rand() * 2 * Math.PI;
  const p2 = rand() * 2 * Math.PI;
  let s = 0;
  return pts.map((p, k) => {
    if (k === 0 || k === pts.length - 1) return p;
    const a = pts[k - 1]!;
    const b = pts[k + 1]!;
    s += Math.hypot(p[0] - a[0], p[1] - a[1]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const fade = Math.min(1, k / 4, (pts.length - 1 - k) / 4);
    const off = fade * RIVER_STEP * 0.6 * (Math.sin(s / 26 + p1) + 0.5 * Math.sin(s / 11 + p2));
    return [p[0] - ((b[1] - a[1]) / len) * off, p[1] + ((b[0] - a[0]) / len) * off];
  });
}

/** Chaikin corner cutting, keeping the end points. */
function smooth(pts: Vec2[], rounds: number): Vec2[] {
  let p = pts;
  for (let r = 0; r < rounds && p.length > 2; r++) {
    const next: Vec2[] = [p[0]!];
    for (let k = 0; k < p.length - 1; k++) {
      const a = p[k]!;
      const b = p[k + 1]!;
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(p.at(-1)!);
    p = next;
  }
  return p;
}

/**
 * The coast's character: stretches where the ground just inland is high are cliffs, low stretches by low ground are
 * beaches. Lake shores count too.
 */
function shore(geo: Geometry, coast: MultiPolygon): MapFeatures['shore'] {
  const cliffs: Vec2[][] = [];
  const beaches: Vec2[][] = [];
  for (const poly of coast) for (const ring of poly) {
    let kind: 'cliff' | 'beach' | null = null;
    let run: Vec2[] = [];
    const flush = () => {
      if (run.length > 3 && kind) (kind === 'cliff' ? cliffs : beaches).push(run);
      run = [];
    };
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]!;
      const b = ring[(k + 1) % ring.length]!;
      // Step inland along the normal (whichever side is land).
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = -(b[1] - a[1]) / len;
      let ny = (b[0] - a[0]) / len;
      if (geo.landSigned(a[0] + nx * 12, a[1] + ny * 12) < geo.landSigned(a[0] - nx * 12, a[1] - ny * 12)) [nx, ny] = [-nx, -ny];
      // Judge by the ground a little way inland: right at the shore everything is tapered down to the sea.
      const e = geo.elevation(a[0] + nx * 45, a[1] + ny * 45);
      const here = e > 0.6 ? 'cliff' : e < 0.3 ? 'beach' : null;
      if (here !== kind) {
        flush();
        kind = here;
      }
      if (kind) run.push(a);
    }
    flush();
  }
  return { cliffs, beaches };
}
