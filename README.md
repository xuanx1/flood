# FLOOD

**Atlas of the Drowned Century** — a dystopian-futuristic joyplot of world population, with rising-sea overlay.

![](screenshots/01-v7.png)

## What it is

A single-page HTML visualization. Each horizontal ridge is a 0.6° latitude band of world population density. City peaks rise sharply out of a rural baseline that traces every continent. As the **water table** slider rises (0 → 70 m of sea-level rise), coastal megacities turn red and get marked drowned, and the world's projected population shifts under per-region growth/decline curves.

## How to use

Open `Flood Joyplot.html` in any modern browser. No build step, no install.

- **Drag the slider** at the bottom-left to raise sea levels.
- **Watch the HUD** — displaced humans, drowned megacities, remaining world population (all reprojected for that year's demographic scenario).
- **Toggle Tweaks** from the toolbar (or whatever your host exposes) to change the water palette, scanlines, film grain, or trigger an auto-flood timelapse.

## Files

| File                | Purpose |
|---------------------|---------|
| `Flood Joyplot.html`| Page shell, HUD, slider, atmosphere overlays |
| `joyplot.js`        | Density grid, region detection, growth tables, canvas renderer |
| `data.js`           | Cities (95), rural anchors (~150), land-fill seeds (~380) |
| `tweaks.js`         | Vanilla-JS tweak panel (palette / scanlines / grain / auto-flood) |

All assets are local. No CDN, no Google Fonts, no React. The page is styled with system fonts (`ui-monospace`, `system-ui`) so it renders identically offline.

## Data

The numbers are **evocative, not authoritative**. Specifically:

- **Cities** — name / lat / lon / population (millions) / centroid elevation / coastal flag. Hand-curated to UN World Urbanization Prospects 2024 magnitudes.
- **Rural anchors + land seeds** — procedurally placed to give every populated landmass a baseline density. Not derived from a real raster.
- **Elevation** — single-cell city-center values plus a handful of coastal lowland seeds (Bangladesh delta, Mekong, Java, Mississippi, etc.). Real flood modelling would use SRTM / Terrarium tiles.
- **Population growth/decline** — per-region multipliers calibrated to UN WPP-2024 through 2100, then **speculative** climate-impacted projections beyond. Each of 12 regions has its own curve (Sub-Saharan Africa peaks ~2.5× around 2200; East Asia drops below 0.4× by 2200; everything tails off post-2400).
- **Sea-level → year mapping** — calibrated to mainstream climate science: ~1 m by 2100 (IPCC AR6 SSP5-8.5), multi-millennial commitment to ~10 m, full-melt theoretical max (~70 m) only at the 10,000+ year scale.

If you want real datasets wired in (GPW, SRTM, WPP raw), that's a one-day swap.

## Tech

- Vanilla JS, no dependencies.
- Canvas 2D rendering at devicePixelRatio.
- Pre-computed density grid (220 rows × 900 cols) stamped from Gaussian kernels.
- Per-cell region IDs precomputed once; growth multipliers applied per frame when the year changes.
- Drowned overlay is a per-row subpath fill so only actually-flooded coast areas render in water-color.

The joyplot is ready to explore — drag the slider and watch the world drown.
