# Putting the Glass Bolt into Webflow

There is no model file to upload. The bolt is built in code when the page loads. What goes into Webflow is:

- **one script tag**, added once for the whole site;
- **one empty div per mark**, with a custom attribute that says which version it is.

The two versions are named for the page they sit on:

| Version | Use it on | Glass opacity |
| --- | --- | --- |
| `white` | white or light sections | 0.07 |
| `black` | black or dark sections | 0.13 |

Everything else about the look is identical: refraction, dispersion, light, spin and framing. The canvas itself is transparent, so the section's own background shows through the glass.

---

## 1. Add the script, once

Go to **Site settings → Custom code → Footer code** and paste:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/webdesignbestdev/prism-bolt@v2.0.0/embed.js"></script>
```

Save. If the bolt only appears on one page, put the same line in that page's settings instead: the gear icon on the page in the Pages panel, then **Custom code → Before `</body>` tag**.

`@v2.0.0` pins the version. The file at that URL never changes, so nothing updates on the live site until you change that number yourself.

> Webflow runs custom code on the published site only, not in the Designer canvas. In the Designer the div stays empty. Publish to your `.webflow.io` staging domain to see the bolt.

---

## 2. The white version

In a section with a white background:

1. Add a **Div Block** and give it the class `bolt_wrap`.
2. Give it a size. The bolt fits itself inside this box, so the box decides how big it is.
   - Width `100%`, Height `70vh` is a good start.
   - At the tablet and phone breakpoints, try Height `50vh`.
3. Open **Element settings** (the gear, or `D`). Under **Custom attributes**, click **+** and add:
   - Name `data-glass-bolt`, Value `white`
4. Optionally, for screen readers, add two more attributes:
   - Name `role`, Value `img`
   - Name `aria-label`, Value `Glass lightning bolt`

A div with no height shows nothing, so step 2 matters.

## 3. The black version

The same steps, in a section with a black background, with one difference in step 3:

- Name `data-glass-bolt`, Value `black`

You can reuse the `bolt_wrap` class. The version comes from the attribute, not the class.

Attribute values are lowercase: `white`, `black`. A missing or misspelled value falls back to `white`.

---

## 4. Optional: tune a single mark

Add any of these custom attributes next to `data-glass-bolt`. Each overrides that one mark only.

| Attribute | Default | What it does |
| --- | --- | --- |
| `data-opacity` | `0.07` white / `0.13` black | How much the glass hides what is behind it. `0` is perfectly clear and `1` is solid grey. |
| `data-spin` | `0.25` | Rotation speed in radians per second. `0` holds it still. |
| `data-zoom` | `0.79` | Framing. Lower shows more margin round the mark, higher fills the box. |
| `data-zoomable` | off | Set to `true` to let visitors scroll or pinch to zoom and drag to pan. Off by default because it captures the page's scroll while the cursor is over the mark. |

Example: a still bolt that fills more of its box gets `data-spin = 0` and `data-zoom = 1`.

---

## 5. Good to know

- **Off screen costs nothing.** Each mark stops rendering when it scrolls out of view and starts again as it comes back.
- **Reduced motion.** Visitors with *reduce motion* turned on in their system settings see the bolt held still at an angle that shows its depth.
- **One WebGL context per mark.** Browsers allow around 16 per page. Two or three bolts are comfortable; a dozen are not.
- **No WebGL.** On the rare browser without it, the div stays empty and the rest of the page is unaffected.
- **Performance.** On an Intel HD 630 one full-screen mark renders in about 10 ms a frame. A smaller div is a cheaper render.
- **The old embed.** `prism-bolt.min.js` from the earlier build still loads from `@v1.0.0`. If the site still has that script tag, remove it when you add this one.

## 6. Driving it from your own code

Every mark is reachable from the page once the script has run:

```js
const bolt = GlassBolt.get('[data-glass-bolt="white"]');
bolt.setUniforms({ uOpacity: 0.1 }); // any value from the tuner panel
bolt.options.spin = 0.5;             // faster
bolt.setPaused(true);                // stop
```

If a mark is added to the page after load, for example in CMS content loaded later, call `GlassBolt.mountAll()`.

---

## 7. Changing the look later

1. Run the tuner locally with `node serve.mjs` and open http://localhost:5190. Its background switch flips between the white and black versions, using the same values the embed uses.
2. Copy the values you like into `DEFAULTS` or `PRESETS` at the top of `glass-bolt.js`.
3. Commit and push, then tag the new version:

   ```bash
   git tag v2.0.1
   ```

   ```bash
   git push origin v2.0.1
   ```

4. In Webflow, change `@v2.0.0` to `@v2.0.1` in the footer script and publish.

## 8. If nothing shows

- **Check the div's height.** It needs one.
- **Check the attribute.** It is `data-glass-bolt`, with the value `white` or `black`.
- **Check you're on the published site.** Custom code doesn't run in the Designer.
- **Check the console.** On the published page, look for an error mentioning `GlassBolt` or a failed load of `embed.js`.
- **A new tag can be slow to appear.** jsDelivr can take a few minutes to see a tag you just pushed.
