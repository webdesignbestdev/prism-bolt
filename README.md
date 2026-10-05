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

The scene holds nothing else, and the canvas is transparent.

## The two versions

`PRESETS` in `glass-bolt.js` defines `white` and `black`, named for the page the mark sits on. They differ only in `uOpacity` (0.07 and 0.13); everything else is shared `DEFAULTS`.

## Changing the look

1. Tune in `index.html`.
2. Copy the values into `DEFAULTS` or `PRESETS` in `glass-bolt.js`.
3. Commit, then tag a new version.
4. Bump the version in the Webflow script URL.

## History

Before v2.0.0 this repository held Prism Bolt, the earlier build. Its tag `v1.0.0` still serves `dist/prism-bolt.min.js`, so anything already pointing at that tag keeps working.
