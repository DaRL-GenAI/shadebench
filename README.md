# DeepShade × ShadeBench — Interactive Demo

A single-page site that puts the **DeepShade** paper (IJCAI 2025) and the
**ShadeBench** dataset (KDD 2026, AI4Science) into one place, with interactive
visualizations for the qualitative story.

## Structure

```
index.html          single-page demo
styles.css          dark-navy theme matching the existing project site
app.js              interactivity (time slider, gallery, compare, modalities)
prepare_assets.py   pulls one city from HuggingFace and carves out demo frames
assets/             generated — gitignore if you like
```

## Quick start

```bash
# 1. install deps for the asset prep script
pip install huggingface_hub pillow

# 2. download one city (default: phoenix) and extract demo frames
python prepare_assets.py

# 3. (optional) also fetch a few gallery thumbnails
python prepare_assets.py --city phoenix --thumbs tokyo paris cairo sydney

# 4. serve the page
python -m http.server 8000
# → open http://localhost:8000
```

Without step 2, the page still renders — every image slot falls back to an
inline SVG placeholder that labels the missing asset (useful while iterating).

## What's on the page

- **Hero** — titles, venues (IJCAI 2025 / KDD 2026), animated stat counters.
- **Interactive time-of-day slider** — drag or ▶ Play to sweep 06:00 → 17:00
  for the selected city; a sun marker tracks azimuth across an arc overlay.
- **34-city gallery** — click any city to jump back up and swap the demo.
- **Before/After compare slider** — draggable divider across three pairings:
  Satellite ↔ Prediction, Prediction ↔ Ground Truth, Source ↔ Target.
- **Five-modality grid** — Satellite · Mask · Source · Target · OBJ, all
  aligned to the currently selected city.
- **Results table** — ablation rows with the full DeepShade highlighted.
- **Usage** — `load_dataset` snippet, per-city `hf_hub_download`, BibTeX.

## Deploying

Everything is static. Drop `index.html`, `styles.css`, `app.js`, and the
generated `assets/` directory onto GitHub Pages / Netlify / any static host.

## Swapping in richer assets

`prepare_assets.py` extracts middle-of-list frames to stay deterministic. If you
want a specific tile (e.g. Tempe campus, or a skyline that makes a good thumb),
edit the `pick = names[len(names) // 2]` line in `prepare_city`.

The web app expects these filenames inside `assets/demo/<city>/`:

| file                 | used by                              |
| -------------------- | ------------------------------------ |
| `shade_06.jpg` … `shade_17.jpg` | hourly time-of-day slider |
| `satellite.jpg`      | compare tab · modality grid          |
| `mask.jpg`           | modality grid                        |
| `source.jpg`         | compare tab · modality grid          |
| `target.jpg`         | compare tab · modality grid          |
| `obj.jpg`            | modality grid                        |

Gallery thumbs live at `assets/cities/<city>.jpg`.
