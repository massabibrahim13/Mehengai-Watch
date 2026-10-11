// The hero's backdrop: ribbons of fine flowing lines drawn on a canvas.
// - Idle: the ribbons drift slowly.
// - Pointer moves: they speed up and the strands bend away from the pointer.
// - Click / tap: a ripple runs out from that point.
// - "Reduce motion": one still frame, no reactions. Paused while off screen.
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
  { lines: 44, y0: 0.86, y1: 0.5, amp: 0.13, spread: 0.16, waves: 0.85, twist: 3.2, speed: 1, alpha: 0.6, sheen: 0.08, phase: 0 },
  { lines: 30, y0: 0.12, y1: 0.3, amp: 0.09, spread: 0.12, waves: 1.1, twist: -2.6, speed: 0.7, alpha: 0.32, sheen: 0.04, phase: 2.1 },
];

// left → middle → right colours of each ribbon, per theme (brand greens into teal and blue)
const PALETTE: Record<Theme, { colors: [string, string, string][]; blend: GlobalCompositeOperation; boost: number }> = {
  dark: { colors: [["#3fd99a", "#36c8e0", "#5b7cfa"], ["#2bb3a3", "#4c8fe6", "#8b6cf6"]], blend: "lighter", boost: 1 },
  light: { colors: [["#0c8f5a", "#0e9aa7", "#2a78d6"], ["#0e9aa7", "#2a78d6", "#6d5bd0"]], blend: "source-over", boost: 0.62 },
};

const IDLE = 0.16; // drift speed when nobody is interacting
const TAU = Math.PI * 2;

interface Ripple { x: number; y: number; born: number }

export function WaveField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const redrawStill = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const host = canvas.parentElement!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1, W = 0, H = 0;
    let raf = 0, last = performance.now(), clock = 4;
    let speed = IDLE, targetSpeed = IDLE, energy = 0, targetEnergy = 0, lastActive = -1e9;
    const pointer = { x: -1e6, y: -1e6, active: false };
    const ripples: Ripple[] = [];
    let visible = true;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = W;
      canvas.height = H;
      if (still) draw(performance.now());
    };

    // y of strand `c` (-0.5…0.5) of ribbon `rb` at x, before any pointer/ripple displacement
    const baseY = (rb: Ribbon, u: number, c: number, ph: number) => {
      const env = 0.55 + 0.45 * Math.sin(Math.PI * u);
      const wave = Math.sin(u * rb.waves * TAU + ph + c * rb.twist) * 0.65
        + Math.sin(u * rb.waves * 1.7 * TAU - ph * 0.8 + c * rb.twist * 0.6 + 1.3) * 0.35;
      const centre = rb.y0 + (rb.y1 - rb.y0) * u;
      return (centre + wave * rb.amp * env + c * rb.spread * (1 + 0.6 * Math.sin(u * 3.1 + ph * 0.4))) * H;
    };

    // pointer push + ripples. Strands are pushed away from each disturbance; the push grows smoothly from zero at
    // its centre (no up/down flip), so neighbouring strands never tear apart.
    const displace = (x: number, y: number, now: number) => {
      let dy = 0;
      if (energy > 0.01) {
        const ex = x - pointer.x, ey = y - pointer.y, sig = 110 * dpr;
        dy += energy * 0.7 * ey * Math.exp(-(ex * ex + ey * ey) / (2 * sig * sig));
      }
      for (const rp of ripples) {
        const age = Math.max(0, now - rp.born); // a click can land a hair after this frame's timestamp
        const rx = x - rp.x, ry = y - rp.y, d = Math.hypot(rx, ry) + 1;
        const radius = age * 0.75 * dpr, width = 46 * dpr, fade = (1 - age / 1800) ** 2;
        dy += 38 * dpr * fade * Math.exp(-((d - radius) ** 2) / (2 * width * width)) * (ry / d);
      }
      return y + dy;
    };

    function draw(now: number) {
      const pal = PALETTE[themeRef.current];
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = pal.blend;
      ctx.lineWidth = 0.9 * dpr;
      const step = 10 * dpr;
      RIBBONS.forEach((rb, ri) => {
        const [a, b, c] = pal.colors[ri];
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, a);
        grad.addColorStop(0.5, b);
        grad.addColorStop(1, c);
        ctx.strokeStyle = grad;
        ctx.fillStyle = grad;
        const ph = clock * rb.speed + rb.phase;
        let first: number[] = [], lastLine: number[] = [];
        for (let i = 0; i < rb.lines; i++) {
          const t = i / (rb.lines - 1), cc = t - 0.5;
          const ys: number[] = [];
          ctx.globalAlpha = rb.alpha * pal.boost * (0.22 + 0.78 * Math.sin(Math.PI * t));
          ctx.beginPath();
          for (let x = -step, k = 0; x <= W + step; x += step, k++) {
            const y = displace(x, baseY(rb, x / W, cc, ph), now);
            ys.push(y);
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          if (i === 0) first = ys;
          if (i === rb.lines - 1) lastLine = ys;
        }
        // a soft silk sheen between the outer strands
        ctx.globalAlpha = rb.sheen * pal.boost;
        ctx.beginPath();
        first.forEach((y, k) => (k ? ctx.lineTo(-step + k * step, y) : ctx.moveTo(-step, y)));
        for (let k = lastLine.length - 1; k >= 0; k--) ctx.lineTo(-step + k * step, lastLine[k]);
        ctx.closePath();
        ctx.fill();
      });
      // each ripple also leaves a faint expanding ring
      ctx.globalCompositeOperation = "source-over";
      for (const rp of ripples) {
        const age = Math.max(0, now - rp.born); // a click can land a hair after this frame's timestamp
        ctx.globalAlpha = 0.35 * (1 - age / 1800) ** 2 * pal.boost;
        ctx.strokeStyle = pal.colors[0][1];
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, age * 0.75 * dpr, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (now - lastActive > 1600) { targetSpeed = IDLE; targetEnergy = 0; }
      speed += (targetSpeed - speed) * 0.035;
      energy += (targetEnergy - energy) * 0.07;
      clock += (dt / 1000) * speed;
      while (ripples.length && now - ripples[0].born > 1800) ripples.shift();
      draw(now);
      raf = visible ? requestAnimationFrame(frame) : 0;
    };

    const toCanvas = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
    };
    let prev = { x: 0, y: 0, t: 0 };
    const onMove = (e: PointerEvent) => {
      const p = toCanvas(e), now = performance.now();
      const v = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(16, now - prev.t); // device px per ms
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

    redrawStill.current = () => {
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

  // with reduced motion there's no animation loop, so redraw the still frame when the theme changes
  useEffect(() => {
    redrawStill.current();
  }, [theme]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
