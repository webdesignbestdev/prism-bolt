// a full URL rather than a bare 'three', so the file runs anywhere, Webflow included, with no import map
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';

/* ---------------------------------------------------------------------------
   Glass Bolt

   The brandmark as clear prismatic glass, after Maxime Heckel's "Refraction,
   dispersion, and other shader light effects".

   Every frame draws the mark twice:

     1. BackSide  -> render target   the far walls, lit from inside
     2. FrontSide -> screen          the near faces refract that capture

   There is no environment. The only light the near faces bend is the light
   on the far walls, plus whatever sits on the backdrop layer behind the mark,
   which is drawn into a target of its own first and refracted the same way.
   WebGL cannot see the HTML page under the canvas, so the backdrop layer is
   the only thing the glass can distort.
--------------------------------------------------------------------------- */

/* Controls exposed in the panel, at their tuned values. */
export const DEFAULTS = {
  uRefractPower: 0.2, //         how far the near faces bend the far walls
  uChromaticAberration: 0.3, //  extra bend from red to violet: the width of the spectrum
  uSaturation: 1.0, //           saturation of the dispersed light
  uFresnelPower: 2.5, //         falloff of the Fresnel terms; higher keeps them to grazing angles
  uShininess: 160, //            Blinn-Phong exponent; the near-face streak runs uStreak times sharper
  uDiffuseness: 0.2, //          diffuse light on the far walls, which is what keeps them visible
  uLight: [1.0, 0.25, 0.15], //  direction towards the light: right of the mark, a little above and in front
  uOpacity: 0.13, //             how much the glass hides what is behind it: 0 perfectly clear, 1 solid
};

/* The two versions, named for the page they sit on. Each is DEFAULTS with
   these values on top; everything not listed is shared. uPage is the page
   colour, which the glass needs to fringe a backdrop edge against it. */
export const PRESETS = {
  white: { uOpacity: 0.13, uPage: [1, 1, 1] },
  black: { uOpacity: 0.07, uPage: [0, 0, 0] },
};

/* The rest of the look. Not in the panel, but every one is a uniform. */
export const LOOK = {
  uGlintGain: 1.2, //    HDR gain on the streaks inside, so they stay bright once fanned out
  uCapSheen: 0.4, //     Fresnel sheen on the far cap as it turns away, which lights the body mid-turn
  uWallFresnel: 0.15, // Fresnel on the far walls: their faint presence head-on
  uFresnelLift: 1.0, //  how much Fresnel brightens the dispersion already on a near face
  uWallFill: 0.2, //     the near walls' own share of the diffuse light
  uDimTone: 0.4, //      grey the glass's opacity leans to: 0 only darkens, which black would hide
  uDimFresnel: 1.5, //   extra dimming where a face turns away, so the walls hold their shape
  uStreak: 4.0, //       the near-face streak is this many times sharper than uShininess
  uBendLimit: 1.5, //    softens the bend on faces seen at grazing angles
  uSoftness: 0.003, //   least blur on the refracted walls, as a share of the frame height
  uIorRed: 1.15, //      index of refraction at the red end of the spectrum
  uIorViolet: 1.33, //   and at the violet end
  uEdgeContrast: 2.0, // how strongly the far walls hide the page: 2 gives them equal contrast on white and black
  uColorAlpha: 1.0, //   above 1, makes dispersed colour more opaque, so it is as deep on white as on black
  uDistortion: 0.75, //  how far the glass shifts the backdrop, relative to the far walls
  uFringe: 0.05, //      how far the backdrop's colours split at its edges, relative to the far walls
};

/* Outline traced from the brandmark artwork (1190 x 673 px), centred, y up,
   scaled so the bolt spans y = -1 .. 1. Two opposing wedges joined by a
   stepped offset; the outline is point-symmetric about the origin. */
const OUTLINE = [
  [-0.2675, 1.0], //    top tip
  [-0.2675, 0.162], //  upper step
  [-1.7682, 0.162], //  left tip
  [0.2675, -1.0], //    bottom tip
  [0.2675, -0.162], //  lower step
  [1.7682, -0.162], //  right tip
];

const BOLT_WIDTH = 2 * 1.7682;
const BOLT_HEIGHT = 2;

/* The bevel is a quarter round of radius `bevel`, cut inside the outline
   (bevelOffset = -bevel) so the silhouette keeps its traced size, and taken
   out of the depth so the slab keeps its thickness. */
function createBoltGeometry(depth, bevel) {
  const shape = new THREE.Shape(OUTLINE.map(([x, y]) => new THREE.Vector2(x, y)));
  const core = depth - 2 * bevel;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: core,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 6,
  });
  if (bevel > 0) roundBevel(geometry, core, bevel);
  geometry.translate(0, 0, -core / 2);
  return geometry;
}

/* ExtrudeGeometry shades its bevel as flat facets, which puts a hard step in
   the light and in the refraction at every segment. Swap those normals for the
   true normals of the quarter round it extrudes, so both roll smoothly from
   cap to wall. The caps stay perfectly flat and the outline's corners stay
   creased, because each wall keeps its own direction. */
function roundBevel(geometry, core, radius) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const face = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 3) {
    face.fromBufferAttribute(normal, i); // flat shading: every vertex holds its face normal
    if (Math.abs(face.z) > 0.999) continue; // a cap
    const len = Math.hypot(face.x, face.y);
    const ox = face.x / len;
    const oy = face.y / len;

    for (let j = i; j < i + 3; j++) {
      const z = position.getZ(j);
      // how far round the quarter this vertex sits, as the cosine of its tilt
      let c = 0;
      if (z < 0) c = -Math.min(-z / radius, 1);
      else if (z > core) c = Math.min((z - core) / radius, 1);
      const s = Math.sqrt(1 - c * c);
      normal.setXYZ(j, ox * s, oy * s, c);
    }
  }
  normal.needsUpdate = true;
}

/* ---------------------------------------------------------------------------
   Shaders
--------------------------------------------------------------------------- */

const vertexShader = /* glsl */ `
  varying vec3 worldNormal;
  varying vec3 eyeVector;
  varying float wall;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;

    worldNormal = normalize(mat3(modelMatrix) * normal);
    eyeVector = normalize(worldPosition.xyz - cameraPosition);

    // 1 on the extrusion walls, 0 on the two flat caps, rolling between them round the bevel
    wall = 1.0 - abs(normal.z);
  }
`;

const common = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec3 uColor;
  uniform float uZoom;
  uniform float uSoftness;

  uniform float uRefractPower;
  uniform float uChromaticAberration;
  uniform float uSaturation;
  uniform float uFresnelPower;
  uniform float uShininess;
  uniform float uDiffuseness;
  uniform vec3 uLight;

  uniform float uGlintGain;
  uniform float uCapSheen;
  uniform float uWallFresnel;
  uniform float uFresnelLift;
  uniform float uWallFill;
  uniform float uOpacity;
  uniform float uDimTone;
  uniform float uDimFresnel;
  uniform float uStreak;
  uniform float uBendLimit;
  uniform float uIorRed;
  uniform float uIorViolet;
  uniform float uEdgeContrast;
  uniform float uColorAlpha;
  uniform float uDistortion;
  uniform float uFringe;

  uniform sampler2D uBackdrop;
  uniform float uBackdropOn;
  uniform vec3 uPage;

  varying vec3 worldNormal;
  varying vec3 eyeVector;
  varying float wall;

  const vec3 LUMA = vec3(0.2125, 0.7154, 0.0721);

  vec3 sat(vec3 rgb, float intensity) {
    vec3 grayscale = vec3(dot(rgb, LUMA));
    return mix(grayscale, rgb, intensity);
  }

  float fresnel(vec3 eye, vec3 normal, float power) {
    float fresnelFactor = abs(dot(eye, normal));
    float inverseFresnelFactor = 1.0 - fresnelFactor;
    return pow(inverseFresnelFactor, power);
  }

  /* Blinn-Phong. The half vector is dotted twice, as in the article, which
     sharpens the lobe and lights a face from either side. */
  float specular(vec3 eye, vec3 normal, vec3 light, float shininess, float diffuseness) {
    vec3 lightVector = -light / max(length(light), 1e-5);
    // a light straight behind the mark makes eye + light vanish at one point
    vec3 halfVector = eye + lightVector;
    halfVector /= max(length(halfVector), 1e-5);

    float NdotL = dot(normal, lightVector);
    float NdotH = dot(normal, halfVector);
    float NdotH2 = NdotH * NdotH;

    float kDiffuse = max(0.0, NdotL);
    float kSpecular = pow(NdotH2, shininess);
    return kSpecular + kDiffuse * diffuseness;
  }

  float diffuse(vec3 normal, vec3 light) {
    return max(0.0, dot(normal, -light / max(length(light), 1e-5)));
  }
`;

/* Pass 1: the far walls. There is nothing behind them to sample, so all they
   carry is their own light, kept in HDR so that a thin streak survives being
   fanned out across a wide spectrum in pass 2. The light is white, so its two
   kinds ride in separate channels and are composited differently later:
     r  light passing through   Blinn-Phong, plus the far cap's sheen
     g  the walls themselves    diffuse, plus a Fresnel kept faint */
const backFragmentShader = /* glsl */ `
  ${common}

  void main() {
    vec3 normal = normalize(worldNormal);
    vec3 eye = normalize(eyeVector);
    float f = fresnel(eye, normal, uFresnelPower);

    float glints = specular(eye, normal, uLight, uShininess, 0.0) * uGlintGain;
    glints += f * uCapSheen * (1.0 - wall);
    float walls = (diffuse(normal, uLight) * uDiffuseness + f * uWallFresnel) * wall;

    gl_FragColor = vec4(glints, walls, 0.0, 1.0);
  }
`;

/* Pass 2: the near faces, refracting the far walls. */
const frontFragmentShader = /* glsl */ `
  ${common}

  #define SAMPLES 24

  /* Spectral response of one sample, t running 0 (red) -> 1 (violet) through
     yellow, green, cyan and blue. Summed over the loop and divided back out,
     so light that lands on the same spot for every sample stays white. */
  vec3 spectrum(float t) {
    float r = exp(-pow(t / 0.30, 2.0)) + 0.5 * exp(-pow((t - 1.0) / 0.20, 2.0));
    float g = exp(-pow((t - 0.42) / 0.24, 2.0));
    float b = exp(-pow((t - 0.80) / 0.24, 2.0));
    return vec3(r, g, b);
  }

  /* HDR light -> premultiplied colour on a transparent canvas, keeping the hue
     when it clips. edge sets how much the light also hides the page:
       0  plain added light, which a white page swallows
       2  equal contrast on white and black: dark on one, bright on the other
     Either way alpha is at least the peak channel, so a dispersed colour keeps
     its hue and chroma on white, only lighter; uColorAlpha above 1 pushes
     colour further towards opaque. */
  vec4 layer(vec3 light, float edge) {
    float peak = max(max(light.r, light.g), light.b);
    light /= max(peak, 1.0);
    peak = min(peak, 1.0);
    float chroma = peak - min(min(light.r, light.g), light.b);
    float alpha = max(edge * dot(light, LUMA), uColorAlpha * chroma);
    return vec4(light, clamp(max(alpha, peak), 0.0, 1.0));
  }

  vec4 over(vec4 top, vec4 bottom) {
    return top + bottom * (1.0 - top.a);
  }

  vec3 toSRGB(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 aspect = vec2(uResolution.y / uResolution.x, 1.0);
    vec3 normal = normalize(worldNormal);
    vec3 eye = normalize(eyeVector);

    /* Interleaved gradient noise slides every sample part of a step along the
       spectrum, and each sample reads the capture as blurred as the gap to its
       neighbour, so the fan is one continuous spectrum, never SAMPLES copies.
       uSoftness keeps a floor under that blur so the refracted walls never
       come through razor sharp. Zoom magnifies both with the mark. */
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec2 meanBend = (viewMatrix * vec4(refract(eye, normal, 2.0 / (uIorRed + uIorViolet)), 0.0)).xy;
    meanBend /= 1.0 + length(meanBend) * uBendLimit;
    float gap = length(meanBend) * uChromaticAberration / float(SAMPLES);
    float lod = log2(max(max(gap, uSoftness) * uResolution.y * uZoom, 1.0));
    float backdropLod = log2(max(max(gap * uDistortion * uFringe, uSoftness) * uResolution.y * uZoom, 1.0));

    vec3 glints = vec3(0.0);
    vec3 walls = vec3(0.0);
    vec3 weight = vec3(0.0);
    vec3 behind = vec3(0.0); // backdrop colour, premultiplied
    vec3 cover = vec3(0.0); //  backdrop coverage, per channel

    for (int i = 0; i < SAMPLES; i++) {
      float t = (float(i) + jitter) / float(SAMPLES);
      float ior = mix(uIorRed, uIorViolet, t);

      vec3 refractVec = refract(eye, normal, 1.0 / ior);
      vec2 bend = (viewMatrix * vec4(refractVec, 0.0)).xy;
      // a face seen at grazing would otherwise throw its samples half a screen away
      bend /= 1.0 + length(bend) * uBendLimit;
      vec2 offset = bend * aspect * (uRefractPower + t * uChromaticAberration) * uZoom;
      vec2 backdropOffset = bend * aspect * (uRefractPower + t * uChromaticAberration * uFringe) * uZoom * uDistortion;

      vec2 s = textureLod(uTexture, uv + offset, lod).rg;
      vec3 w = spectrum(t);
      glints += s.r * w;
      walls += s.g * w;
      weight += w;

      if (uBackdropOn > 0.5) {
        vec4 b = textureLod(uBackdrop, uv + backdropOffset, backdropLod);
        behind += b.rgb * w;
        cover += b.a * w;
      }
    }

    /* The backdrop seen through the glass. Every channel was sampled at its
       own offset, so every channel has its own coverage. Where an edge splits
       them, the page shows through in some channels and not in others, and
       that difference, in the page's colour, is the fringe. */
    vec4 seen = vec4(0.0);
    if (uBackdropOn > 0.5) {
      behind /= weight;
      cover /= weight;
      // three.js writes linear light into a target but sRGB onto the canvas,
      // so encode what came through, or it would look darker than beside it
      behind = toSRGB(behind / max(cover, vec3(1e-4))) * cover;
      float covered = max(max(cover.r, cover.g), cover.b);
      seen = vec4(behind + (covered - cover) * uPage, covered);
    }

    glints = max(sat(uColor * glints / weight, uSaturation), 0.0);
    walls = max(sat(uColor * walls / weight, uSaturation), 0.0);

    /* Fresnel sits under the dispersion: it lifts the light already in the
       face rather than drawing a rim of its own. */
    float fr = fresnel(eye, normal, uFresnelPower);
    float lift = 1.0 + fr * uFresnelLift;
    glints *= lift;
    walls *= lift;
    walls += uColor * diffuse(normal, uLight) * uDiffuseness * uWallFill * wall;

    /* The glass dims whatever is behind it by uOpacity, more where a face
       turns away. Leaning the dimming to grey rather than black is what keeps
       the clear body visible on a black page as well as a white one. */
    float dim = clamp(uOpacity * (1.0 + fr * uDimFresnel), 0.0, 1.0);
    vec4 body = vec4(uColor * uDimTone * dim, dim);

    /* The walls are the glass itself: bright on black, the dark edge of the
       glass on white. The glints are light passing through it. The body dims
       the refracted backdrop just as it dims the page. */
    vec4 color = over(layer(glints, 0.0), over(layer(walls, uEdgeContrast), over(body, seen)));

    /* The near face's own Blinn-Phong: a sharp streak along the walls, added
       on top as reflected light. */
    float streak = min(specular(eye, normal, uLight, uShininess * uStreak, 0.0) * wall, 1.0);
    color = over(vec4(uColor * streak, streak), color);

    gl_FragColor = color;
  }
`;

/* ---------------------------------------------------------------------------
   createGlassBolt(container, options)
--------------------------------------------------------------------------- */

export function createGlassBolt(container, options = {}) {
  const opts = {
    depth: 0.42, //      extrusion depth, in units where the bolt is 2 tall
    bevel: 0.035, //     radius of the rounded bevel on every edge, same units; 0 for knife edges
    fov: 30, //          camera field of view, degrees
    fill: 0.74, //       share of the canvas the mark spans on its tighter axis
    spin: 0.25, //       Y rotation, radians per second
    zoom: 0.79, //       framing at rest, and what a reset returns to
    zoomable: false, //  wheel, pinch and drag to zoom and pan; off by default so an embed never eats page scroll
    minZoom: 0.5,
    maxZoom: 6,
    preset: 'white', //  'white' or 'black': the page the mark sits on (see PRESETS)
    uniforms: {}, //     any uniform from DEFAULTS or LOOK, set last, e.g. { uOpacity: 0.1 }
    ...options,
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false; // the canvas takes two draws a frame, so clears are explicit
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const uniforms = {
    uTexture: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uColor: { value: new THREE.Color(1, 1, 1) }, // pure white: the glass adds no tint
    uLight: { value: new THREE.Vector3(...DEFAULTS.uLight) },
    uZoom: { value: 1 },
    uPage: { value: new THREE.Vector3(1, 1, 1) },
    uBackdrop: { value: null },
    uBackdropOn: { value: 0 },
  };
  for (const [name, value] of Object.entries({ ...DEFAULTS, ...LOOK })) {
    if (!uniforms[name]) uniforms[name] = { value };
  }

  function setUniforms(values) {
    for (const [name, value] of Object.entries(values)) {
      const uniform = uniforms[name];
      if (!uniform) continue;
      if (Array.isArray(value) && uniform.value?.fromArray) uniform.value.fromArray(value);
      else uniform.value = value;
    }
  }

  function applyPreset(name) {
    setUniforms(PRESETS[name] ?? PRESETS.white);
  }

  applyPreset(opts.preset);
  setUniforms(opts.uniforms);

  const backMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: backFragmentShader,
    uniforms,
    side: THREE.BackSide,
  });
  const frontMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: frontFragmentShader,
    uniforms,
    side: THREE.FrontSide,
  });

  const geometry = createBoltGeometry(opts.depth, opts.bevel);
  const mesh = new THREE.Mesh(geometry, frontMaterial);
  scene.add(mesh);

  // half float keeps the HDR streaks; the mip chain is what the cone sampling reads
  const backTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });

  /* The backdrop: anything added to this group is drawn behind the mark and
     refracted by it, in bolt units (the bolt is 2 tall, centred on 0, 0). It
     is drawn into a target of its own for the near faces to sample, and onto
     the canvas as it is. Empty, it costs nothing. */
  const backdropScene = new THREE.Scene();
  const backdrop = new THREE.Group();
  backdropScene.add(backdrop);
  const behindTarget = new THREE.WebGLRenderTarget(1, 1, {
    samples: 4,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });

  const size = new THREE.Vector2();
  let width = 1;
  let height = 1;

  /* Zoom is a crop of the full frame (setViewOffset), not a camera move, so
     the eye vectors and therefore the refraction stay exactly as they were,
     only magnified; uZoom scales the refraction offsets to match. The point
     `anchor` of the full frame (0..1, y down) stays under the point `pin` of
     the canvas, which is what makes the wheel zoom towards the cursor. */
  const restZoom = THREE.MathUtils.clamp(opts.zoom, opts.minZoom, opts.maxZoom);
  const view = {
    zoom: restZoom,
    velocity: 0,
    target: restZoom,
    anchor: new THREE.Vector2(0.5, 0.5),
    pin: new THREE.Vector2(0.5, 0.5),
    center: new THREE.Vector2(0.5, 0.5),
  };

  function applyView() {
    const z = view.zoom;
    const c = view.center;
    c.set(view.anchor.x - (view.pin.x - 0.5) / z, view.anchor.y - (view.pin.y - 0.5) / z);
    if (z >= 1) {
      // never show past the edge of the full frame
      const m = 0.5 / z;
      c.set(THREE.MathUtils.clamp(c.x, m, 1 - m), THREE.MathUtils.clamp(c.y, m, 1 - m));
    } else {
      c.set(0.5, 0.5);
    }
    view.anchor.set(c.x + (view.pin.x - 0.5) / z, c.y + (view.pin.y - 0.5) / z);
    camera.setViewOffset(width, height, (c.x - 0.5 / z) * width, (c.y - 0.5 / z) * height, width / z, height / z);
    uniforms.uZoom.value = z;
  }

  // the spring from the motion spec (stiffness 300, damping 30, mass 1), run on log zoom
  // in small substeps so a long frame cannot make it blow up
  function stepZoom(dt) {
    let x = Math.log(view.zoom);
    let v = view.velocity;
    const goal = Math.log(view.target);
    for (let t = 0; t < dt; t += 1 / 240) {
      const h = Math.min(1 / 240, dt - t);
      v += (-300 * (x - goal) - 30 * v) * h;
      x += v * h;
    }
    view.zoom = Math.exp(x);
    view.velocity = v;
  }

  /* x, y: the canvas point to zoom towards, 0..1 from the top left. */
  function setZoom(value, x = 0.5, y = 0.5) {
    view.anchor.set(view.center.x + (x - 0.5) / view.zoom, view.center.y + (y - 0.5) / view.zoom);
    view.pin.set(x, y);
    view.target = THREE.MathUtils.clamp(value, opts.minZoom, opts.maxZoom);
  }

  /* dx, dy: how far the content was dragged, as a share of the canvas. */
  function pan(dx, dy) {
    view.anchor.x -= dx / view.zoom;
    view.anchor.y -= dy / view.zoom;
  }

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    width = w;
    height = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(size);
    backTarget.setSize(size.x, size.y);
    behindTarget.setSize(size.x, size.y);
    uniforms.uResolution.value.copy(size);

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const visibleW = visibleH * camera.aspect;
    mesh.scale.setScalar(Math.min(visibleW / BOLT_WIDTH, visibleH / BOLT_HEIGHT) * opts.fill);
  }

  function renderFrame() {
    applyView();
    backdrop.scale.setScalar(mesh.scale.x); // bolt units, like the mark
    const showBackdrop = backdrop.children.some((child) => child.visible);
    uniforms.uBackdropOn.value = showBackdrop ? 1 : 0;

    if (showBackdrop) {
      renderer.setRenderTarget(behindTarget);
      renderer.clear();
      renderer.render(backdropScene, camera);
    }

    mesh.material = backMaterial;
    uniforms.uTexture.value = null;
    uniforms.uBackdrop.value = null;
    renderer.setRenderTarget(backTarget);
    renderer.clear();
    renderer.render(scene, camera);

    // the backdrop goes on the canvas as it is; the near faces then cover it with their refracted view of it
    mesh.material = frontMaterial;
    uniforms.uTexture.value = backTarget.texture;
    uniforms.uBackdrop.value = showBackdrop ? behindTarget.texture : null;
    renderer.setRenderTarget(null);
    renderer.clear();
    if (showBackdrop) {
      renderer.render(backdropScene, camera);
      renderer.clearDepth(); // behind the mark, whatever depth its objects were drawn at
    }
    renderer.render(scene, camera);
  }

  let angle = 0;
  let last = performance.now();
  let raf = 0;
  let paused = false;

  // stops the loop outright, so a mark scrolled out of view costs nothing
  function setPaused(value) {
    if (value === paused) return;
    paused = value;
    cancelAnimationFrame(raf);
    if (!paused) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    angle += dt * opts.spin;
    mesh.rotation.y = angle;
    stepZoom(dt);
    updateCursor();
    renderFrame();
  }

  /* ---- zoom and pan input: wheel or trackpad pinch, touch pinch, drag ---- */

  const canvas = renderer.domElement;
  const pointers = new Map();
  let pinch = null;

  function local(x, y) {
    const r = canvas.getBoundingClientRect();
    return [(x - r.left) / r.width, (y - r.top) / r.height];
  }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const speed = e.ctrlKey ? 0.01 : 0.0015; // a trackpad pinch arrives as ctrl + wheel
    setZoom(view.target * Math.exp(-delta * speed), ...local(e.clientX, e.clientY));
  }

  function onPointerDown(e) {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser no longer tracks; the drag still works without capture
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { zoom: view.target, distance: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  }

  function onPointerMove(e) {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const r = canvas.getBoundingClientRect();
    if (pointers.size === 1) pan((e.clientX - last.x) / r.width, (e.clientY - last.y) / r.height);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom((pinch.zoom * distance) / pinch.distance, ...local((a.x + b.x) / 2, (a.y + b.y) / 2));
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  }

  const onDoubleClick = () => setZoom(restZoom);

  // a hand only while there is something to drag
  function updateCursor() {
    const cursor = !opts.zoomable || view.target <= 1.01 ? '' : pointers.size ? 'grabbing' : 'grab';
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }

  if (opts.zoomable) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', onDoubleClick);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(tick);

  return {
    renderer,
    camera,
    mesh,
    uniforms,
    options: opts,
    renderFrame,
    resize,
    setAngle(radians) {
      angle = radians;
      mesh.rotation.y = angle;
    },
    get angle() {
      return angle;
    },
    setPaused,
    applyPreset,
    setUniforms,
    setZoom,
    resetZoom: () => setZoom(restZoom),
    /* The zoom it is easing towards. Settable, so a slider can bind to it. */
    get zoom() {
      return view.target;
    },
    set zoom(value) {
      setZoom(value);
    },
    /* A three.js Group behind the mark, in bolt units. Whatever is added to
       it is drawn on the canvas and seen bent through the glass. The caller
       owns what it adds, and disposes of it. */
    backdrop,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('dblclick', onDoubleClick);
      geometry.dispose();
      backMaterial.dispose();
      frontMaterial.dispose();
      backTarget.dispose();
      behindTarget.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
