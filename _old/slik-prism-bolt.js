/* =========================================================================
   SLIK — prismatic bolt material
   Drop-in replacement for the vertex/fragment shaders on the hero bolt
   (mesh SLIK_LOGO_BOLT_01, canvas [data-three-canvas="hero"]).

   Keeps every existing uniform, so update() / onResize() / setScrollRotation()
   and any GSAP tweens on heroPrismaticModel.uniforms keep working untouched.

   Three things it changes:

   1. The white Fresnel rim is gone.  The old shader ended with
        color.rgb += f * vec3(1.0);
      which is what made the bolt a white hairline outline.  It is now a
      spectral rim that runs the prism cycle instead of adding white.

   2. The walls carry the prism.  A band coordinate runs ACROSS the wall
      (object-space z, i.e. through the extrusion) so one to two full
      spectral cycles are laid over the wall's width, and a second band runs
      inward from the outline across the glass faces so the colour still
      reads when the walls go edge-on head-on.

   3. It is authored for mix-blend-mode: hard-light, which the hero canvas
      uses.  Under hard-light 0.5 is the invisible value (backdrop shows
      through), 0 goes black and 1 goes white.  So "subtle" stretches relax
      toward 0.5 rather than toward dark, and saturated stretches push to the
      extremes -- which is also why they hold on a light ground as well as a
      dark one: at s=0 and s=1 hard-light stops depending on the backdrop.

   Chromatic aberration is untouched in principle: the per-channel IOR loop
   is their original code, verbatim, and it is still the only thing in the
   shader that samples per channel, and it only ever reads uTexture.  Every
   surface term below is computed once and added, so the model itself never
   splits into fringes.

   GLSL ES 1.00 (raw ShaderMaterial): no %, no bitwise ops, no dynamic array
   indexing, varying/texture2D/gl_FragColor.
   ========================================================================= */

(function (root) {
  "use strict";

  /* Object-space constants read off SLIK_LOGO_BOLT_01.glb.
     If the model is ever re-exported at a different scale, these are the only
     numbers to update -- they are the bounding half-extents. */
  const HALF_D = 0.0212;   // z half-extent (half the extrusion depth)
  const HALF_H = 0.1096;   // y half-extent (half the bolt height)

  const vertexShader = `
    varying vec3 worldNormal;
    varying vec3 eyeVector;
    varying vec3 vObjPos;
    varying vec3 vObjNrm;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vec4 mvPosition = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPosition;
      worldNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
      eyeVector = normalize(worldPos.xyz - cameraPosition);

      // Object space is what the prism is parameterised in: z runs through the
      // extrusion (across a wall), y runs along the bolt.
      vObjPos = position;
      vObjNrm = normal;
    }
  `;

  const fragmentShader = `
    uniform float uIorR;
    uniform float uIorY;
    uniform float uIorG;
    uniform float uIorC;
    uniform float uIorB;
    uniform float uIorP;

    uniform float uSaturation;
    uniform float uChromaticAberration;
    uniform float uRefractPower;
    uniform float uFresnelPower;
    uniform float uShininess;
    uniform float uDiffuseness;
    uniform vec3 uLight;

    uniform vec2 winResolution;
    uniform sampler2D uTexture;

    // --- added ---
    uniform float uTime;         // seconds; leave at 0 for a static bolt
    uniform float uBandSpread;   // spectral cycles laid across a wall
    uniform float uBandGain;     // overall strength of the prism
    uniform float uGlassGain;    // how much refracted backdrop shows on faces
    uniform float uEdgeBand;     // width of the spectral border, object units
    uniform float uMetalGain;    // silver substrate under the bands

    varying vec3 worldNormal;
    varying vec3 eyeVector;
    varying vec3 vObjPos;
    varying vec3 vObjNrm;

    #define TAU 6.28318530718

    const float HALF_D = ${HALF_D};
    const float HALF_H = ${HALF_H};

    /* ---- original helpers, unchanged ---------------------------------- */
    vec3 sat(vec3 rgb, float adjustment) {
      const vec3 W = vec3(0.2125, 0.7154, 0.0721);
      vec3 intensity = vec3(dot(rgb, W));
      return mix(intensity, rgb, adjustment);
    }

    float fresnel(vec3 eyeVector, vec3 worldNormal, float power) {
      float fresnelFactor = abs(dot(eyeVector, worldNormal));
      float inversefresnelFactor = 1.0 - fresnelFactor;
      return pow(inversefresnelFactor, power);
    }

    float specular(vec3 light, float shininess, float diffuseness) {
      vec3 normal = worldNormal;
      vec3 lightVector = normalize(-light);
      vec3 halfVector = normalize(eyeVector + lightVector);

      float NdotL = dot(normal, lightVector);
      float NdotH = dot(normal, halfVector);
      float kDiffuse = max(0.0, NdotL);
      float NdotH2 = NdotH * NdotH;

      float kSpecular = pow(NdotH2, shininess);
      return kSpecular + kDiffuse * diffuseness;
    }

    /* ---- prism -------------------------------------------------------- */

    /* The full spectral cycle, so a band sweeping a wall reads
       cyan -> blue -> violet -> magenta -> red -> orange -> yellow -> green
       and never sits on one hue.  Written as an if-chain because GLSL ES 1.00
       cannot index an array with a computed int. */
    vec3 spectrum(float x) {
      float f = fract(x) * 8.0;
      float t = fract(f);
      t = t * t * (3.0 - 2.0 * t);
      vec3 c0, c1;
      if      (f < 1.0) { c0 = vec3(0.05, 0.98, 1.00); c1 = vec3(0.10, 0.46, 1.00); }
      else if (f < 2.0) { c0 = vec3(0.10, 0.46, 1.00); c1 = vec3(0.46, 0.20, 1.00); }
      else if (f < 3.0) { c0 = vec3(0.46, 0.20, 1.00); c1 = vec3(1.00, 0.16, 0.86); }
      else if (f < 4.0) { c0 = vec3(1.00, 0.16, 0.86); c1 = vec3(1.00, 0.24, 0.28); }
      else if (f < 5.0) { c0 = vec3(1.00, 0.24, 0.28); c1 = vec3(1.00, 0.62, 0.10); }
      else if (f < 6.0) { c0 = vec3(1.00, 0.62, 0.10); c1 = vec3(0.94, 1.00, 0.16); }
      else if (f < 7.0) { c0 = vec3(0.94, 1.00, 0.16); c1 = vec3(0.16, 1.00, 0.44); }
      else              { c0 = vec3(0.16, 1.00, 0.44); c1 = vec3(0.05, 0.98, 1.00); }
      return mix(c0, c1, t);
    }

    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }

    /* Intensity along the bolt: some stretches sit quiet, others go fully
       saturated.  Three octaves so the pattern does not read as a sine. */
    float ampAlong(float s) {
      float a = 0.5 + 0.5 * sin(s * TAU * 2.0 + 0.9);
      float b = 0.5 + 0.5 * sin(s * TAU * 5.0 + 2.3);
      float c = 0.5 + 0.5 * sin(s * TAU * 1.0 - 0.6);
      float v = a * 0.50 + b * 0.28 + c * 0.22;
      return mix(0.26, 1.0, smoothstep(0.12, 0.88, v));
    }

    /* The bolt outline, recovered from the boundary edges of the front cap.
       Same six corners as the brandmark; the exported fillets are ~0.0015
       across, well under the width of the band this drives. */
    vec2 boltCorner(int i) {
      if (i == 0) return vec2( 0.0127,  0.1096);   // top tip
      if (i == 1) return vec2( 0.0127,  0.0404);   // inner corner, upper
      if (i == 2) return vec2( 0.0562,  0.0404);   // right point
      if (i == 3) return vec2(-0.0127, -0.1096);   // bottom tip
      if (i == 4) return vec2(-0.0127, -0.0404);   // inner corner, lower
      return vec2(-0.0562, -0.0404);               // left point
    }

    float polyDist(vec2 p) {
      float best = 1e9;
      for (int i = 0; i < 6; i++) {
        int j = i + 1;
        if (j > 5) j = 0;
        vec2 a = boltCorner(i);
        vec2 b = boltCorner(j);
        vec2 ab = b - a;
        vec2 ap = p - a;
        float h = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
        best = min(best, length(ap - ab * h));
      }
      return best;
    }

    /* Hue-preserving shoulder.  Nothing races to white, which under
       hard-light would blow a hole in the backdrop. */
    vec3 softClip(vec3 c) {
      float m = max(max(c.r, c.g), c.b);
      if (m <= 0.82) return c;
      float t = m - 0.82;
      return c * ((0.82 + t / (1.0 + t / 0.18)) / m);
    }

    const int LOOP = 8;

    void main() {
      vec2 uv = gl_FragCoord.xy / winResolution.xy;
      vec3 normal = worldNormal;
      vec3 color = vec3(0.0);

      /* ================================================================
         Original dispersion loop, verbatim.  This is the ONLY per-channel
         sampling in the shader and it only ever reads uTexture, i.e. what
         is behind the glass.  Nothing added after it is split per channel,
         so the model itself is never aberrated.
         ================================================================ */
      for (int i = 0; i < LOOP; i++) {
        float slide = float(i) / float(LOOP) * 0.1;

        vec3 refractVecR = refract(eyeVector, normal, 1.0/uIorR);
        vec3 refractVecY = refract(eyeVector, normal, 1.0/uIorY);
        vec3 refractVecG = refract(eyeVector, normal, 1.0/uIorG);
        vec3 refractVecC = refract(eyeVector, normal, 1.0/uIorC);
        vec3 refractVecB = refract(eyeVector, normal, 1.0/uIorB);
        vec3 refractVecP = refract(eyeVector, normal, 1.0/uIorP);

        float r = texture2D(uTexture, uv + refractVecR.xy * (uRefractPower + slide * 1.0) * uChromaticAberration).x * 0.5;

        float y = (texture2D(uTexture, uv + refractVecY.xy * (uRefractPower + slide * 1.0) * uChromaticAberration).x * 2.0 +
                   texture2D(uTexture, uv + refractVecY.xy * (uRefractPower + slide * 1.0) * uChromaticAberration).y * 2.0 -
                   texture2D(uTexture, uv + refractVecY.xy * (uRefractPower + slide * 1.0) * uChromaticAberration).z) / 6.0;

        float g = texture2D(uTexture, uv + refractVecG.xy * (uRefractPower + slide * 2.0) * uChromaticAberration).y * 0.5;

        float c = (texture2D(uTexture, uv + refractVecC.xy * (uRefractPower + slide * 2.5) * uChromaticAberration).y * 2.0 +
                   texture2D(uTexture, uv + refractVecC.xy * (uRefractPower + slide * 2.5) * uChromaticAberration).z * 2.0 -
                   texture2D(uTexture, uv + refractVecC.xy * (uRefractPower + slide * 2.5) * uChromaticAberration).x) / 6.0;

        float b = texture2D(uTexture, uv + refractVecB.xy * (uRefractPower + slide * 3.0) * uChromaticAberration).z * 0.5;

        float p = (texture2D(uTexture, uv + refractVecP.xy * (uRefractPower + slide * 1.0) * uChromaticAberration).z * 2.0 +
                   texture2D(uTexture, uv + refractVecP.xy * (uRefractPower + slide * 1.0) * uChromaticAberration).x * 2.0 -
                   texture2D(uTexture, uv + refractVecP.xy * (uRefractPower + slide * 1.0) * uChromaticAberration).y) / 6.0;

        float R = r + (2.0*p + 2.0*y - c)/3.0;
        float G = g + (2.0*y + 2.0*c - p)/3.0;
        float B = b + (2.0*c + 2.0*p - y)/3.0;

        color.r += R;
        color.g += G;
        color.b += B;

        color = sat(color, uSaturation);
      }

      color /= float(LOOP);

      /* ================================================================
         Surface parameters, derived from the mesh.  The GLB carries only
         position/normal/uv, so the wall/face split, the across-wall
         coordinate and the along-bolt coordinate all come out of those.
         ================================================================ */

      // caps sit at |n.z| ~ 1, walls at ~0, the bevel ramps between
      float wallMask = 1.0 - smoothstep(0.34, 0.88, abs(vObjNrm.z));

      // across the extrusion: 0 at the back face, 1 at the front face
      float acrossWall = clamp(vObjPos.z / (2.0 * HALF_D) + 0.5, 0.0, 1.0);

      // along the bolt, tip to tip
      float axis = clamp(vObjPos.y / (2.0 * HALF_H) + 0.5, 0.0, 1.0);

      // inward from the outline, for the band carried by the glass faces
      float dEdge = polyDist(vObjPos.xy);
      float inFromEdge = clamp(dEdge / uEdgeBand, 0.0, 1.0);

      float ndv = clamp(abs(dot(normalize(eyeVector), normal)), 0.0, 1.0);
      float amp = ampAlong(axis + uTime * 0.012);

      /* One band coordinate for both surfaces: across the wall's width where
         there is a wall, inward from the outline on the glass faces. */
      float across = mix(1.0 - inFromEdge, acrossWall, wallMask);
      float cyc = uBandSpread * (0.85 + 0.45 * sin(axis * TAU * 2.2 + 0.4));
      float bt = across * cyc
               + 0.42 * (1.0 - ndv)
               + 0.45 * sin(axis * TAU)
               + uTime * 0.022;
      vec3 band = spectrum(bt);

      /* ================================================================
         Composite, pivoted on 0.5 because the canvas is hard-light.
         ================================================================ */
      vec3 col = vec3(0.5);                 // 0.5 = backdrop passes through

      col += color * uGlassGain;            // refracted, aberrated backdrop

      // brushed silver under the bands, strongest where the prism is quiet
      float up = normal.y * 0.5 + 0.5;
      float sx = normal.x * 0.5 + 0.5;
      float metal = mix(0.30, 0.68, smoothstep(0.02, 0.98, up * 0.70 + sx * 0.30));
      metal *= 0.94 + 0.12 * hash11(floor(axis * 340.0));
      col = mix(col, vec3(metal), wallMask * uMetalGain * (1.0 - 0.55 * amp));

      /* Quiet stretches relax toward the neutral pivot instead of going dark.
         Under hard-light, pulling a quiet band toward black would just punch a
         black hole in the backdrop; pulling it toward 0.5 reads as clear glass,
         which is what "subtle" should mean here. */
      vec3 bandQuiet = mix(vec3(0.5), band, mix(0.42, 1.0, amp * amp));

      float faceBand = (1.0 - wallMask) * pow(1.0 - inFromEdge, 1.35);
      float weight = clamp((wallMask * 0.97 + faceBand * 0.92) * uBandGain, 0.0, 1.0);
      col = mix(col, bandQuiet, weight);

      // speculars pick up the local band hue rather than adding white
      float specularLight = specular(uLight, uShininess, uDiffuseness);
      col += specularLight * mix(vec3(1.0), band, 0.86) * mix(0.30, 1.0, amp) * 0.26;

      /* The rim that used to be 'f * vec3(1.0)' -- the white hairline.
         Same Fresnel term, spectral instead of white. */
      float f = fresnel(eyeVector, normal, uFresnelPower);
      col += f * spectrum(bt + 0.35) * 0.38;

      gl_FragColor = vec4(softClip(col), 1.0);
    }
  `;

  /* Defaults for the six added uniforms.  Everything already on the material
     keeps its current value. */
  const addedUniforms = {
    uTime:       0.0,
    uBandSpread: 1.60,
    uBandGain:   0.92,
    uGlassGain:  0.55,
    uEdgeBand:   0.030,   // object units; bolt half-height is 0.1096
    uMetalGain:  0.30
  };

  /* Apply to a live mesh (or to every mesh under a container). */
  function apply(target) {
    let mesh = null;
    if (target && target.isMesh) mesh = target;
    else if (target && target.traverse) target.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return null;

    const m = mesh.material;
    for (const k in addedUniforms) {
      if (!m.uniforms[k]) m.uniforms[k] = { value: addedUniforms[k] };
    }
    m.vertexShader = vertexShader;
    m.fragmentShader = fragmentShader;
    m.needsUpdate = true;
    return m;
  }

  root.SLIK_PRISM = { vertexShader, fragmentShader, addedUniforms, apply, HALF_D, HALF_H };
})(typeof window !== "undefined" ? window : globalThis);
