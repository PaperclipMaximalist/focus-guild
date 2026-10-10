/**
 * The Salvage Line: a dispatch cabin above a breaker's yard, after dark. One
 * flat warm black for the sky with two low bands of dust, beached hulls in two
 * depths (low and few on the left, taller on the right, each leaning, each with
 * a bridge and a funnel), a gantry crane in thin lines whose hook sways a pixel
 * or two, and a sparse drift of dust flecks. A landing rail runs along the
 * bottom with a short mast at the far right.
 *
 * The visitor is a courier skiff: a long low hover-barge with a rounded cab, a
 * cargo bed with one sealed case, and the one blue stripe on its side (the one
 * use of the accent). Arriving, it slides in from the right and settles over
 * the rail at about 60 % across. Stopped, it hovers with a 2 px bob. Departing,
 * it lifts and backs away to the right (on the wide window it climbs, on a
 * phone it stays low, so it never crosses the words). Passing, a smaller, dimmer
 * one of the same shape crosses the right half behind the gantry. Away, the
 * yard and the dust are all there is.
 *
 * The signal is a two-lamp stack light on the mast: green below, amber above,
 * one lit at a time (amber when there are stragglers). One crate stands on the
 * dock for each quest finished today, in rows of four, up to three rows, left
 * of where the skiff docks. The companion is a moth on the right edge of the
 * frame: wings folded, one twitch every nine seconds or so while idle; wings
 * open and still while the skiff is docked; a hop of about 6 px when it leaves.
 *
 * Flat colours only: no gradients, no blur, no glow.
 */

import { defineScene } from '../types';

const SKY = '#110E0A';
const BAND_1 = '#191511';
const BAND_2 = '#1F1A14';
const HULL_FAR = '#2A231B';
const HULL_MID = '#29221A';
const HULL_LOW = '#261F18';
const HULL_HI = '#2F271E';
const IRON = '#3A3026';
const DOCK = '#15110D';
const PLANK = '#2A2219';
const POST = '#1B1611';
const EDGE = '#615240';
const SHADOW = '#070504';
const HOUSING = '#0B0907';
const LAMP_OFF = '#2A2219';
const DUST = '#B5A38A';
const LIGHT = '#F1E6D4';
// The skiff.
const SKIFF = '#62564A';
const SKIFF_HI = '#7A6C5C';
const SKIFF_LO = '#463C32';
const SKIFF_DARK = '#2F281F';
const CASE = '#8A7B68';
const WINDOW = '#F1E6D4';
const ACCENT = '#7CB7FF';
// Crates.
const CRATES = ['#6A5640', '#5E4D39', '#74603F'] as const;
const CRATE_HI = '#8C7455';
const CRATE_LO = '#43362A';
// Signal.
const GREEN = '#4BE083';
const AMBER = '#FFA640';
// Moth.
const MOTH = '#9A8B76';
const MOTH_D = '#6C5F4F';

const TAU = Math.PI * 2;
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) ** 2);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

interface Fleck { x: number; y: number; v: number; a: number }
/** A hull on its side: where it sits and how it is built. Lengths are in pixels. */
interface Hull { cx: number; L: number; D: number; tilt: number; dir: 1 | -1; big: boolean; tone: string; bridge: number; funnel: boolean; boom: boolean; lit: boolean }
interface State { dust: Fleck[]; hulls: Hull[] }

export default defineScene<State>({
  sky: SKY,
  timing: { arriving: 3600, departing: 3200, passing: 2600 },

  layout(w, h, rnd) {
    const wide = w >= 560;
    const dust: Fleck[] = Array.from({ length: Math.round(w / (wide ? 40 : 30)) }, () => ({
      x: rnd() * w,
      y: h * (0.1 + rnd() * 0.68),
      v: 3 + rnd() * 5,
      a: 0.18 + rnd() * 0.3,
    }));
    const hulls: Hull[] = wide
      ? [
          { cx: w * 0.335, L: w * 0.16, D: h * 0.12, tilt: -0.045, dir: -1, big: false, tone: HULL_MID, bridge: h * 0.07, funnel: true, boom: false, lit: false },
          { cx: w * 0.81, L: w * 0.22, D: h * 0.27, tilt: -0.085, dir: 1, big: true, tone: HULL_FAR, bridge: h * 0.17, funnel: true, boom: false, lit: true },
          { cx: w * 0.125, L: w * 0.17, D: h * 0.13, tilt: 0.055, dir: 1, big: false, tone: HULL_LOW, bridge: h * 0.085, funnel: true, boom: false, lit: false },
        ]
      : [
          { cx: w * 0.835, L: w * 0.24, D: h * 0.15, tilt: -0.08, dir: 1, big: true, tone: HULL_FAR, bridge: h * 0.09, funnel: true, boom: false, lit: false },
          { cx: w * 0.16, L: w * 0.3, D: h * 0.13, tilt: 0.07, dir: 1, big: false, tone: HULL_LOW, bridge: h * 0.085, funnel: true, boom: false, lit: false },
        ];
    return { dust, hulls };
  },

  draw(f, s) {
    const { ctx, w: W, h: H, t, dt, moving, wide } = f;
    const { phase, k } = f.visitor;

    const rect = (c: string, x: number, y: number, w: number, h: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };

    // ── Where things are ──
    const edge = Math.round(H * 0.8);
    const sc = (H * 0.155) / 32; // skiff design units: 32 tall, 104 long
    const skiffL = 104 * sc;
    const hover = 9;
    const stopX = Math.round(W * (wide ? 0.595 : 0.52));
    const mastX = W - (wide ? 30 : 17);
    const mastTop = Math.round(H * (wide ? 0.5 : 0.53));

    // ── Sky and dust bands: two low bands, none in the words' region ──
    rect(SKY, 0, 0, W, H);
    rect(BAND_1, 0, H * 0.66, W, edge - H * 0.66);
    rect(BAND_2, 0, H * 0.73, W, edge - H * 0.73);

    /** A beached hull on its side, bow to +x before it is flipped. Origin: the middle of the waterline. */
    const hull = (h: Hull) => {
      const { L, D } = h;
      const dip = h.big ? 0.6 : 0.8;
      ctx.save();
      ctx.translate(h.cx, edge - 1);
      ctx.rotate(h.tilt);
      ctx.scale(h.dir, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = h.tone;
      // The hull: raked bow, a dipping sheer, a square stern, a keel buried in the yard.
      ctx.beginPath();
      ctx.moveTo(-L * 0.5, 12);
      ctx.lineTo(-L * 0.5, -D * 0.78);
      ctx.quadraticCurveTo(-L * 0.5, -D * 0.86, -L * 0.46, -D * 0.86);
      ctx.bezierCurveTo(-L * 0.2, -D * dip, L * 0.12, -D * (dip + 0.04), L * 0.34, -D * 0.92);
      ctx.quadraticCurveTo(L * 0.44, -D * 1.02, L * 0.5, -D * 1.04);
      ctx.bezierCurveTo(L * 0.5, -D * 0.5, L * 0.46, -D * 0.1, L * 0.38, 12);
      ctx.closePath();
      ctx.fill();

      // Superstructure, aft: a house, a wheelhouse at its forward end, a raked funnel behind it.
      const deck = -D * (dip + 0.02);
      const top1 = deck - h.bridge * 0.55;
      const top2 = top1 - h.bridge * 0.42;
      ctx.beginPath();
      ctx.moveTo(-L * 0.42, deck + 4);
      ctx.lineTo(-L * 0.42, top1);
      ctx.lineTo(-L * 0.14, top1);
      ctx.quadraticCurveTo(-L * 0.115, top1, -L * 0.11, top1 + h.bridge * 0.12);
      ctx.lineTo(-L * 0.1, deck + 4);
      ctx.closePath();
      ctx.fill();
      // Wheelhouse: a raked front face, a flat roof.
      ctx.beginPath();
      ctx.moveTo(-L * 0.3, top1 + 1);
      ctx.lineTo(-L * 0.3, top2 + 2);
      ctx.quadraticCurveTo(-L * 0.3, top2, -L * 0.28, top2);
      ctx.lineTo(-L * 0.19, top2);
      ctx.lineTo(-L * 0.15, top1 + 1);
      ctx.closePath();
      ctx.fill();
      if (h.funnel) {
        const fw = Math.max(4, L * 0.05);
        const ft = top1 - h.bridge * 0.5;
        ctx.beginPath();
        ctx.moveTo(-L * 0.4, top1 + 1);
        ctx.lineTo(-L * 0.4 - fw * 0.4, ft);
        ctx.lineTo(-L * 0.4 + fw * 0.8, ft - 1);
        ctx.lineTo(-L * 0.4 + fw * 1.2, top1 + 1);
        ctx.closePath();
        ctx.fill();
        {
          ctx.fillStyle = HULL_HI;
          ctx.fillRect(-L * 0.4 - fw * 0.3, ft + h.bridge * 0.1, fw * 1.4, 2);
        }
      }
      // A mast above the wheelhouse.
      ctx.strokeStyle = h.tone;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-L * 0.24, top2);
      ctx.lineTo(-L * 0.24, top2 - h.bridge * 0.4);
      ctx.stroke();
      // A cargo boom forward: a post and a long arm cocked up over the bow.
      if (h.boom) {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(L * 0.16, -D * 0.7);
        ctx.lineTo(L * 0.16, -D * 1.45);
        ctx.lineTo(L * 0.38, -D * 1.1);
        ctx.moveTo(L * 0.16, -D * 1.45);
        ctx.lineTo(L * 0.02, -D * 0.68);
        ctx.stroke();
      }
      {
        // The edge of the deck catches a little of the yard's light.
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = HULL_HI;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-L * 0.46, -D * 0.86);
        ctx.bezierCurveTo(-L * 0.2, -D * dip, L * 0.12, -D * (dip + 0.04), L * 0.34, -D * 0.92);
        ctx.stroke();
      }
      if (h.lit) {
        // The one light left on in the yard.
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = LIGHT;
        ctx.fillRect(Math.round(-L * 0.26), Math.round(top2 + h.bridge * 0.1), 3, 2);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    /**
     * The courier skiff, nose to the left. Drawn in 104 x 32 design units about its
     * skid: one long low silhouette (a blunt nose, a rounded cab hump forward, a
     * flat cargo bed behind it with one sealed case, an engine pod at the tail),
     * one pale window, and the one blue stripe along the side.
     */
    const skiff = (cx: number, baseY: number, scale: number, rot: number, alpha: number) => {
      ctx.save();
      ctx.translate(cx, baseY - 16 * scale);
      ctx.rotate(rot);
      ctx.translate(0, 16 * scale);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;

      // Skid, on two short struts.
      ctx.fillStyle = SKIFF_DARK;
      ctx.fillRect(-28, -6, 3, 4);
      ctx.fillRect(22, -6, 3, 4);
      ctx.beginPath();
      ctx.roundRect(-42, -3, 82, 3, 1.5);
      ctx.fill();
      // Engine pod at the tail.
      ctx.beginPath();
      ctx.roundRect(42, -18, 12, 11, 3);
      ctx.fill();
      ctx.fillStyle = SKIFF_LO;
      ctx.fillRect(52, -15, 2, 5);

      // The hull and cab as one silhouette.
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(-52, -11);
        ctx.bezierCurveTo(-52, -7, -47, -5, -40, -5);
        ctx.lineTo(43, -5);
        ctx.quadraticCurveTo(48, -5, 48, -10);
        ctx.lineTo(48, -19);
        ctx.lineTo(-12, -19);
        ctx.bezierCurveTo(-14, -27, -18, -32, -27, -32);
        ctx.bezierCurveTo(-40, -32, -48, -24, -52, -14);
        ctx.closePath();
      };
      body();
      ctx.fillStyle = SKIFF;
      ctx.fill();
      ctx.save();
      body();
      ctx.clip();
      ctx.fillStyle = SKIFF_LO;
      ctx.fillRect(-60, -7.5, 120, 3);
      ctx.fillStyle = SKIFF_HI;
      ctx.fillRect(-12, -19.6, 60, 1.4);
      ctx.fillStyle = SKIFF_LO;
      ctx.fillRect(-12.5, -19, 1.2, 14);
      // The stripe: the one accent in the scene.
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ACCENT;
      ctx.fillRect(-30, -14.6, 76, 3);
      ctx.restore();

      // The window: one pale shape set into the cab.
      ctx.globalAlpha = alpha;
      ctx.fillStyle = WINDOW;
      ctx.beginPath();
      ctx.moveTo(-45, -20.5);
      ctx.bezierCurveTo(-42, -25.5, -37, -28.5, -30, -28.5);
      ctx.lineTo(-26, -28.5);
      ctx.bezierCurveTo(-23, -27, -21.5, -24, -21, -20.5);
      ctx.closePath();
      ctx.fill();

      // One sealed case on the bed.
      ctx.fillStyle = CASE;
      ctx.beginPath();
      ctx.roundRect(8, -29, 26, 10, 1.5);
      ctx.fill();
      ctx.fillStyle = SKIFF_LO;
      ctx.fillRect(8, -23, 26, 1);
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    // ── The far yard: hulls, then the gantry in front of them ──
    for (const h of s.hulls) hull(h);

    {
      const gx = W * (wide ? 0.91 : 0.84);
      const topY = H * (wide ? 0.17 : 0.3);
      const legW = wide ? 15 : 10;
      const jibY = topY + 4;
      const jibTo = W * (wide ? 0.725 : 0.72);
      const trolley = jibTo + (gx - jibTo) * 0.28;
      const sway = moving ? Math.sin(t / 2600) * 1.6 : 1;
      const hookY = H * (wide ? 0.44 : 0.56);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = IRON;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      // Two legs, leaning in.
      ctx.moveTo(gx - legW, edge);
      ctx.lineTo(gx - 4, topY);
      ctx.moveTo(gx + legW, edge);
      ctx.lineTo(gx + 4, topY);
      // Jib out over the yard, a short counter-jib the other way, and a stay between.
      ctx.moveTo(gx - 6, jibY);
      ctx.lineTo(jibTo, jibY);
      ctx.moveTo(gx + 5, jibY);
      ctx.lineTo(gx + legW * 1.7, jibY);
      ctx.moveTo(gx, topY - 5);
      ctx.lineTo(jibTo + 8, jibY);
      ctx.moveTo(gx, topY - 5);
      ctx.lineTo(gx + legW * 1.7, jibY);
      ctx.moveTo(gx, topY - 5);
      ctx.lineTo(gx, topY);
      ctx.stroke();
      // Cross-bracing between the legs.
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const rungs = 4;
      for (let i = 0; i < rungs; i += 1) {
        const y0 = topY + ((edge - topY) * (i + 0.15)) / rungs;
        const y1 = topY + ((edge - topY) * (i + 1)) / rungs;
        const half = (y: number) => 4 + ((legW - 4) * (y - topY)) / (edge - topY);
        ctx.moveTo(gx - half(y0), y0);
        ctx.lineTo(gx + half(y1), y1);
        ctx.moveTo(gx + half(y0), y0);
        ctx.lineTo(gx - half(y1), y1);
      }
      ctx.stroke();
      // The cable and hook, swinging a pixel or two.
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(trolley, jibY);
      ctx.lineTo(trolley + sway, hookY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(trolley + sway, hookY + 3, 3, -Math.PI * 0.55, Math.PI * 0.75);
      ctx.stroke();
      rect(IRON, trolley - 2, jibY - 1, 4, 3);
    }


    // ── A smaller one passing in the distance, in the right half, the same shape ──
    if (phase === 'passing') {
      const ps = sc * 0.55;
      const pl = skiffL * 0.55;
      const startX = W + pl / 2 + 10;
      const endX = wide ? W * 0.6 + pl / 2 : W * 0.28;
      const x = startX + (endX - startX) * easeInOut(k);
      const y = H * (wide ? 0.36 : 0.66);
      const fade = Math.min(1, k * 6) * Math.min(1, (1 - k) * 5);
      skiff(x, y, ps, 0, 0.62 * fade);
    }

    // ── Dust, drifting right ──
    for (const d of s.dust) {
      if (moving) {
        d.x += d.v * dt;
        if (d.x > W + 2) d.x = -2;
      }
      const inWords = d.x < W * (wide ? 0.55 : 1) && d.y < H * (wide ? 0.58 : 0.55);
      rect(DUST, d.x, d.y, wide ? 1 : 1.5, wide ? 1 : 1.5, inWords ? d.a * 0.45 : d.a);
    }

    // ── The visitor: a courier skiff ──
    if (phase === 'arriving' || phase === 'stopped' || phase === 'departing') {
      const baseY0 = edge - hover;
      const bob = moving && phase === 'stopped' ? Math.sin(t / 1100) : 0;
      let x = stopX;
      let y = baseY0 + bob;
      let rot = 0;
      if (phase === 'arriving') {
        const e = easeOut(k);
        x = stopX + (W + skiffL / 2 + 24 - stopX) * (1 - e);
        y = baseY0 - (wide ? 12 : 4) * (1 - e) ** 2;
        rot = 0.035 * (1 - e);
      } else if (phase === 'departing') {
        const lift = wide ? 40 : 7;
        const rise = wide ? 70 : 0;
        if (k < 0.3) {
          const u = easeInOut(k / 0.3);
          x = stopX + 14 * u;
          y = baseY0 - lift * u;
          rot = -0.03 * u;
        } else {
          const p = (k - 0.3) / 0.7;
          const q = p ** 1.7;
          const fromX = stopX + 14;
          x = fromX + (W + skiffL / 2 + 40 - fromX) * q;
          y = baseY0 - lift - rise * q;
          rot = -0.03 - 0.22 * Math.min(1, p * 2.5) * (wide ? 1 : 0.15);
        }
      }
      skiff(x, y, sc, rot, 1);
      // Where it hangs over the rail, a flat shadow on the planking.
      const near = clamp01(1 - (baseY0 - y) / 16);
      if (near > 0) rect(SHADOW, x - skiffL * 0.36, edge + 5, skiffL * 0.72, 2, 0.55 * near);
    }

    // ── The dock: a landing rail along the bottom ──
    rect(DOCK, 0, edge, W, H - edge);
    for (let px = 30; px < W; px += 72) rect(POST, px, edge + 3, 3, H - edge);
    rect(PLANK, 0, edge, W, 3);
    rect(EDGE, 0, edge, W, 1, 0.75);

    // ── Done: one crate on the dock for each quest finished, rows of four, left of the berth ──
    {
      const cw = wide ? 15 : 11;
      const ch = wide ? 12 : 9;
      const left = stopX - skiffL / 2 - 22 - 4 * (cw + 2) + 2;
      const n = Math.min(12, Math.max(0, f.done));
      for (let i = 0; i < n; i += 1) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const x = left + col * (cw + 2);
        const y = edge - ch - row * (ch + 1);
        rect(CRATES[(i * 7) % 3]!, x, y, cw, ch);
        rect(CRATE_HI, x, y, cw, 1);
        rect(CRATE_LO, x + Math.floor(cw / 2), y + 1, 1, ch - 1);
        rect(CRATE_LO, x, y + ch - 1, cw, 1, 0.8);
      }
    }

    // ── The signal: a two-lamp stack light on the mast. One lit; green below, amber above ──
    {
      rect(IRON, mastX - 1, mastTop, 2, edge - mastTop);
      rect(PLANK, mastX - 4, edge - 3, 8, 3);
      const lx = mastX - 5;
      const ly = mastTop - 25;
      ctx.globalAlpha = 1;
      rect(HOUSING, lx - 1, ly - 3, 12, 3);
      rect(HOUSING, lx - 1, ly + 18, 12, 3);
      const lamp = (y: number, colour: string, lit: boolean) => {
        ctx.fillStyle = lit ? colour : LAMP_OFF;
        ctx.beginPath();
        ctx.roundRect(lx, y, 10, 8, 2);
        ctx.fill();
      };
      lamp(ly, AMBER, f.caution);
      lamp(ly + 9, GREEN, !f.caution);
      rect(HOUSING, lx - 1, ly + 8, 12, 1);
    }

    // ── The companion: a moth on the right edge of the frame ──
    {
      const open = phase === 'stopped' || (phase === 'arriving' && k > 0.9) || (phase === 'departing' && k < 0.55);
      let dy = 0;
      if (phase === 'departing') dy = -6 * Math.sin(Math.PI * clamp01((k - 0.08) / 0.5));
      const twitch = moving && !open && t % 9000 < 200 ? 1 : 0;
      const mx = W - (open ? 9 : 6) + twitch;
      const my = Math.round(H * 0.3) + dy;
      ctx.globalAlpha = 1;
      if (open) {
        // Wings spread flat: a pair of fore-wings over a pair of smaller hind-wings.
        for (const side of [-1, 1] as const) {
          ctx.fillStyle = MOTH;
          ctx.beginPath();
          ctx.moveTo(mx + side * 0.8, my - 1);
          ctx.bezierCurveTo(mx + side * 3, my - 6.5, mx + side * 7.5, my - 5.5, mx + side * 6.8, my - 0.5);
          ctx.bezierCurveTo(mx + side * 6, my + 1.5, mx + side * 3, my + 2, mx + side * 0.8, my + 1);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = MOTH_D;
          ctx.beginPath();
          ctx.moveTo(mx + side * 0.8, my + 1);
          ctx.bezierCurveTo(mx + side * 4, my + 1.5, mx + side * 6, my + 4, mx + side * 3.6, my + 6);
          ctx.bezierCurveTo(mx + side * 2, my + 6, mx + side * 0.8, my + 4, mx + side * 0.8, my + 1);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = MOTH_D;
        ctx.beginPath();
        ctx.ellipse(mx, my + 0.5, 1.3, 4.6, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = MOTH_D;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx - 0.5, my - 4);
        ctx.lineTo(mx - 2.5, my - 8);
        ctx.moveTo(mx + 0.5, my - 4);
        ctx.lineTo(mx + 2.5, my - 8);
        ctx.stroke();
      } else {
        // Wings folded over the back like a roof: a long teardrop with two feelers.
        ctx.strokeStyle = MOTH_D;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx - 0.5, my - 4);
        ctx.lineTo(mx - 3 - twitch, my - 9);
        ctx.moveTo(mx + 0.5, my - 4);
        ctx.lineTo(mx + 3, my - 9);
        ctx.stroke();
        ctx.fillStyle = MOTH;
        ctx.beginPath();
        ctx.moveTo(mx, my - 4);
        ctx.lineTo(mx + 5, my + 4.5);
        ctx.quadraticCurveTo(mx, my + 7, mx - 5, my + 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = MOTH_D;
        ctx.fillRect(Math.round(mx), Math.round(my - 3), 1, 9);
        ctx.fillRect(Math.round(mx - 3), Math.round(my + 3), 2, 1);
        ctx.fillRect(Math.round(mx + 2), Math.round(my + 3), 2, 1);
      }
    }
    ctx.globalAlpha = 1;
  },
});
