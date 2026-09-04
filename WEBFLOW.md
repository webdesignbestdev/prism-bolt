# Putting the bolt into Webflow

There is no 3D model file. The bolt's outline is six traced coordinates, the
geometry is built in code when the page loads, and the glass is a shader — so
there is nothing to export, no `.glb`, no textures, no model host. What you
integrate is **one JavaScript file** and **one empty div**.

---

## 1. Host the file

The built file is `dist/prism-bolt.min.js` (489 KB raw, **121 KB gzipped** —
about the weight of one large hero photo).

Push this repo to GitHub, then jsDelivr serves it from a CDN for free:

```bash
git remote add origin https://github.com/webdesignbestdev/prism-bolt.git
```

```bash
git push -u origin main
```

Then tag a version, so a later change to `main` can never alter a live site
without you deciding to:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Your script URL is then:

```
https://cdn.jsdelivr.net/gh/webdesignbestdev/prism-bolt@v1.0.0/dist/prism-bolt.min.js
```

> Check the username. I read `webdesignbestdev` off your git config — if the
> repo goes somewhere else, swap that segment. If the repo is **private**,
> jsDelivr cannot read it; it has to be public, or use Netlify/Vercel instead.

To ship an update later: rebuild, commit, tag `v1.0.1`, and change the version
in the URL. Nothing goes live until you change that number.

---

## 2. Add the script in Webflow

**Project Settings → Custom Code → Footer Code**, or the page's own settings if
you only want it on one page:

```html
<script src="https://cdn.jsdelivr.net/gh/webdesignbestdev/prism-bolt@v1.0.0/dist/prism-bolt.min.js"></script>
```

Footer, not header — the script mounts on `DOMContentLoaded` and needs the
elements to exist.

---

## 3. Build the section

Three nested elements. All of this is normal Webflow — no code.

```
Section        "Bolt Track"     ← height 300vh, custom attribute: data-prism-track
  └ Div        "Bolt Sticky"    ← position sticky, top 0, height 100vh
      └ Div    "Bolt Canvas"    ← width/height as you like, attribute: data-prism-bolt
```

**Section "Bolt Track"** — the scroll distance. Height `300vh` gives a
comfortable pace; `200vh` is faster, `400vh` slower. Add the custom attribute
`data-prism-track` (leave the value empty).

**Div "Bolt Sticky"** — Position `Sticky`, Top `0`, Height `100vh`. This is what
holds the bolt on screen while the section scrolls past. Set Display `Flex`,
centred both ways, so the canvas sits in the middle.

**Div "Bolt Canvas"** — give it a size (e.g. Width `70vw`, Height `68vh`) and
these custom attributes:

| Attribute          | Value      | What it does                              |
| ------------------ | ---------- | ----------------------------------------- |
| `data-prism-bolt`  | *(empty)*  | Marks it. Required.                       |
| `data-background`  | `#F5F5F5`  | The colour behind it. **Required** — see §4 |
| `data-to-x`        | `15`       | End tilt, degrees                         |
| `data-to-y`        | `-35`      | End turn, degrees. Negative turns the right side toward you |
| `data-scale`       | `1`        | Optional. Multiplies the automatic fit    |

That's the whole integration. No Webflow Interaction needed — the bolt reads the
scroll position itself, which also means Webflow's smooth scroll, Lenis, or
anything else works without wiring.

For the dark variant, the same structure with `data-background="#171717"`.

---

## 4. Why `data-background` matters

The canvas is **transparent**, so your Webflow background shows through around
the mark. But the glass works by refracting what is behind it, and it can only
see things inside the WebGL scene — it cannot see your HTML.

So it refracts an invisible in-scene surface, and `data-background` is what
colour that surface is. Set it to the section's background colour and the two
agree, so the mark looks like real glass sitting on your page.

Set it wrong and the mark's body will be a different colour from its
surroundings — it will look like a pale cut-out on a dark section, or vice
versa. This is also why it works over a flat colour but not over a photo or over
text: there is no single colour to match.

Your two variants are already accounted for: `#F5F5F5` and `#171717`.

---

## 5. Tuning the end pose

Run the tuner and scrub the sliders until the resting angle looks right:

```bash
npm run preview:embed
```

Open http://localhost:5179/preview/ — both variants, with sliders for the start
and end angles. It prints the exact attributes to paste into Webflow, with a
copy button. Nothing needs rebuilding; you are just reading off numbers.

Default is a quarter turn: starts dead square, ends at `15°` tilt / `-35°` turn.
The negative turn swings the mark's right side toward you, which is the
direction that shows the notch wall and keeps the arms readable. Motion is eased
at both ends, so it settles rather than arriving at speed.

**Size is automatic.** The mark is fitted to its canvas rather than set to a
fixed size, so a tall narrow div and a wide short one get the same proportion of
mark to margin. The fit is measured against the pose it will actually animate
through — turning the mark swings its own depth into the silhouette, so fitting
the flat outline alone would let it graze the edge part way through the scroll.
To deviate, `data-scale="1.1"` multiplies the fit; it is not an absolute size.

---

## 6. Optional: drive it yourself

If you would rather run it from GSAP ScrollTrigger, a Lenis timeline, or a
Webflow Interaction, hand it a progress value from `0` to `1` and it stops
following the scroll:

```html
<script>
  const bolt = PrismBolt.get('[data-prism-bolt]');
  bolt.setProgress(0.5);       // half way through the flip
  bolt.setProgress(null);      // hand control back to the scroll
</script>
```

Also available on each instance:

| Call                          | Does                                            |
| ----------------------------- | ----------------------------------------------- |
| `setProgress(0..1 \| null)`   | Drive the flip manually, or release it           |
| `setPose({x,y}, {x,y})`       | Change start/end angles at runtime, in degrees   |
| `setBackground('#171717')`    | Change the refracted colour, e.g. on a theme flip |
| `getPose()`                   | Current angles, progress, and what is driving it  |
| `destroy()`                   | Tear down and free the GPU context                |

`PrismBolt.mountAll()` re-scans the page — useful if you add an instance after
load. `PrismBolt.get(selectorOrElement)` fetches an existing one.

---

## 7. Things worth knowing

**Several instances are fine.** Each gets its own canvas and its own track, and
anything off screen stops rendering entirely — an instance below the fold costs
nothing until it approaches the viewport.

**Full quality on mobile**, as you asked. The shader does 96 texture lookups per
pixel, so if you see frame drops on older phones, the first lever is the canvas
size (a smaller div is a smaller render), not the settings.

**One WebGL context per instance.** Browsers cap this around 16, so a page with
two or three bolts is comfortable; a page with twelve is not.

**It does not touch your page.** No global CSS, no scroll hijacking, no
listeners on anything but its own element.
