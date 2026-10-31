// The ice reel's one world, drawn on a canvas as one function of the reel's frame. Every scene draws this, so the
// reel never cuts: two glasses, a lens into the water, the lens closing, then the glass walls opening into a lake.
//   hook    left: wax shrinks and sinks. right: water grows as it freezes and floats, about a twelfth above the surface
//   liquid  the lens opens on the water: the molecules tumble, packed close
//   rings   the same molecules lock into a honeycomb; one ring's empty middle is marked
//   room    the old outline beside the new one, the lens closes, densities on the cube
//   lake    the walls slide away, a sheet of ice grows down from the surface, fish swim under it
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { ease, mix, prog, spline, useReel } from "../../../src/engine";

const GLASS = { top: 640, bottom: 1340, level: 780, half: 190 };
const LEFT = 230, RIGHT = 850;
const CUBE = 150, GROW = 1.08; // the drawn side; volume grows about a tenth, the side shown a little over that to read
const ABOVE = 0.083; // ice at 0.917 g/cm³ keeps this share of its height above the water
const LENS = { x: 540, y: 1010, r: 470 };
const LIQUID_HALF = 280, ICE_HALF = 304; // the two outlines; the same molecules need the bigger one once frozen
const BOND = 56;

type T = {
  shrinks: number; freezes: number; opposite: number; floats: number;
  liquid: number; tumble: number; together: number;
  lock: number; rings: number; empty: number;
  same: number; room: number; bigger: number; lighter: number;
  lake: number; top: number; fish: number; end: number;
};

type Mol = { lx: number; ly: number; hx: number; hy: number; angle: number; spin: number; a: number; b: number; c: number; delay: number };
type Lattice = { mols: Mol[]; bonds: [number, number][]; hole: [number, number][] };

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a honeycomb inside the ice outline, and a jittered close pack of exactly as many molecules inside the liquid one */
function buildLattice(): Lattice {
  const rnd = mulberry(7);
  const seen = new Map<string, [number, number]>();
  const hexAt = (cx: number, cy: number) => [0, 1, 2, 3, 4, 5].map((k): [number, number] =>
    [cx + BOND * Math.sin((k * Math.PI) / 3), cy - BOND * Math.cos((k * Math.PI) / 3)]);
  for (let j = -9; j <= 9; j++) for (let i = -9; i <= 9; i++) {
    for (const [x, y] of hexAt(Math.sqrt(3) * BOND * (i + j / 2), 1.5 * BOND * j)) {
      if (Math.abs(x) < ICE_HALF - 18 && Math.abs(y) < ICE_HALF - 18) seen.set(`${Math.round(x)},${Math.round(y)}`, [x, y]);
    }
  }
  const byRow = (a: [number, number], b: [number, number]) => Math.round(a[1] / 50) - Math.round(b[1] / 50) || a[0] - b[0];
  const ice = [...seen.values()].sort(byRow);
  const n = ice.length;
  let d = Math.sqrt((2 * (2 * LIQUID_HALF) ** 2) / (Math.sqrt(3) * n)) * 0.98;
  let pack: [number, number][] = [];
  for (; pack.length < n; d *= 0.99) {
    pack = [];
    for (let r = -12; r <= 12; r++) for (let q = -12; q <= 12; q++) {
      const x = d * (q + (r % 2 ? 0.5 : 0)), y = (d * r * Math.sqrt(3)) / 2;
      if (Math.abs(x) < LIQUID_HALF - 18 && Math.abs(y) < LIQUID_HALF - 18) pack.push([x, y]);
    }
  }
  pack = pack.sort(() => rnd() - 0.5).slice(0, n).sort(byRow);
  const bonds: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.hypot(ice[i][0] - ice[j][0], ice[i][1] - ice[j][1]) < BOND * 1.1) bonds.push([i, j]);
  }
  const mols = ice.map(([hx, hy], i): Mol => {
    const near = bonds.find((b) => b.includes(i));
    const o = near ? ice[near[0] === i ? near[1] : near[0]] : [hx + 1, hy];
    return { lx: pack[i][0], ly: pack[i][1], hx, hy, angle: Math.atan2(o[1] - hy, o[0] - hx), spin: (rnd() < 0.5 ? -1 : 1) * (0.02 + rnd() * 0.03), a: rnd() * 6.28, b: rnd() * 6.28, c: rnd() * 6.28, delay: Math.hypot(hx, hy) / ICE_HALF };
  });
  const near0 = [0, Math.sqrt(3) * BOND].flatMap((cx) => [0, 1.5 * BOND].map((cy) => [cx / 2, cy] as [number, number]))[0];
  return { mols, bonds, hole: hexAt(near0[0], near0[1]) };
}

function label(g: CanvasRenderingContext2D, x: number, y: number, text: string, a: number, color: string) {
  if (a <= 0) return;
  g.globalAlpha = a; g.font = "700 46px Inter, sans-serif"; g.textAlign = "center";
  const w = g.measureText(text).width + 36;
  g.fillStyle = "rgba(0,0,0,0.62)"; g.beginPath(); g.roundRect(x - w / 2, y - 42, w, 60, 10); g.fill();
  g.fillStyle = color; g.fillText(text, x, y + 2);
  g.globalAlpha = 1;
}

function block(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string, edge: string) {
  g.fillStyle = c; g.beginPath(); g.roundRect(x - w / 2, y, w, h, 12); g.fill();
  g.strokeStyle = edge; g.lineWidth = 3; g.stroke();
}

function fish(g: CanvasRenderingContext2D, x: number, y: number, s: number, f: number, phase: number) {
  const wag = Math.sin(f * 0.22 + phase) * 0.35;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = "#F2B24C";
  g.beginPath(); g.moveTo(-34, 0); g.lineTo(-62, -20 + wag * 26); g.lineTo(-62, 20 + wag * 26); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(0, 0, 44, 20, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#111214"; g.beginPath(); g.arc(26, -5, 3.5, 0, Math.PI * 2); g.fill();
  g.restore();
}

function paint(g: CanvasRenderingContext2D, f: number, t: T, L: Lattice, bg: string, ink: string, accent: string) {
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1920);

  // the camera: slides to the right glass as the ice floats, leans in behind the lens, eases back for the lake
  const wx = spline(f, [[0, 540], [t.floats, 540], [t.floats + 100, RIGHT], [t.end, RIGHT]]);
  const z = spline(f, [[0, 1], [t.floats, 1], [t.floats + 100, 1.35], [t.liquid, 1.35], [t.lighter, 1.45], [t.lake, 1.35], [t.end, 1.14]]);
  const wy = 1000;
  const X = (x: number) => 540 + (x - wx) * z, Y = (y: number) => 1010 + (y - wy) * z;

  // the lake: stars come out, and the right glass's walls slide off to either side
  const open = prog(f, t.lake, 110, ease.inOut);
  const stars = mulberry(3);
  g.fillStyle = "#FFFFFF";
  for (let i = 0; i < 40; i++) {
    const sx = stars() * 1080, sy = 520 + stars() * 330;
    g.globalAlpha = open * (0.35 + 0.3 * Math.sin(f * 0.03 + i));
    g.beginPath(); g.arc(sx, sy, 2.4, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;

  const glass = (cx: number, half: number, fill: string, deep: string) => {
    const top = GLASS.level, bot = GLASS.bottom;
    const w = g.createLinearGradient(0, Y(top), 0, Y(bot));
    w.addColorStop(0, fill); w.addColorStop(1, deep);
    g.fillStyle = w;
    g.beginPath(); g.moveTo(X(cx - half), Y(bot));
    for (let x = -half; x <= half; x += 12) g.lineTo(X(cx + x), Y(top + 3 * Math.sin(x / 34 + f / 22)));
    g.lineTo(X(cx + half), Y(bot)); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 5;
    g.beginPath(); g.moveTo(X(cx - half), Y(GLASS.top)); g.lineTo(X(cx - half), Y(bot)); g.lineTo(X(cx + half), Y(bot)); g.lineTo(X(cx + half), Y(GLASS.top)); g.stroke();
  };

  // left: molten wax, its solid block sinks once it has shrunk
  const lx = LEFT - open * 1500;
  if (X(lx + GLASS.half) > -20) {
    glass(lx, GLASS.half, "#B4823A", "#7C5624");
    const s = 1 - 0.1 * prog(f, t.shrinks, 40, ease.inOut);
    const w = CUBE * s;
    const held = GLASS.level + 50;
    const y = held + (GLASS.bottom - 3 - w - held) * prog(f, t.freezes, 80, ease.inOut);
    block(g, X(lx), Y(y), w * z, w * z, "#E9D29C", "#FFF3CF");
    const wire = 1 - prog(f, t.freezes, 24, ease.out);
    if (wire > 0) { g.strokeStyle = "#D8D8D8"; g.lineWidth = 3; g.beginPath(); g.moveTo(X(lx), Y(GLASS.top)); g.lineTo(X(lx), Y(GLASS.top + (held - GLASS.top) * wire)); g.stroke(); }
  }

  // right: water, its block held under until it has grown, then let go. It rises and settles at its true float line
  const half = GLASS.half + open * 1500;
  glass(RIGHT, half, "#2F7FB8", "#123F63");
  const size = CUBE * (1 + (GROW - 1) * prog(f, t.opposite, 40, ease.inOut));
  const rest = GLASS.level - size * ABOVE;
  const heldR = GLASS.level + 50;
  const q = Math.max(0, (f - t.floats) / 60);
  const eased = (q * q) / (q + 0.3);
  const cubeY = f < t.floats ? heldR : rest + (heldR - rest) * Math.exp(-2.2 * eased) * Math.cos(3.4 * eased);
  const sheet = prog(f, t.top, 150, ease.inOut) * 74;

  // the ice sheet thickens from the surface down, in the water, the cube locked into it
  if (sheet > 0) {
    g.fillStyle = "#CFEAF7";
    g.fillRect(X(RIGHT - half), Y(GLASS.level - 4), (2 * half) * z, (sheet + 4) * z);
    g.fillStyle = "rgba(255,255,255,0.8)"; g.fillRect(X(RIGHT - half), Y(GLASS.level - 4), (2 * half) * z, 4);
  }
  block(g, X(RIGHT), Y(cubeY), size * z, size * z, "rgba(214,240,252,0.94)", "#FFFFFF");
  const wire = 1 - prog(f, t.floats, 24, ease.out);
  if (wire > 0) { g.strokeStyle = "#D8D8D8"; g.lineWidth = 3; g.beginPath(); g.moveTo(X(RIGHT), Y(GLASS.top)); g.lineTo(X(RIGHT), Y(GLASS.top + (heldR - GLASS.top) * wire)); g.stroke(); }

  // the lens: everything at the scale of molecules happens inside it
  const r = LENS.r * spline(f, [[t.liquid - 34, 0], [t.liquid + 26, 1], [t.lighter - 34, 1], [t.lighter + 16, 0]].map(([a, b]) => [a, b] as [number, number]));
  if (f > t.liquid - 34 && f < t.lighter + 16 && r > 1) {
    g.save();
    g.beginPath(); g.arc(LENS.x, LENS.y, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#0A2F4C"; g.fillRect(0, 0, 1080, 1920);
    const P = L.mols.map((m) => {
      const lock = prog(f, t.lock + m.delay * 30, 56, ease.inOut);
      const lx = m.lx + 11 * Math.sin(f * 0.041 + m.a) + 6 * Math.sin(f * 0.073 + m.b);
      const ly = m.ly + 11 * Math.sin(f * 0.037 + m.b) + 6 * Math.cos(f * 0.067 + m.c);
      const shake = 1.4 * lock;
      return {
        x: LENS.x + lx + (m.hx - lx) * lock + shake * Math.sin(f * 0.3 + m.a),
        y: LENS.y + ly + (m.hy - ly) * lock + shake * Math.cos(f * 0.27 + m.b),
        ang: (m.a + m.spin * f) * (1 - lock) + m.angle * lock,
      };
    });

    // the bonds that hold the honeycomb open
    const bond = prog(f, t.rings, 30, ease.out);
    if (bond > 0) {
      g.strokeStyle = `rgba(190,226,255,${0.75 * bond})`; g.lineWidth = 4; g.setLineDash([8, 8]);
      for (const [a, b] of L.bonds) { g.beginPath(); g.moveTo(P[a].x, P[a].y); g.lineTo(P[b].x, P[b].y); g.stroke(); }
      g.setLineDash([]);
    }
    // the empty middle of one ring
    const hole = prog(f, t.empty, 26, ease.out);
    if (hole > 0) {
      g.fillStyle = mix(f, t.empty, 26, "#0A2F4C", accent); g.globalAlpha = 0.75 * hole;
      g.beginPath(); L.hole.forEach(([x, y], i) => (i ? g.lineTo(LENS.x + x, LENS.y + y) : g.moveTo(LENS.x + x, LENS.y + y))); g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    // the molecules: one oxygen, two hydrogens at the real 104.5 degrees
    for (const p of P) {
      g.fillStyle = "#EDEDED";
      for (const sign of [-1, 1]) {
        const a = p.ang + (sign * 1.824) / 2;
        g.beginPath(); g.arc(p.x + 21 * Math.cos(a), p.y + 21 * Math.sin(a), 8, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = "#E5484D"; g.beginPath(); g.arc(p.x, p.y, 15, 0, Math.PI * 2); g.fill();
    }
    // the outline of the water beside the outline of the ice
    const was = prog(f, t.same, 24, ease.out), now = prog(f, t.room, 30, ease.inOut);
    const outline = (h: number, c: string, a: number) => {
      if (a <= 0) return;
      g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = 5; g.setLineDash([18, 12]);
      g.strokeRect(LENS.x - h, LENS.y - h, 2 * h, 2 * h); g.setLineDash([]); g.globalAlpha = 1;
    };
    outline(LIQUID_HALF + (ICE_HALF - LIQUID_HALF) * now, accent, was);
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 6; g.beginPath(); g.arc(LENS.x, LENS.y, r, 0, Math.PI * 2); g.stroke();
  }

  // the numbers on the glass once the lens has gone
  const out = 1 - prog(f, t.lake, 30, ease.out);
  label(g, X(RIGHT), Y(cubeY) + (size * z) / 2 + 12, "ice 0.92 g/cm³", prog(f, t.lighter + 16, 22, ease.out) * out, ink);
  label(g, X(RIGHT), Y(1240), "water 1.00 g/cm³", prog(f, t.lighter + 30, 22, ease.out) * out, ink);

  // two fish under the ice, swimming in from the left on their word
  const swim = (start: number, y: number, s: number, ph: number) => {
    const p = prog(f, start, 200, ease.out);
    if (p > 0) fish(g, -120 + p * (420 + 90 * s) + Math.max(0, f - start) * 1.1, Y(y) + 10 * Math.sin(f * 0.04 + ph), s, f, ph);
  };
  swim(t.fish, 1040, 1.5, 0);
  swim(t.fish + 12, 1190, 1.15, 2);
}

export const IceWorld: React.FC = () => {
  const { tl, theme } = useReel();
  const f = useCurrentFrame();
  const k = 60 / tl.fps; // the world is written in 60 fps frames; a 30 fps draft plays the same
  const t = useMemo<T>(() => {
    const c = (w: string, s: number) => tl.cue(w, 1, s) * k;
    return {
      shrinks: c("shrinks", 0), freezes: c("freezes", 0), opposite: c("opposite", 0), floats: c("floats", 0),
      liquid: c("liquid", 1), tumble: c("tumble", 1), together: c("together", 1),
      lock: c("freezes", 2), rings: c("rings", 2), empty: c("empty", 2),
      same: c("same", 3), room: c("room", 3), bigger: c("bigger", 3), lighter: c("lighter", 3),
      lake: c("lake", 4), top: c("top", 4), fish: c("fish", 4), end: tl.frames * k,
    };
  }, [tl, k]);
  const L = useMemo(buildLattice, []);
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g) paint(g, f * k, t, L, theme.grounds.dark.bg, theme.grounds.dark.ink, theme.marker.color);
  });
  return <canvas ref={ref} width={1080} height={1920} style={{ position: "absolute", inset: 0, width: 1080, height: 1920 }} />;
};
