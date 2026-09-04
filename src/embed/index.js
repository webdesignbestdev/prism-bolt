import { createScene } from './scene.js';

/* ---------------------------------------------------------------------------
   PrismBolt — the Webflow embed.

   Markup is all it needs:

     <section data-prism-track style="height:300vh">
       <div style="position:sticky;top:0;height:100vh">
         <div data-prism-bolt data-background="#171717"></div>
       </div>
     </section>

   Anything carrying [data-prism-bolt] is mounted automatically.  Scroll
   progress is measured from the nearest [data-prism-track] ancestor -- the tall
   section -- because the sticky element itself does not move and so cannot
   report progress.  Without a track it falls back to the element's own travel
   through the viewport, which is what an inline instance wants.

   Progress is read from getBoundingClientRect() every frame rather than from a
   scroll event, so smooth-scroll libraries (Lenis, Locomotive, Webflow's own)
   work without any wiring.
--------------------------------------------------------------------------- */

const instances = new Set();

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const DEG = Math.PI / 180;

function readOptions(el, overrides = {}) {
  const d = el.dataset;
  return {
    background: d.background || '#F5F5F5',
    scale: num(d.scale, 1),   // multiplies the automatic fit, not an absolute size
    // degrees in the markup, radians internally -- nobody should have to type
    // radians into a Webflow field
    from: {
      x: num(d.fromX, 0) * DEG,
      y: num(d.fromY, 0) * DEG,
    },
    to: {
      x: num(d.toX, 15) * DEG,
      y: num(d.toY, -35) * DEG,
    },
    idle: d.idle === 'true',
    ease: num(d.ease, 1),
    ...overrides,
  };
}

// smoothstep, so the ends of the scroll settle instead of arriving at speed
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

function trackProgress(el, track) {
  if (track) {
    const r = track.getBoundingClientRect();
    const travel = r.height - window.innerHeight;
    if (travel <= 0) return 0;
    return clamp01(-r.top / travel);
  }
  // no track: progress across the element's own pass through the viewport
  const r = el.getBoundingClientRect();
  const travel = window.innerHeight + r.height;
  if (travel <= 0) return 0;
  return clamp01((window.innerHeight - r.top) / travel);
}

export function mount(el, overrides = {}) {
  if (!el || el.__prismBolt) return el?.__prismBolt ?? null;

  const opts = readOptions(el, overrides);
  const track = el.closest('[data-prism-track]');

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  el.appendChild(canvas);

  if (!el.style.position) el.style.position = 'relative';

  let scene;
  try {
    scene = createScene(canvas, opts);
  } catch (err) {
    // no WebGL, or context creation refused -- leave the element empty rather
    // than throwing into the page
    console.warn('[PrismBolt] could not start WebGL:', err);
    canvas.remove();
    return null;
  }

  const target = { x: opts.from.x, y: opts.from.y };
  let manual = null;          // set by setProgress(), overrides scroll
  let visible = true;
  let raf = 0;
  let last = performance.now();
  let elapsed = 0;

  const io = new IntersectionObserver(
    ([entry]) => { visible = entry.isIntersecting; },
    { rootMargin: '15% 0px' }
  );
  io.observe(el);

  function applyProgress(p) {
    const e = smooth(clamp01(p));
    target.x = opts.from.x + (opts.to.x - opts.from.x) * e;
    target.y = opts.from.y + (opts.to.y - opts.from.y) * e;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (!visible) return;                       // offscreen instances cost nothing
    elapsed += dt;

    const rect = el.getBoundingClientRect();
    scene.resize(Math.round(rect.width), Math.round(rect.height));
    applyProgress(manual === null ? trackProgress(el, track) : manual);
    scene.render(dt, elapsed, target);
  }
  raf = requestAnimationFrame(frame);

  const api = {
    el,
    /* Hand it a 0..1 and it stops following the scroll -- for GSAP
       ScrollTrigger, Lenis, or any timeline you would rather drive yourself.
       Pass null to give control back. */
    setProgress(p) { manual = p === null ? null : clamp01(p); },
    setBackground(hex) { scene.setBackground(hex); },
    setPose(from, to) {
      if (from) { opts.from.x = from.x * DEG; opts.from.y = from.y * DEG; }
      if (to) { opts.to.x = to.x * DEG; opts.to.y = to.y * DEG; }
    },
    setUniform(name, value) { scene.setUniform(name, value); },
    /* Current rotation in degrees, and the scroll progress driving it. */
    getPose() {
      const p = scene.getPose();
      return {
        x: +(p.x / DEG).toFixed(2),
        y: +(p.y / DEG).toFixed(2),
        scale: +p.scale.toFixed(3),
        canvas: p.canvas,
        progress: +(manual === null ? trackProgress(el, track) : manual).toFixed(4),
        driver: manual === null ? (track ? 'track' : 'viewport') : 'manual',
      };
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      scene.dispose();
      canvas.remove();
      delete el.__prismBolt;
      instances.delete(api);
    },
  };

  el.__prismBolt = api;
  instances.add(api);
  return api;
}

export function mountAll(root = document) {
  return [...root.querySelectorAll('[data-prism-bolt]')].map((el) => mount(el)).filter(Boolean);
}

export function destroyAll() {
  for (const i of [...instances]) i.destroy();
}

export function get(el) {
  return (typeof el === 'string' ? document.querySelector(el) : el)?.__prismBolt ?? null;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountAll());
  } else {
    mountAll();
  }
}
