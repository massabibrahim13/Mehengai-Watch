// The hero's backdrop: ribbons of fine flowing lines drawn on a canvas.
// - Idle: the ribbons drift slowly (redrawn 30 times a second — the drift is too slow to need more).
// - Pointer moves: they speed up (60 fps) and the strands bend away from the pointer.
// - Click / tap: a ripple runs out from that point.
// - "Reduce motion": one still frame, no reactions. Paused while off screen.
// Speed: the canvas is drawn at a lower resolution than the screen and scaled up (fine glowing lines barely
// change); if frames still run slow on this machine, the resolution steps down further by itself.
// Purely decorative (aria-hidden); colours follow the light/dark theme.
import { useEffect, useRef } from "react";
import { useTheme, type Theme } from "../lib/theme";

interface Ribbon {
  lines: number; // strands in the ribbon
  y0: number; // centre height at the left edge (fraction of canvas height)
  y1: number; // … and at the right edge
  amp: number; // wave height (fraction of height)
  spread: number; // distance between the first and last strand (fraction of height)
  waves: number; // waves across the width
  twist: number; // how much the strands fold over each other
  speed: number; // relative drift speed
  alpha: number; // brightness
  sheen: number; // opacity of the soft fill between the outer strands
  phase: number;
}

const RIBBONS: Ribbon[] = [
  { lines: 36, y0: 0.86, y1: 0.5, amp: 0.13, spread: 0.16, waves: 0.85, twist: 3.2, speed: 1, alpha: 0.66, sheen: 0.08, phase: 0 },
  { lines: 22, y0: 0.12, y1: 0.3, amp: 0.09, spread: 0.12, waves: 1.1, twist: -2.6, speed: 0.7, alpha: 0.36, sheen: 0.04, phase: 2.1 },
];

// left → middle → right colours of each ribbon, per theme (brand greens into teal and blue)
const PALETTE: Record<Theme, { colors: [string, string, string][]; blend: GlobalCompositeOperation; boost: number }> = {
  dark: { colors: [["#3fd99a", "#36c8e0", "#5b7cfa"], ["#2bb3a3", "#4c8fe6", "#8b6cf6"]], blend: "lighter", boost: 1 },
  light: { colors: [["#0c8f5a", "#0e9aa7", "#2a78d6"], ["#0e9aa7", "#2a78d6", "#6d5bd0"]], blend: "source-over", boost: 0.66 },
};

const IDLE = 0.16; // drift speed when nobody is interacting
const TAU = Math.PI * 2;
const STEP = 12; // CSS px between points along a strand
const MAX_SCALE = 1; // canvas pixels per CSS pixel (never more, even on high-density screens)
const MIN_SCALE = 0.5;

interface Ripple { x: number; y: number; born: number }

export function WaveField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const themeChanged = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const host = canvas.parentElement!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bestScale = () => Math.min(MAX_SCALE, window.devicePixelRatio || 1);
    let scale = bestScale(); // canvas px per CSS px
    let cssW = 0, cssH = 0, W = 0, H = 0;
    let raf = 0, last = performance.now(), clock = 4, frameNo = 0;
    let speed = IDLE, targetSpeed = IDLE, energy = 0, targetEnergy = 0, lastActive = -1e9;
    const pointer = { x: -1e6, y: -1e6 }; // CSS px within the canvas
    const ripples: Ripple[] = [];
    let visible = true;
    let grads: CanvasGradient[] = [];
    let slowFrames = 0, fastFrames = 0;
    // per-column scratch arrays, reused every frame
    let cols = 0;
    let xs = new Float32Array(0), env = xs, sA = xs, cA = xs, sB = xs, cB = xs, mod = xs, mid = xs, firstY = xs, lastY = xs;

    const buildGradients = () => {
      grads = PALETTE[themeRef.current].colors.map(([a, b, c]) => {
        const g = ctx.createLinearGradient(0, 0, cssW, 0); // in CSS px (the context is scaled)
        g.addColorStop(0, a);
        g.addColorStop(0.5, b);
        g.addColorStop(1, c);
        return g;
      });
    };

    const setSize = () => {
      W = Math.max(1, Math.round(cssW * scale));
      H = Math.max(1, Math.round(cssH * scale));
      canvas.width = W;
      canvas.height = H;
      cols = Math.ceil(cssW / STEP) + 3;
      const make = () => new Float32Array(cols);
      xs = make(); env = make(); sA = make(); cA = make(); sB = make(); cB = make(); mod = make(); mid = make();
      firstY = make(); lastY = make();
      for (let k = 0; k < cols; k++) {
        const x = (k - 1) * STEP; // CSS px, one column beyond each edge
        xs[k] = x;
        env[k] = 0.55 + 0.45 * Math.sin((Math.PI * x) / cssW);
      }
      buildGradients();
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      cssW = Math.max(1, r.width);
      cssH = Math.max(1, r.height);
      setSize();
      if (still) draw(performance.now());
    };

    // strands are pushed away from the pointer and from each ripple; the push grows smoothly from zero at its
    // centre (no up/down flip), so neighbouring strands never tear. Works in CSS px.
    const displace = (x: number, y: number, now: number) => {
      let dy = 0;
      if (energy > 0.01) {
        const ex = x - pointer.x;
        if (ex > -330 && ex < 330) {
          const ey = y - pointer.y;
          dy += energy * 0.7 * ey * Math.exp(-(ex * ex + ey * ey) / 24200); // σ = 110 px
        }
      }
      for (let i = 0; i < ripples.length; i++) {
        const rp = ripples[i];
        const age = Math.max(0, now - rp.born); // a click can land a hair after this frame's timestamp
        const rx = x - rp.x, ry = y - rp.y;
        const d = Math.sqrt(rx * rx + ry * ry) + 1, off = d - age * 0.75;
        if (off > -140 && off < 140) dy += 38 * (1 - age / 1800) ** 2 * Math.exp(-(off * off) / 4232) * (ry / d); // width 46 px
      }
      return y + dy;
    };

    function draw(now: number) {
      const pal = PALETTE[themeRef.current];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(scale, 0, 0, scale, 0, 0); // draw in CSS px
      ctx.globalCompositeOperation = pal.blend;
      ctx.lineWidth = 0.9;
      const interacting = energy > 0.01 || ripples.length > 0;
      RIBBONS.forEach((rb, ri) => {
        const ph = clock * rb.speed + rb.phase;
        // everything that depends only on x (not on the strand) is computed once per column
        for (let k = 0; k < cols; k++) {
          const u = xs[k] / cssW;
          const a = u * rb.waves * TAU + ph, b = u * rb.waves * 1.7 * TAU - ph * 0.8;
          sA[k] = Math.sin(a); cA[k] = Math.cos(a); sB[k] = Math.sin(b); cB[k] = Math.cos(b);
          mod[k] = rb.spread * (1 + 0.6 * Math.sin(u * 3.1 + ph * 0.4));
          mid[k] = rb.y0 + (rb.y1 - rb.y0) * u;
        }
        ctx.strokeStyle = grads[ri];
        ctx.fillStyle = grads[ri];
        for (let i = 0; i < rb.lines; i++) {
          const t = i / (rb.lines - 1), c = t - 0.5;
          // sin(a + b) = sin a·cos b + cos a·sin b: each strand's own offset needs only these four numbers
          const c1 = Math.cos(c * rb.twist), s1 = Math.sin(c * rb.twist);
          const c2 = Math.cos(c * rb.twist * 0.6 + 1.3), s2 = Math.sin(c * rb.twist * 0.6 + 1.3);
          ctx.globalAlpha = rb.alpha * pal.boost * (0.22 + 0.78 * Math.sin(Math.PI * t));
          ctx.beginPath();
          for (let k = 0; k < cols; k++) {
            const wave = (sA[k] * c1 + cA[k] * s1) * 0.65 + (sB[k] * c2 + cB[k] * s2) * 0.35;
            let y = (mid[k] + wave * rb.amp * env[k] + c * mod[k]) * cssH;
            if (interacting) y = displace(xs[k], y, now);
            if (k === 0) ctx.moveTo(xs[k], y);
            else ctx.lineTo(xs[k], y);
            if (i === 0) firstY[k] = y;
            else if (i === rb.lines - 1) lastY[k] = y;
          }
          ctx.stroke();
        }
        // a soft silk sheen between the outer strands
        ctx.globalAlpha = rb.sheen * pal.boost;
        ctx.beginPath();
        ctx.moveTo(xs[0], firstY[0]);
        for (let k = 1; k < cols; k++) ctx.lineTo(xs[k], firstY[k]);
        for (let k = cols - 1; k >= 0; k--) ctx.lineTo(xs[k], lastY[k]);
        ctx.closePath();
        ctx.fill();
      });
      // each ripple also leaves a faint expanding ring
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = pal.colors[0][1];
      ctx.lineWidth = 1.5;
      for (const rp of ripples) {
        const age = Math.max(0, now - rp.born);
        ctx.globalAlpha = 0.35 * (1 - age / 1800) ** 2 * pal.boost;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, age * 0.75, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // If this machine can't keep up, step the resolution down (and back up when there is headroom).
    const adapt = (dt: number) => {
      if (dt > 24) { slowFrames++; fastFrames = 0; } else if (dt < 18) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
      if (slowFrames > 20 && scale > MIN_SCALE) { scale = Math.max(MIN_SCALE, scale - 0.15); slowFrames = 0; setSize(); }
      else if (fastFrames > 300 && scale < bestScale()) { scale = Math.min(bestScale(), scale + 0.1); fastFrames = 0; setSize(); }
    };

    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (now - lastActive > 1600) { targetSpeed = IDLE; targetEnergy = 0; }
      speed += (targetSpeed - speed) * 0.035;
      energy += (targetEnergy - energy) * 0.07;
      clock += (dt / 1000) * speed;
      while (ripples.length && now - ripples[0].born > 1800) ripples.shift();
      const busy = energy > 0.02 || ripples.length > 0 || speed > IDLE + 0.03;
      frameNo++;
      if (busy || frameNo % 2 === 0) draw(now); // calm drift: every other frame is enough
      if (busy) adapt(dt); // judge speed only on frames meant to run at the full rate
      raf = visible ? requestAnimationFrame(frame) : 0;
    };

    const toCanvas = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let prev = { x: 0, y: 0, t: 0 };
    const onMove = (e: PointerEvent) => {
      const p = toCanvas(e), now = performance.now();
      const v = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(16, now - prev.t); // CSS px per ms
      prev = { ...p, t: now };
      pointer.x = p.x;
      pointer.y = p.y;
      targetEnergy = 1;
      targetSpeed = Math.min(1.5, Math.max(targetSpeed, 0.55 + v * 0.35));
      lastActive = now;
    };
    const onLeave = () => { targetEnergy = 0; };
    const onDown = (e: PointerEvent) => {
      const p = toCanvas(e), now = performance.now();
      ripples.push({ ...p, born: now });
      if (ripples.length > 6) ripples.shift();
      targetSpeed = 1.8;
      lastActive = now;
    };

    themeChanged.current = () => {
      buildGradients();
      if (still) draw(performance.now());
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    if (still) return () => ro.disconnect();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
    io.observe(canvas);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
    };
  }, []);

  // new theme → new colour gradients (and a fresh still frame when motion is reduced)
  useEffect(() => {
    themeChanged.current();
  }, [theme]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
