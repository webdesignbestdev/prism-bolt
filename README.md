# Glass Bolt

The brandmark as clear prismatic glass, in three.js. It rotates slowly, dims the page behind it a little so it reads on white and on black, and shows soft prismatic fringes as it turns.

**Putting it on the site: see [WEBFLOW.md](WEBFLOW.md).**

## Files

| File | What it is |
| --- | --- |
| `glass-bolt.js` | The mark: geometry, shaders and render loop. All the tuned values sit at the top. |
| `embed.js` | The website loader. It mounts the mark on every element with a `data-glass-bolt` attribute. |
| `index.html` | The tuner: the mark full screen with a control panel. |
| `embed-example.html` | A white section and a black section, each mounted through `embed.js` the same way Webflow does. |
| `serve.mjs` | A zero-dependency local server. |

There is no build step and nothing to install. three.js loads from jsDelivr.

## Run it locally

```bash
node serve.mjs
```

Then open http://localhost:5190 for the tuner, or http://localhost:5190/embed-example.html for the embed.

The tuner's keys are:

- `b` flips between the white and black versions.
- `h` hides the panel.
- `+` / `-` zoom, and `0` resets.

You can also scroll or pinch to zoom, drag to pan once zoomed in, and double-click to reset.

## How it works

Each frame draws the mark twice, after Maxime Heckel's article on refraction and dispersion:

1. The back faces go into an offscreen render target.
2. The front faces go to the screen. For each pixel, the front pass samples that capture 24 times. Each sample uses a slightly different index of refraction, from red to violet, and the results are weighted by colour and averaged.

The canvas is transparent.

## Distortion

The glass bends whatever is drawn behind it in its own canvas. `bolt.backdrop` is a three.js `Group` placed behind the mark, in bolt units (the bolt is 2 tall, centred on 0, 0). Anything added to it is drawn on the canvas and seen through the glass shifted, with a faint colour fringe at its edges:

```js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';

const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 2.6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
bolt.backdrop.add(bar);
```

`uDistortion` (0.75) sets how far the glass shifts it. `uFringe` (0.05) sets how far its colours split.

The HTML page under the canvas is out of reach: WebGL cannot see it. Over a plain section there is nothing to bend. With an empty backdrop the distortion adds nothing and costs nothing.

## The two versions

`PRESETS` in `glass-bolt.js` defines `white` and `black`, named for the page the mark sits on. They differ only in `uOpacity` (0.13 and 0.07); everything else is shared `DEFAULTS`.

## Changing the look

1. Tune in `index.html`.
2. Copy the values into `DEFAULTS` or `PRESETS` in `glass-bolt.js`.
3. Commit, then tag a new version.
4. Bump the version in the Webflow script URL.

## History

Before v2.0.0 this repository held Prism Bolt, the earlier build. Its tag `v1.0.0` still serves `dist/prism-bolt.min.js`, so anything already pointing at that tag keeps working.
