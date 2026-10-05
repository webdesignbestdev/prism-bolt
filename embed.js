import { createGlassBolt } from './glass-bolt.js';

/* ---------------------------------------------------------------------------
   Glass Bolt for Webflow

   Load once, at the end of the page:

     <script type="module" src=".../embed.js"></script>

   and give any element the attribute data-glass-bolt, valued white or black
   for the page it sits on. It needs a size; the mark fits itself inside.
   Optional attributes, all plain numbers:

     data-opacity    0..1    how much the glass hides what is behind it
     data-spin       rad/s   rotation speed, 0 holds it still
     data-zoom       0.5..6  framing; lower shows more margin round the mark
     data-zoomable   true    wheel, pinch and drag to zoom (off by default,
                             because it would capture the page's scroll)

   A mark that scrolls out of view stops rendering. With reduced motion turned
   on in the visitor's system settings, the mark holds still at an angle.
--------------------------------------------------------------------------- */

const instances = new Map();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
};

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) instances.get(entry.target)?.setPaused(!entry.isIntersecting);
  },
  { rootMargin: '20% 0px' }
);

export function mount(element) {
  if (!element || instances.has(element)) return instances.get(element) ?? null;

  const data = element.dataset;
  const options = {
    preset: data.glassBolt === 'black' ? 'black' : 'white',
    zoomable: data.zoomable === 'true',
    uniforms: {},
  };
  if (num(data.spin) !== undefined) options.spin = num(data.spin);
  if (num(data.zoom) !== undefined) options.zoom = num(data.zoom);
  if (num(data.opacity) !== undefined) options.uniforms.uOpacity = num(data.opacity);
  if (reducedMotion) options.spin = 0;

  let bolt;
  try {
    bolt = createGlassBolt(element, options);
  } catch (error) {
    // no WebGL: leave the element as it was rather than break the page
    console.warn('[GlassBolt] could not start WebGL', error);
    return null;
  }
  if (reducedMotion) bolt.setAngle(0.55);

  instances.set(element, bolt);
  observer.observe(element);
  return bolt;
}

export function mountAll(root = document) {
  return [...root.querySelectorAll('[data-glass-bolt]')].map(mount).filter(Boolean);
}

export function unmount(element) {
  const bolt = instances.get(element);
  if (!bolt) return;
  observer.unobserve(element);
  bolt.dispose();
  instances.delete(element);
}

// the instance mounted on an element or selector, to drive it from other code
export function get(target) {
  return instances.get(typeof target === 'string' ? document.querySelector(target) : target) ?? null;
}

window.GlassBolt = { mount, mountAll, unmount, get };

// module scripts run once the page is parsed, so every element is already there
mountAll();
