# Prism Bolt

The brandmark bolt as a solid of transparent glass, in React Three Fiber with a
custom shader material. Refraction, chromatic dispersion, and prism colour on
the edges, following Maxime Heckel's
[Refraction, dispersion, and other shader light effects](https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects/).

```bash
npm install && npm run dev
```

Drag to orbit, scroll to zoom. `h` panel · `g` ground · `s` still to `./shots`.

## How it works

There is no `MeshPhysicalMaterial` and no post-processing pass. Everything is
one `ShaderMaterial`.

**Transparency** is a frame buffer. Each frame renders the scene without the
bolt into an FBO, and the fragment shader samples that texture at the fragment's
own screen position, `gl_FragCoord.xy / winResolution.xy`.

**Refraction** shifts those sample coordinates along `refract(eye, normal, 1/ior)`.
Both vectors are in **view** space — only there does the `.xy` of a refracted
vector correspond to a screen-space offset. Lighting uses the world-space pair
instead, so the mark tumbles through a fixed light rather than dragging the
highlights around with it.

**Dispersion** gives each of six bands its own index of refraction and walks the
offset a little further out on each of sixteen passes, averaging the result. One
sample per band gives six hard fringes; the loop is what makes the split
continuous. Colour is carried in **RYGCBV** rather than RGB, so yellow, cyan and
violet have their own IOR and can be tuned apart from the primaries. The
round-trip back to RGB is exact for a flat input, so an unrefracted region
returns the background unchanged.

**`sat()`** runs inside the loop, as in the article. Note it compounds: at 1.10
that is roughly 4.6x over sixteen passes, which is far more than this palette
wants — it sits at 1.028, about 1.55x.

**The backside pass** renders the mesh's back faces into a second FBO before the
front faces are drawn to screen sampling it. The light on the far walls is
therefore refracted and dispersed by the near face, which is what puts readable
colour through the middle of the mark instead of leaving a bright outline around
an empty centre.

Specular and diffuse are Blinn-Phong against two lights; Fresnel is
`pow(1 - |dot(eye, normal)|, power)`.

### Chromatic aberration, and where it is not

The aberration is entirely inside the material, in the texture sampling. It
applies to what is seen *through* the glass and never to the model itself. That
is why there is no `ChromaticAberration` effect in a post-processing chain — a
post pass would smear the mark's own silhouette, which is the thing to avoid.

## What decides whether this reads

### The room has to be near neutral, and free of anything with a shape

`sat()` cannot tell the dispersion's chroma from the room's, so it amplifies
both. Light the scene with anything tinted — even `#05060a`, which looks black
but is a blue — and the compounding passes drive a channel negative and the mark
comes back a flat saturated cast. `boxLo`/`boxHi` are near neutral for this
reason; only the ground the viewer actually sees may lean warm or cool.

The room the glass sees is a **soft box**: a broad, smooth luminance field with
no edge anywhere in it, switched on **only while the FBO passes run** (`SoftBox`
in `Room.jsx`, made visible by `Bolt.jsx` around the two renders). The page
behind stays one flat colour. Both planes are billboarded onto the camera, so
orbiting never swings the room into view edge-on.

`boxLo`/`boxHi` have to **track the ground**. They are the room the glass is
standing in: leave them pale while the page goes black and the mark keeps
reading as a milky white object lit by a studio that is not in the scene, rather
than showing the dark background through itself. Anything that adds a constant
the background cannot influence has the same effect, which is why `uMilk` is
scaled by local luminance and `uDiffuseness` — a broad term that lifts the whole
flat body — is kept low. On black the body then sits near the page value and the
only bright things left are the specular highlights and the dispersion riding on
them.

An earlier version put a lattice of narrow high-contrast bars there instead. It
gave the dispersion plenty to bite on, but a bar is a hard edge and hard edges
survive refraction: they printed straight through the body of the mark as pale
diagonal streaks. Nothing in the soft box is localised enough to have a shape of
its own, so nothing of it can come back out through the glass — what survives is
a gentle gradient, which is what a wide, blended wash of colour is made of.
Because the soft box is never seen directly it does not have to share the page's
value either: it stays pale on both grounds, which is what keeps the body light
and silvery rather than letting it go dark whenever the page does.

### Wall winding is silently fatal

Every wall triangle was wound inward for most of this build. Walls are strips
whose rows run back to front while each pair runs along the edge, so the index
order decides the facing — and the wrong order puts the face normal at minus the
edge normal. On the front pass (`THREE.FrontSide`) all 300 wall triangles were
back-face culled, and the extrusion read as open along any side you could see
into: the left notch and the lower inner corner simply ended.

It hid for so long because the cap rims are wound correctly and kept rendering,
and a rim looks enough like a wall at a glance to pass. `npm run check:geometry`
compares every face normal against the shading normals at its corners and prints
the count per group, which catches it in one line:

```
walls          triangles=300  outward=300  INWARD=0
```

### The normal sweep has to reach the cap, or the head-on view collapses

The silhouette is a hard-edged extrusion — the mark stays crisp and the tips
stay points. The rounding is entirely in the *shading* normal, swept along one
continuous profile across the cross-section (`boltGeometry.js`): straight out at
mid-depth, through `edgeAngle` where the wall meets the cap, round to flat `±z`
in the cap interior.

The tempting version keeps that whole sweep on the wall. It looks right at three
quarters and falls apart head-on, because from the front a wall is edge-on and
covers almost no pixels — the grazing normals have nowhere to sit and the mark
reduces to a coloured hairline. Carrying the sweep out onto a **rim on the cap
face** gives those same normals a band of real width, and the spectrum stays
readable straight on.

Band *strength* then comes from the incidence angle, not from a fixed position
across the wall. A prism splits nothing at normal incidence and hardest at a
glancing one, so tying the spread to incidence keeps the flat caps calm,
concentrates colour on the swept rim and walls, and moves the hot band by itself
as the mark turns. Hue comes from the profile coordinate, so it lies out across
the width as bands. Both are modulated along the outline's arc length, which is
what makes the intensity vary from one part of the bolt to another.

Highlights roll off along the luminance axis rather than per channel, so a hot
wall gets brighter without sliding to white.

### The tint has to filter, not glow

On a body this pale, *adding* colour does nothing: the hue disappears into the
white it is sitting on, and pushing it hard enough to see turns the mark into an
oil slick. So the spectrum is applied as a filter — multiplied, not added.

Multiplying by a hue normally darkens, so `spectrum()` divides the hue by its
own luminance first. The tint then shifts colour without touching brightness,
which is the whole trick to a pale surface that still has mint, aqua,
periwinkle, lavender, blush and cream moving across it. `uPrismChroma` pulls the
hue back toward white before that so none of them can reach full saturation,
`uMilk` lifts the result toward white at the end, and `uWash` decides how much
tint the flat interior keeps versus the swept surfaces.

Measured over a full frame, on both grounds: no colour anywhere exceeds 0.30
saturation, no pixel sits above half saturation, and the mean luminance of every
tinted pixel is about 224 out of 255.

### Colour management is off, deliberately

Every material here is a raw `ShaderMaterial`, and three only adds its output
colour-space conversion to its own built-in shaders. Left enabled, colour
management converts each hex from sRGB to linear on the way in with nothing
converting back on the way out — every value lands about 8% dark and nothing in
`THEMES` means what it says. `legacy` on the `<Canvas>` turns it off, so the
pipeline is display-referred all the way through, frame buffers included.

## Layout

```
src/
  App.jsx                 canvas, themes, controls, keys
  components/Bolt.jsx     the mesh, the two FBO passes, the motion
  components/Room.jsx     flat visible ground + the FBO-only soft box
  lib/boltGeometry.js     traced outline -> prism with the swept normal profile
  shaders/bolt.*.glsl     refraction, dispersion, lighting
  shaders/room.*.glsl     ground and soft box, uBars switches between them
```

The mark loads square: rotation `[0, 0, 0]` on every axis, camera on axis, no
tilt applied to show off the walls. Turning it is the orbit controls' job and
nothing else moves it. (`npm run dev` and read `window.__bolt.rotation` if you
want to confirm it; the silhouette also comes back 99.8% point-symmetric about
the image centre, which is the outline's own D1/D2 asymmetry and nothing else.)

The optional idle drift — `idle` in the form folder, off by default — is
spring-driven (stiffness 300, damping 30, mass 1). Every term in it is a bare
sine with no phase offset, so it starts at exactly zero and eases out of square
rather than snapping to some point part way through its travel. Its clock only
advances while nobody is dragging, so inspection is not fighting a moving target
and letting go resumes from where it stopped. The drift stays
bounded on purpose: an unbounded spin swings a flat extrusion edge-on, where it
has nothing to show.

## Tuning

Everything is on the Leva panel. Two hooks are also live in the console, which
is usually faster for one value:

```js
window.__ov   = { uPrism: 0, uSpecular: 0 }  // override any uniform live
window.__rot  = { x: 0.10, y: -0.44 }        // pin the pose so shots compare
window.__bolt                                // the mesh, for reading the pose
```

Set either to `null` to release it.

The frame buffers do not survive a hot update — the material comes back sampling
a disposed texture and the mark goes black — so `Bolt.jsx` takes a full reload
on HMR rather than leaving a broken state.

The previous raw-WebGL2 raymarched version is kept under `_old/`.
