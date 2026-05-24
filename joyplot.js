// FLOOD — joyplot renderer
// Builds population density grid from cities + rural points, draws as stacked ridges,
// overlays "drowned" population in water-color as sea level rises.

(function () {
  const canvas = document.getElementById('joy');
  const ctx = canvas.getContext('2d');

  // ---------- grid parameters ----------
  const LAT_TOP    = 75;
  const LAT_BOTTOM = -55;
  const LON_LEFT   = -180;
  const LON_RIGHT  = 180;
  const ROWS = 220;     // joyplot ridge count (and lat resolution)
  const COLS = 900;     // longitude samples (high enough that peaks are sharp)
  const LAT_RES = (LAT_TOP - LAT_BOTTOM) / ROWS;
  const LON_RES = (LON_RIGHT - LON_LEFT) / COLS;

  // ---------- buffers ----------
  const density = new Float32Array(ROWS * COLS);     // current (projected for year)
  const baseline = new Float32Array(ROWS * COLS);    // today's baseline (2025), immutable after init
  const drowned = new Float32Array(ROWS * COLS);
  const regionId = new Uint8Array(ROWS * COLS);      // per-cell region index for growth multiplier
  // Per-cell "minimum coastal-vulnerability elevation". Cells inherit min elev of nearby coastal cities.
  const cellElev = new Float32Array(ROWS * COLS); cellElev.fill(99999);

  // ---------- helpers ----------
  function latToRow(lat) { return (LAT_TOP - lat) / LAT_RES; }
  function lonToCol(lon) { return (lon - LON_LEFT) / LON_RES; }

  function stamp(out, lat, lon, mass, sigma) {
    // Gaussian stamp in (lat,lon) space (degrees). Cuts off at 3σ.
    const r = sigma * 3;
    const i0 = Math.max(0, Math.floor(latToRow(lat + r)));
    const i1 = Math.min(ROWS - 1, Math.ceil(latToRow(lat - r)));
    const j0 = Math.max(0, Math.floor(lonToCol(lon - r)));
    const j1 = Math.min(COLS - 1, Math.ceil(lonToCol(lon + r)));
    const inv2s2 = 1 / (2 * sigma * sigma);
    for (let i = i0; i <= i1; i++) {
      const cellLat = LAT_TOP - (i + 0.5) * LAT_RES;
      const dlat = cellLat - lat;
      for (let j = j0; j <= j1; j++) {
        const cellLon = LON_LEFT + (j + 0.5) * LON_RES;
        const dlon = cellLon - lon;
        const w = Math.exp(-(dlat * dlat + dlon * dlon) * inv2s2);
        out[i * COLS + j] += mass * w;
      }
    }
  }

  function stampCoastalElev(lat, lon, elev, sigma) {
    // Lower cellElev within sigma*2 radius of a coastal city to its elevation.
    const r = sigma * 2;
    const i0 = Math.max(0, Math.floor(latToRow(lat + r)));
    const i1 = Math.min(ROWS - 1, Math.ceil(latToRow(lat - r)));
    const j0 = Math.max(0, Math.floor(lonToCol(lon - r)));
    const j1 = Math.min(COLS - 1, Math.ceil(lonToCol(lon + r)));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const idx = i * COLS + j;
        if (elev < cellElev[idx]) cellElev[idx] = elev;
      }
    }
  }

  // ---------- build density grid ----------
  const cities = window.CITIES;
  const rural = window.RURAL;
  const landSeeds = window.LAND_SEEDS || [];
  const CITY_SIGMA  = 0.45;   // sharper peaks
  const RURAL_SIGMA_K = 1.0;
  const LAND_SIGMA = 2.0;     // broad baseline gaussians for landmass

  // City peaks (sharp, dramatic)
  for (const c of cities) {
    stamp(density, c.lat, c.lon, c.pop, CITY_SIGMA);
    if (c.coast) stampCoastalElev(c.lat, c.lon, c.elev, CITY_SIGMA * 2.5);
  }
  // Existing rural points (broader, established regions)
  for (const r of rural) {
    const lat = r[0], lon = r[1], sigma = r[2] * RURAL_SIGMA_K, mass = r[3] / 30;
    stamp(density, lat, lon, mass, sigma);
  }
  // Land-seed baseline (every land cell gets some baseline density)
  // Each seed: [lat, lon, level] where level 1-9 maps to mass 0.15..1.6 (rural countryside)
  // Apply a deterministic per-seed jitter so the seeds don't fall on a perfect
  // grid — otherwise sparse regions like Siberia show ugly vertical bands where
  // seeds share longitude values.
  let _ls_seed = 1234567;
  function _ls_rand() {
    _ls_seed = (_ls_seed * 1103515245 + 12345) >>> 0;
    return ((_ls_seed >>> 8) / 0xffffff) - 0.5;  // [-0.5, 0.5)
  }
  for (const s of landSeeds) {
    const jitterLat = _ls_rand() * 1.6;
    const jitterLon = _ls_rand() * 1.6;
    const lat = s[0] + jitterLat;
    const lon = s[1] + jitterLon;
    const level = s[2];
    const mass = 0.12 + level * 0.18; // 1→0.30, 5→1.02, 9→1.74
    stamp(density, lat, lon, mass, LAND_SIGMA);
  }

  // Coastal rural baseline elevation: for any rural point near a coastal city box (low elev),
  // we don't need to lower its cell-elev separately — we already lowered it via city stamp.
  // But for purely coastal rural strips (deltas etc.), we add a few synthetic low-elev seeds.
  const COAST_SEEDS = [
    // [lat, lon, elev, sigma] — bands of coastal lowland with no megacity above
    [23, 89, 3, 1.4],  // Bangladesh delta
    [25, 90, 3, 1.4],
    [22, 91, 3, 1.0],
    [10, 105, 3, 1.4], // Mekong delta
    [10, 107, 4, 1.0],
    [-7, 110, 4, 1.4], // Java N coast
    [-6, 107, 4, 1.0],
    [-7, 113, 4, 1.0],
    [32, 121, 4, 1.0], // Yangtze
    [37, 119, 4, 1.0], // Bohai
    [40, 121, 5, 0.8],
    [-5, 39, 6, 0.8],
    [5, 100, 6, 1.0],  // Malay peninsula
    [3, 102, 6, 0.8],
    [30, -89, 3, 1.0], // Mississippi delta
    [29, -94, 4, 0.8], // TX coast
    [27, -82, 3, 1.0], // FL Gulf
    [29, -82, 3, 1.0], // FL Atlantic
    [33, -78, 4, 0.8], // Carolinas
    [36, -76, 5, 0.6],
    [29, 49, 5, 0.8],  // Arabian Gulf
    [25, 51, 5, 0.6],  // Qatar
    [52, 5, 1, 1.0],   // Netherlands
    [53, 9, 4, 0.7],
    [55, 12, 5, 0.6],
    [60, 25, 4, 0.8],  // Baltic
    [54, -1, 5, 0.8],  // UK East coast
    [44, 12, 3, 0.7],  // Po valley
    [45, 13, 4, 0.5],
    [-25, -48, 4, 0.7],
    [-22, -41, 4, 0.7],
    [-8, -35, 5, 0.7],
    [16, 82, 4, 0.8],  // E India
    [11, 79, 5, 0.6],  // E India Tamil
    [21, -89, 4, 0.8], // Yucatán
    [16, -89, 5, 0.6],
    [-4, -78, 4, 1.0], // Amazon
    [10, -75, 5, 0.7], // N Colombia
    [-34, -57, 6, 0.5], // Rio de la Plata
    [-31, -58, 8, 0.4],
    [31, 30, 4, 1.0],  // Nile delta
    [33, 35, 5, 0.5],  // Levant
    [40, 28, 5, 0.5],  // Sea of Marmara
    [13, 100, 2, 0.8], // gulf of Thailand
    [22, 113, 6, 0.6], // Pearl river
  ];
  for (const s of COAST_SEEDS) {
    stampCoastalElev(s[0], s[1], s[2], s[3]);
  }

  // ---------- region detection + baseline snapshot ----------
  // Assign each cell a region ID based on lat/lon. Used to apply year-based
  // population growth/decline factors. 0 = unknown/ocean.
  // Regions (UN-WPP grouping, with deep-future speculation past 2300):
  const REGION = {
    OCEAN:       0,
    AFRICA_SS:   1, // Sub-Saharan Africa (highest growth)
    AFRICA_N_ME: 2, // North Africa + Mid East
    EUROPE:      3, // Europe + UK
    RUSSIA:      4, // Russia + Belarus + Ukraine + C Asia stans
    E_ASIA:      5, // China, Japan, Korea, Mongolia (declining hard)
    S_ASIA:      6, // India, Pakistan, Bangladesh, Sri Lanka, Nepal
    SE_ASIA:     7, // SE Asia + Indonesia + Philippines
    N_AMERICA:   8, // US + Canada
    C_AMERICA:   9, // Mexico + C America + Caribbean
    S_AMERICA:  10, // South America
    OCEANIA:    11, // Australia + NZ + PNG
  };
  const REGION_NAMES = ['ocean','africa_ss','africa_n_me','europe','russia','e_asia','s_asia','se_asia','n_america','c_america','s_america','oceania'];

  function regionOf(lat, lon) {
    // Order matters: more specific first
    // Sub-Saharan Africa (south of Sahara, west of Indian Ocean, east of Atlantic, north of S Africa)
    if (lat >= -36 && lat <= 18 && lon >= -20 && lon <= 52) return REGION.AFRICA_SS;
    // North Africa + Middle East
    if (lat >= 12 && lat <= 38 && lon >= -20 && lon <= 65) return REGION.AFRICA_N_ME;
    // Europe (incl. UK + Iceland)
    if (lat >= 35 && lat <= 72 && lon >= -25 && lon <= 45) return REGION.EUROPE;
    // Russia / Central Asia
    if (lat >= 40 && lon >= 30 && lon <= 180) return REGION.RUSSIA;
    // E Asia
    if (lat >= 18 && lat <= 55 && lon >= 95 && lon <= 150) return REGION.E_ASIA;
    // S Asia
    if (lat >= 5 && lat <= 38 && lon >= 60 && lon <= 95) return REGION.S_ASIA;
    // SE Asia + Indonesia + Philippines
    if (lat >= -12 && lat <= 28 && lon >= 92 && lon <= 145) return REGION.SE_ASIA;
    // N America
    if (lat >= 25 && lat <= 72 && lon >= -170 && lon <= -55) return REGION.N_AMERICA;
    // Greenland (treated as Europe demographically)
    if (lat >= 58 && lon >= -75 && lon <= -10) return REGION.EUROPE;
    // C America + Caribbean
    if (lat >= 7 && lat <= 25 && lon >= -120 && lon <= -55) return REGION.C_AMERICA;
    // S America
    if (lat >= -56 && lat <= 13 && lon >= -85 && lon <= -33) return REGION.S_AMERICA;
    // Oceania
    if (lat >= -50 && lat <= 0 && lon >= 110 && lon <= 180) return REGION.OCEANIA;
    return REGION.OCEAN;
  }

  for (let i = 0; i < ROWS; i++) {
    const cellLat = LAT_TOP - (i + 0.5) * LAT_RES;
    for (let j = 0; j < COLS; j++) {
      const cellLon = LON_LEFT + (j + 0.5) * LON_RES;
      regionId[i * COLS + j] = regionOf(cellLat, cellLon);
    }
  }

  // Snapshot baseline (today's pop). All future projections multiply this.
  baseline.set(density);

  // Growth scenarios per region (multiplier vs. 2025), interpolated linearly.
  // Combines UN WPP-2024 (to 2100) + speculative climate-impacted projections beyond.
  const GROWTH = {
    [REGION.AFRICA_SS]:   [[2025,1],[2050,1.55],[2100,2.30],[2200,2.40],[2400,1.60],[2700,0.80],[3500,0.30],[5000,0.10],[12000,0.04],[25000,0.02]],
    [REGION.AFRICA_N_ME]: [[2025,1],[2050,1.20],[2100,1.40],[2200,1.10],[2400,0.70],[2700,0.40],[3500,0.15],[5000,0.05],[12000,0.02],[25000,0.01]],
    [REGION.EUROPE]:      [[2025,1],[2050,0.97],[2100,0.88],[2200,0.62],[2400,0.42],[2700,0.28],[3500,0.12],[5000,0.05],[12000,0.02],[25000,0.01]],
    [REGION.RUSSIA]:      [[2025,1],[2050,0.92],[2100,0.78],[2200,0.52],[2400,0.34],[2700,0.22],[3500,0.10],[5000,0.04],[12000,0.02],[25000,0.01]],
    [REGION.E_ASIA]:      [[2025,1],[2050,0.85],[2100,0.55],[2200,0.38],[2400,0.28],[2700,0.18],[3500,0.08],[5000,0.03],[12000,0.01],[25000,0.01]],
    [REGION.S_ASIA]:      [[2025,1],[2050,1.12],[2100,1.22],[2200,1.00],[2400,0.70],[2700,0.45],[3500,0.20],[5000,0.08],[12000,0.03],[25000,0.01]],
    [REGION.SE_ASIA]:     [[2025,1],[2050,1.10],[2100,1.18],[2200,0.92],[2400,0.62],[2700,0.38],[3500,0.16],[5000,0.06],[12000,0.02],[25000,0.01]],
    [REGION.N_AMERICA]:   [[2025,1],[2050,1.10],[2100,1.20],[2200,1.05],[2400,0.78],[2700,0.55],[3500,0.22],[5000,0.08],[12000,0.03],[25000,0.01]],
    [REGION.C_AMERICA]:   [[2025,1],[2050,1.18],[2100,1.30],[2200,1.10],[2400,0.75],[2700,0.48],[3500,0.20],[5000,0.07],[12000,0.03],[25000,0.01]],
    [REGION.S_AMERICA]:   [[2025,1],[2050,1.08],[2100,1.12],[2200,0.88],[2400,0.58],[2700,0.38],[3500,0.15],[5000,0.06],[12000,0.02],[25000,0.01]],
    [REGION.OCEANIA]:     [[2025,1],[2050,1.10],[2100,1.18],[2200,0.95],[2400,0.65],[2700,0.42],[3500,0.18],[5000,0.07],[12000,0.03],[25000,0.01]],
    [REGION.OCEAN]:       [[2025,1],[25000,1]],
  };

  function growthFor(regionIdx, year) {
    const table = GROWTH[regionIdx];
    if (!table) return 1;
    if (year <= table[0][0]) return table[0][1];
    for (let i = 0; i < table.length - 1; i++) {
      const [y0, v0] = table[i], [y1, v1] = table[i+1];
      if (year <= y1) {
        const t = (year - y0) / (y1 - y0);
        return v0 + (v1 - v0) * t;
      }
    }
    return table[table.length - 1][1];
  }

  // Projected density = baseline * growthByRegion[year]. Recomputed when year changes.
  let lastProjectedYear = -1;
  function projectFor(year) {
    if (year === lastProjectedYear) return;
    lastProjectedYear = year;
    // Build per-region multiplier array
    const mult = new Float32Array(12);
    for (let r = 0; r < 12; r++) mult[r] = growthFor(r, year);
    for (let idx = 0; idx < density.length; idx++) {
      density[idx] = baseline[idx] * mult[regionId[idx]];
    }
  }

  // ---------- drowned grid (depends on SLR) ----------
  let totalPop = 0;
  // Compute total pop = sum(density). We use the density grid sum as a proxy (since stamps don't perfectly conserve mass, this is internally consistent).
  for (let i = 0; i < density.length; i++) totalPop += density[i];

  function updateDrowned(slr) {
    drowned.fill(0);
    if (slr <= 0.01) return 0;
    // Per-cell drown: f(cellElev, slr) on every cell with stamped coastal elevation.
    // This naturally produces a multi-row red band around each drowning coast, because
    // cellElev was stamped with a gaussian radius around each coastal city / delta.
    for (let idx = 0; idx < density.length; idx++) {
      const effE = Math.max(0, cellElev[idx]);
      if (effE > slr) continue;
      const t = Math.min(1, (slr - effE) / 2 + 0.4);
      if (t > 0) drowned[idx] = density[idx] * t;
    }
    return tallyDrowned();
  }

  function tallyDrowned() {
    let sumDrowned = 0;
    for (let i = 0; i < drowned.length; i++) sumDrowned += drowned[i];
    return sumDrowned;
  }

  // ---------- city drown state ----------
  function citiesDrowned(slr) {
    const list = [];
    for (const c of cities) {
      if (c.coast && c.elev <= slr) list.push(c);
    }
    return list;
  }

  // ---------- rendering ----------
  let DPR = 1, W = 1, H = 1;
  let plotX = 0, plotY = 0, plotW = 1, plotH = 1;
  // plot area inside canvas (leave room for HUD)
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width  = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Lock plot aspect ratio to the world's longitude:latitude window
    // (360 / 130 ≈ 2.77). Compute the largest plot that fits inside the HUD
    // margins while preserving this ratio. Center horizontally; sit near the
    // top vertically so the Water Table panel below has room.
    const aspect = (LON_RIGHT - LON_LEFT) / (LAT_TOP - LAT_BOTTOM); // ≈ 2.77
    const TOP_MARGIN    = 84;   // brand row + axis labels
    const BOTTOM_MARGIN = 150;  // water table panel + axis labels
    const SIDE_MARGIN   = 70;   // axis labels left/right
    const maxW = W - 2 * SIDE_MARGIN;
    const maxH = H - TOP_MARGIN - BOTTOM_MARGIN;
    if (maxW / aspect <= maxH) {
      plotW = maxW;
      plotH = maxW / aspect;
    } else {
      plotH = maxH;
      plotW = maxH * aspect;
    }
    plotX = Math.round((W - plotW) / 2);
    plotY = TOP_MARGIN + Math.max(0, (maxH - plotH) / 2);
    render();
  }

  // Pre-build per-row peak normalisation cache? Not needed; we use a global scale.
  // Determine a reasonable peak scale by finding p99 of density values.
  function percentile(arr, p) {
    // sample-based percentile (fast).
    const N = 4000;
    const samples = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      samples[k] = arr[(Math.random() * arr.length) | 0];
    }
    samples.sort();
    return samples[Math.floor(N * p)];
  }
  const PEAK_REF = (() => {
    // Take max value as reference; we want max ridge to fit comfortably.
    let m = 0;
    for (let i = 0; i < density.length; i++) if (density[i] > m) m = density[i];
    return m;
  })();

  // Render
  let lastSLR = -1;
  let lastDrownedTotal = 0;

  // Label cities that have label=1 (manually chosen anchors), sorted by lon to keep order.
  const ANCHOR_CITIES = cities.filter(c => c.label).sort((a, b) => a.lon - b.lon);

  function bgFill() {
    // subtle gradient over plot — top slightly bluer, bottom blacker
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#080a10');
    g.addColorStop(0.6, '#06070a');
    g.addColorStop(1, '#04050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function gridGuide() {
    ctx.save();
    ctx.strokeStyle = 'rgba(232,224,198,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 0; g <= 12; g++) {
      const x = plotX + (g / 12) * plotW;
      ctx.moveTo(x, plotY - 20);
      ctx.lineTo(x, plotY + plotH + 20);
    }
    ctx.stroke();
    ctx.restore();

    // horizontal guide at equator + 30N/S
    ctx.save();
    ctx.strokeStyle = 'rgba(232,224,198,0.32)';
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    const lats = [60, 30, 0, -30];
    for (const l of lats) {
      const y = plotY + ((LAT_TOP - l) / (LAT_TOP - LAT_BOTTOM)) * plotH;
      ctx.beginPath(); ctx.moveTo(plotX - 30, y); ctx.lineTo(plotX + plotW + 30, y); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- GeoJSON world outline overlay ----------
  function projLonLat(lon, lat) {
    return [
      plotX + (lon - LON_LEFT) / (LON_RIGHT - LON_LEFT) * plotW,
      plotY + (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM) * plotH,
    ];
  }
  function drawWorldOutline() {
    const geo = window.WORLD_GEOJSON;
    if (!geo || !geo.features) return;
    ctx.save();
    // Clip strictly to the joyplot's plot rectangle so coastlines outside the
    // displayed lat range (e.g. Antarctica below LAT_BOTTOM) are cut off and
    // can't drift above/below the ridges.
    ctx.beginPath();
    ctx.rect(plotX, plotY, plotW, plotH);
    ctx.clip();
    ctx.strokeStyle = 'rgba(232,224,198,0.42)';
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const f of geo.features) {
      const g = f.geometry;
      if (!g) continue;
      const rings = g.type === 'Polygon' ? g.coordinates
                  : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
      for (const ring of rings) {
        if (!ring || ring.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [lon, lat] = ring[i];
          const [x, y] = projLonLat(lon, lat);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function pickWater() {
    const root = getComputedStyle(document.documentElement);
    return {
      water:    root.getPropertyValue('--water').trim()    || '#e53e2a',
      waterHi:  root.getPropertyValue('--water-hi').trim() || '#ff6a4d',
      waterDeep:root.getPropertyValue('--water-deep').trim()|| '#7a1410',
      ink:      root.getPropertyValue('--ink').trim()      || '#e8e0c6',
      amber:    root.getPropertyValue('--amber').trim()    || '#f3a838',
      dim:      root.getPropertyValue('--ink-dim').trim()  || '#8a8268',
    };
  }

  function render(slr = lastSLR) {
    if (slr < 0) slr = parseFloat(document.getElementById('slr').value) || 0;
    lastSLR = slr;
    const year = slrToYear(slr);
    projectFor(year);                    // mutate `density` for this year
    const drownedTotal = updateDrowned(slr);
    lastDrownedTotal = drownedTotal;

    bgFill();

    const colors = pickWater();
    const rowH = plotH / ROWS;
    // peak scaling — sharper peaks reaching ~80 row-heights tall for the biggest city.
    const SCALE = (rowH * 80) / PEAK_REF;

    // Pre-compute scaled-y arrays for performance
    const xs = new Float32Array(COLS);
    for (let j = 0; j < COLS; j++) xs[j] = plotX + (j + 0.5) / COLS * plotW;

    // Draw rows from top (north) to bottom (south). Each row:
    //   1) bg-fill polygon below current curve (masks earlier ridges visible underneath this curve)
    //   2) drowned fill polygon (water color) under drowned curve
    //   3) thin stroke for total-density curve
    const bgGrad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
    bgGrad.addColorStop(0, '#070810');
    bgGrad.addColorStop(1, '#040508');

    const peaksY = new Float32Array(COLS);
    const drownY = new Float32Array(COLS);

    for (let i = 0; i < ROWS; i++) {
      const baseY = plotY + (i + 1) * rowH;
      const rowOff = i * COLS;
      const minTop = baseY - rowH * 1.05; // bg-fill always extends up by ~1 row to mask previous baselines

      // build curves
      let rowHasInk = false;
      for (let j = 0; j < COLS; j++) {
        const v = density[rowOff + j];
        const py = baseY - v * SCALE;
        peaksY[j] = py;
        if (py < baseY - 0.6) rowHasInk = true;
        const d = drowned[rowOff + j];
        drownY[j] = baseY - d * SCALE;
      }

      // 1) mask below density curve in bg color — extend polygon top to ≥ minTop
      //    so flat-baseline rows still cover previous rows' baselines.
      ctx.beginPath();
      ctx.moveTo(xs[0], baseY + 1);
      for (let j = 0; j < COLS; j++) {
        ctx.lineTo(xs[j], Math.min(peaksY[j], minTop));
      }
      ctx.lineTo(xs[COLS - 1], baseY + 1);
      ctx.closePath();
      ctx.fillStyle = bgGrad;
      ctx.fill();

      // 2) drowned mask — we no longer fill polygons. Instead the stroke pass
      //    below uses the `drowned` grid to switch ridge color from bone to
      //    water-red wherever the cell is submerged. We just record per-row
      //    whether anything in this row is drowned (for the HUD highlight).
      let rowMaxDrown = 0;
      for (let j = 0; j < COLS; j++) {
        const d = drowned[rowOff + j];
        if (d > rowMaxDrown) rowMaxDrown = d;
      }

      // 3) outline stroke of density curve. Two-stage rendering:
      //    a) Tiered WHITE ridge stroke (graduated fade for low-density tails)
      //    b) RED overlay with per-cell alpha = drown fraction, drawn ON TOP.
      //       The overlay uses multiple alpha buckets so the transition between
      //       safe (white) and drowned (red) fades smoothly, not as a hard edge.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const tiers = [
        { thr: 0.003, alpha: 0.32, width: 0.7 },
        { thr: 0.05,  alpha: 0.55, width: 0.8 },
        { thr: 0.4,   alpha: 0.95, width: 0.95 },
      ];
      const inkBase = '236,228,206';
      const waterRGB = (() => {
        const h = colors.waterHi.replace('#','');
        if (h.length !== 6) return '255,106,77';
        return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
      })();

      // --- (a) white ridge tiers ---
      for (const tier of tiers) {
        ctx.beginPath();
        let inSeg = false;
        for (let j = 0; j < COLS; j++) {
          const v = density[rowOff + j];
          if (v > tier.thr) {
            if (!inSeg) { ctx.moveTo(xs[j], peaksY[j]); inSeg = true; }
            else        { ctx.lineTo(xs[j], peaksY[j]); }
          } else if (inSeg) {
            inSeg = false;
          }
        }
        ctx.lineWidth = tier.width;
        ctx.strokeStyle = `rgba(${inkBase},${tier.alpha})`;
        ctx.stroke();
      }

      // --- (b) red overlay with per-cell alpha buckets for white→red gradient ---
      if (rowMaxDrown > 0.005) {
        // 6 alpha buckets. Each cell's drown fraction (drowned/density) decides which
        // bucket it falls in; we stroke all cells in each bucket as a polyline with
        // that bucket's alpha. Stacking creates a smooth gradient instead of a hard
        // boundary between white and red.
        const BUCKETS = [0.10, 0.25, 0.42, 0.60, 0.78, 0.95];
        // Pre-compute drown fraction per cell for this row.
        const fracs = new Float32Array(COLS);
        for (let j = 0; j < COLS; j++) {
          const v = density[rowOff + j];
          const d = drowned[rowOff + j];
          fracs[j] = (v > 0.02 && d > 0) ? Math.min(1, d / v) : 0;
        }
        for (let b = 0; b < BUCKETS.length; b++) {
          const alpha = BUCKETS[b];
          // This bucket fires for any cell whose drown frac is >= alpha threshold.
          // Stacking N buckets at alpha values a1..aN gives effective opacity:
          //   1 - prod(1 - ai) for cells above each threshold.
          // With BUCKETS as above, that produces ~smooth 0→1 ramp.
          ctx.beginPath();
          let inSeg = false;
          for (let j = 0; j < COLS; j++) {
            const v = density[rowOff + j];
            const want = v > 0.02 && fracs[j] >= alpha - 0.02;
            if (want) {
              if (!inSeg) { ctx.moveTo(xs[j], peaksY[j]); inSeg = true; }
              else        { ctx.lineTo(xs[j], peaksY[j]); }
            } else if (inSeg) {
              inSeg = false;
            }
          }
          // Each bucket stroke uses a base alpha that's slightly less than 1 so
          // stacking yields smooth steps. The bottom bucket (alpha=0.10) is
          // drawn very faintly; the top (0.95) is drawn near-opaque.
          ctx.lineWidth = 0.95;
          ctx.strokeStyle = `rgba(${waterRGB},${0.18 + b * 0.07})`;
          ctx.stroke();
        }
      }

    }

    // ---------- world coastline outline overlay (drawn on top of ridges) ----------
    if (window.FLOOD_TWEAKS && window.FLOOD_TWEAKS.worldOutline) drawWorldOutline();

    // ---------- lat / lon grid (drawn on top of ridges so it stays visible) ----------
    if (window.FLOOD_TWEAKS && window.FLOOD_TWEAKS.latGrid) gridGuide();

    // ---------- coastal halo: red glow under each drowning coastal city ----------
    if (window.FLOOD_TWEAKS && window.FLOOD_TWEAKS.coastalHalo) drawCoastalHalo(slr, rowH, colors);

    // ---------- city labels ----------
    if (!window.FLOOD_TWEAKS || window.FLOOD_TWEAKS.labels !== false) {
      drawLabels(colors, SCALE, rowH, slr);
    }
  }

  function drawCoastalHalo(slr, rowH, colors) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const waterHi = colors.waterHi || '#ff6a4d';
    for (const c of cities) {
      if (!c.coast || c.elev > slr) continue;
      const row = (LAT_TOP - c.lat) / LAT_RES;
      const baseY = plotY + (row + 1) * rowH;
      const col = (c.lon - LON_LEFT) / LON_RES;
      const x = plotX + (col + 0.5) / COLS * plotW;
      // Halo size scales softly with city population.
      const radius = 24 + Math.min(28, c.pop * 0.9);
      const h = waterHi.replace('#','');
      const rgb = `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
      const grad = ctx.createRadialGradient(x, baseY, 0, x, baseY, radius);
      grad.addColorStop(0,   `rgba(${rgb},0.50)`);
      grad.addColorStop(0.4, `rgba(${rgb},0.20)`);
      grad.addColorStop(1,   `rgba(${rgb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x - radius, baseY - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }

  function drawLabels(colors, SCALE, rowH, slr) {
    // Refresh hover index for every city — not just the labelled ones.
    clearCityProjections();
    for (const c of cities) {
      const row = (LAT_TOP - c.lat) / LAT_RES;
      const baseY = plotY + (row + 1) * rowH;
      const col = (c.lon - LON_LEFT) / LON_RES;
      const x = plotX + (col + 0.5) / COLS * plotW;
      const ri = Math.max(0, Math.min(ROWS - 1, Math.floor(row)));
      const ci = Math.max(0, Math.min(COLS - 1, Math.floor(col)));
      const v = density[ri * COLS + ci] + c.pop * 0.15;
      const peakY = baseY - v * SCALE;
      pushCityProjection(c, x, baseY, peakY);
    }
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '500 10.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

    // First, compute screen positions for all anchor cities + a controlled subset of currently-drowned coastal cities.
    const isDrownedC = (c) => c.coast && Math.max(0.3, c.elev) <= slr;
    const wanted = new Set(ANCHOR_CITIES.map(c => c.name));
    // Add drowned non-anchor cities, only if not too close (in lat/lon) to an already-labeled city.
    const tooClose = (c, others) => others.some(o =>
      Math.abs(o.lat - c.lat) < 3 && Math.abs(o.lon - c.lon) < 4
    );
    const drownedExtras = [];
    const sortedByPop = cities
      .filter(c => isDrownedC(c) && !wanted.has(c.name))
      .sort((a, b) => b.pop - a.pop);
    for (const c of sortedByPop) {
      if (drownedExtras.length >= 6) break;
      if (tooClose(c, ANCHOR_CITIES.concat(drownedExtras))) continue;
      drownedExtras.push(c);
    }
    const labelSet = ANCHOR_CITIES.concat(drownedExtras);

    // Compute layout entries
    const entries = labelSet.map(c => {
      const row = (LAT_TOP - c.lat) / LAT_RES;
      const baseY = plotY + (row + 1) * rowH;
      const col = (c.lon - LON_LEFT) / LON_RES;
      const x = plotX + (col + 0.5) / COLS * plotW;
      const ri = Math.max(0, Math.min(ROWS - 1, Math.floor(row)));
      const ci = Math.max(0, Math.min(COLS - 1, Math.floor(col)));
      let v = density[ri * COLS + ci];
      v += c.pop * 0.18;
      const peakY = baseY - v * SCALE;
      const isDrowned = isDrownedC(c);
      return { c, x, peakY, baseY, isDrowned };
    });

    // Sort by x for collision pass
    entries.sort((a, b) => a.x - b.x);

    // Assign label Y positions with collision avoidance.
    // Default labelY is above the peak. If too close to previous, push higher.
    const measured = entries.map(e => {
      const name = e.c.name.toUpperCase();
      return { ...e, name, tw: ctx.measureText(name + (e.isDrowned ? '  ✕' : '')).width };
    });

    const placed = [];
    for (const m of measured) {
      let y = m.peakY - 22;
      // clamp: don't allow labels above plot top or shooting too high
      const minY = plotY + 8;
      if (y < minY) y = minY;
      // Find collisions
      const myL = m.x + 3, myR = myL + m.tw + 8;
      let bumps = 0;
      let collision = true;
      while (collision && bumps < 14) {
        collision = false;
        for (const p of placed) {
          const pL = p.x + 3, pR = pL + p.tw + 8;
          const xOverlap = !(myR < pL - 4 || myL > pR + 4);
          const yOverlap = Math.abs(p.labelY - y) < 14;
          if (xOverlap && yOverlap) {
            // try going down first, then up
            y = (bumps % 2 === 0) ? p.labelY + 14 : p.labelY - 14;
            if (y < minY) y = minY;
            collision = true; bumps++; break;
          }
        }
      }
      // if we still collide after bumps, just stack above last collision
      m.labelY = y;
      placed.push(m);
    }

    // Draw — pin first (under labels)
    for (const m of placed) {
      const colour = m.isDrowned ? colors.waterHi : colors.amber;
      ctx.strokeStyle = colour;
      ctx.lineWidth = m.isDrowned ? 1.3 : 0.9;
      ctx.globalAlpha = m.isDrowned ? 1 : 0.85;
      ctx.beginPath();
      ctx.moveTo(m.x, m.labelY + 6);
      ctx.lineTo(m.x, m.baseY);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    for (const m of placed) {
      const colour = m.isDrowned ? colors.waterHi : colors.amber;
      const text = m.isDrowned ? `${m.name}  ✕` : m.name;
      const padX = 5;
      // Dark chip behind name — keeps labels readable on top of dense joyplot ridges.
      ctx.fillStyle = 'rgba(6,7,10,0.82)';
      ctx.fillRect(m.x + 3, m.labelY - 7, m.tw + padX * 2, 13);
      // Drowned cities get a thin red border around the chip.
      if (m.isDrowned) {
        ctx.strokeStyle = colors.waterHi;
        ctx.lineWidth = 1;
        ctx.strokeRect(m.x + 3, m.labelY - 7, m.tw + padX * 2, 13);
      }
      ctx.fillStyle = colour;
      ctx.fillText(text, m.x + 3 + padX, m.labelY);
    }
    ctx.restore();
  }

  // ---------- year mapping ----------
  // SLR thresholds calibrated to mainstream climate science:
  //   IPCC AR6: ~0.5-1m by 2100 (SSP5-8.5 worst case)
  //   AR6 multi-millennial: ~2-3m per °C of sustained warming
  //   WAIS+GIS full collapse: ~3000-5000 years
  //   East Antarctic (53m equivalent) melt: tens of thousands of years
  //   ~65-70m: every drop of polar ice gone — committed under sustained ≥5°C warming.
  function slrToYear(slr) {
    const pts = [
      [0,    2025],
      [0.3,  2055],
      [1,    2100],
      [2,    2200],
      [5,    2400],
      [10,   2700],
      [20,   3500],
      [30,   5000],
      [50,   12000],
      [70,   25000],
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      if (slr >= pts[i][0] && slr <= pts[i+1][0]) {
        const t = (slr - pts[i][0]) / (pts[i+1][0] - pts[i][0]);
        return Math.round(pts[i][1] + t * (pts[i+1][1] - pts[i][1]));
      }
    }
    return pts[pts.length - 1][1];
  }

  // ---------- HUD update ----------
  const slrEl   = document.getElementById('slr');
  const slrVal  = document.getElementById('slr-val');
  const yearTag = document.getElementById('year-tag');
  const dispEl  = document.getElementById('displaced');
  const dispBar = document.getElementById('displaced-bar');
  const lostEl  = document.getElementById('cities-lost');
  const totEl   = document.getElementById('cities-total');
  const remEl   = document.getElementById('remaining');
  const tsEl    = document.getElementById('timestamp');

  // Count total coastal megacities (those that can drown)
  const TOTAL_AT_RISK = cities.filter(c => c.coast).length;
  totEl.textContent = String(TOTAL_AT_RISK);

  // World scale derived from baseline grid sum so all stats (cities + rural + seeds)
  // align to a real 8.128 B headcount.
  let baselineGridSum = 0;
  for (let idx = 0; idx < baseline.length; idx++) baselineGridSum += baseline[idx];
  const WORLD_SCALE = 8128 / baselineGridSum;

  // Per-region baseline totals (used for projected world population at year Y).
  const REGION_TOTAL = new Float32Array(12);
  for (let idx = 0; idx < baseline.length; idx++) {
    REGION_TOTAL[regionId[idx]] += baseline[idx];
  }

  function projectedWorldPopM(year) {
    let s = 0;
    for (let r = 0; r < 12; r++) s += REGION_TOTAL[r] * growthFor(r, year);
    return s * WORLD_SCALE;
  }

  // Per-city region cache for displaced calculations.
  const CITY_REGION = cities.map(c => regionOf(c.lat, c.lon));

  function realDrowned(slr) {
    const year = slrToYear(slr);
    let s = 0;
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      if (!c.coast) continue;
      const effElev = Math.max(0, c.elev);
      const frac = Math.min(1.4, slr / (effElev * 0.9 + 1.6));
      // Apply regional growth factor — a city in growing Sub-Saharan Africa
      // displaces more people at the same SLR in 2150 than today.
      const g = growthFor(CITY_REGION[i], year);
      s += c.pop * frac * g;
    }
    // Coastal rural delta zones (Bangladesh, Mekong, etc.) with their own regional growth.
    const RURAL_DELTAS = [
      [4, 80, REGION.S_ASIA],    // Ganges-Brahmaputra
      [4, 30, REGION.SE_ASIA],   // Mekong
      [5, 35, REGION.SE_ASIA],   // Java
      [4, 20, REGION.E_ASIA],    // Yangtze lower
      [4, 18, REGION.E_ASIA],    // Bohai
      [5, 4,  REGION.C_AMERICA], // Yucatán
      [5, 15, REGION.S_ASIA],    // E India coast
      [4, 5,  REGION.N_AMERICA], // Mississippi delta
      [6, 3,  REGION.AFRICA_N_ME], // Arabian gulf
      [1, 8,  REGION.EUROPE],    // Netherlands
      [5, 3,  REGION.EUROPE],    // UK East coast
      [4, 6,  REGION.EUROPE],    // Po valley
      [4, 5,  REGION.S_AMERICA], // S Brazil coast
      [4, 4,  REGION.S_AMERICA], // SE Brazil
      [6, 4,  REGION.SE_ASIA],   // Malay peninsula
      [3, 30, REGION.AFRICA_N_ME], // Nile delta
      [4, 25, REGION.AFRICA_SS], // West Africa coast
    ];
    for (const d of RURAL_DELTAS) {
      const elev = d[0]; const pop = d[1]; const reg = d[2];
      const frac = Math.min(1.3, slr / (elev * 0.9 + 1.6));
      s += pop * frac * growthFor(reg, year);
    }
    return s;
  }

  // Animated number tween
  let displayedDisp = 0, displayedRem = 8128;
  let displayedLost = 0;
  let dispTarget = 0, remTarget = 8128, lostTarget = 0;
  let worldPopTarget = 8128;

  function setHud(slr) {
    slrVal.textContent = slr.toFixed(1);
    const year = slrToYear(slr);
    yearTag.textContent = year;

    dispTarget = realDrowned(slr);
    worldPopTarget = projectedWorldPopM(year);
    remTarget = Math.max(0, worldPopTarget - dispTarget);
    lostTarget = cities.filter(c => c.coast && Math.max(0.3, c.elev) <= slr).length;
  }
  const dispUnit = document.getElementById('displaced-unit');
  const remUnit  = document.getElementById('remaining-unit');
  function tweenHud() {
    const k = 0.18;
    displayedDisp += (dispTarget - displayedDisp) * k;
    displayedRem  += (remTarget  - displayedRem)  * k;
    displayedLost += (lostTarget - displayedLost) * k;

    const fd = formatBig(displayedDisp);
    dispEl.textContent = fd.num;
    dispUnit.textContent = fd.unit;
    const fr = formatBig(displayedRem);
    remEl.textContent = fr.num;
    remUnit.textContent = fr.unit;
    lostEl.textContent = String(Math.round(displayedLost));

    const dispPct = worldPopTarget > 0 ? Math.min(100, 100 * dispTarget / worldPopTarget) : 0;
    dispBar.style.width = dispPct.toFixed(1) + '%';
    document.getElementById('cities-bar').style.width =
      ((lostTarget / TOTAL_AT_RISK) * 100).toFixed(1) + '%';

    requestAnimationFrame(tweenHud);
  }
  function formatBig(v) {
    if (v < 1) return { num: v.toFixed(2), unit: 'M' };
    if (v < 1000) return { num: v.toFixed(1), unit: 'M' };
    return { num: (v / 1000).toFixed(2), unit: 'B' };
  }

  // ---------- timestamp ----------
  function tickTime() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    tsEl.textContent = `${y}.${m}.${d} · ${hh}:${mm}:${ss} UTC`;
  }
  setInterval(tickTime, 1000); tickTime();

  // ---------- slider events ----------
  let scheduled = false;
  function onSlrChange() {
    const slr = parseFloat(slrEl.value);
    setHud(slr);
    updateChartMarker(slr);
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        render(slr);
      });
    }
  }
  slrEl.addEventListener('input', onSlrChange);

  // ---------- SLR vs year chart (Water Table panel background) ----------
  // Builds a translucent line chart that traces slr-vs-year on a log-x axis,
  // with a vertical marker showing the current slider position.
  const CHART_W = 200, CHART_H = 70;
  const YEAR_MIN = 2025, YEAR_MAX = 25000;
  const SLR_MAX = 70;
  const logSpan = Math.log(YEAR_MAX - YEAR_MIN + 1) - Math.log(1);
  function chartX(year) {
    return (Math.log(Math.max(1, year - YEAR_MIN + 1)) / logSpan) * CHART_W;
  }
  function chartY(slr) {
    return CHART_H - (slr / SLR_MAX) * CHART_H;
  }
  (function buildChart() {
    const line = document.getElementById('slr-chart-line');
    const fill = document.getElementById('slr-chart-fill');
    if (!line || !fill) return;
    let d = '';
    let dFill = '';
    for (let s = 0; s <= SLR_MAX; s += 0.4) {
      const y = chartY(s);
      const x = chartX(slrToYear(s));
      if (d === '') {
        d = `M${x.toFixed(2)},${y.toFixed(2)}`;
        dFill = `M${x.toFixed(2)},${CHART_H} L${x.toFixed(2)},${y.toFixed(2)}`;
      } else {
        d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
        dFill += ` L${x.toFixed(2)},${y.toFixed(2)}`;
      }
    }
    dFill += ` L${chartX(YEAR_MAX).toFixed(2)},${CHART_H} Z`;
    line.setAttribute('d', d);
    fill.setAttribute('d', dFill);
  })();

  function updateChartMarker(slr) {
    const marker = document.getElementById('slr-chart-marker');
    if (!marker) return;
    const x = chartX(slrToYear(slr));
    marker.setAttribute('x1', x);
    marker.setAttribute('x2', x);
  }

  // ---------- ticks ----------
  const ticksWrap = document.getElementById('ticks');
  if (ticksWrap) {
    ticksWrap.innerHTML = Array.from({length: 36}, () => '<i></i>').join('');
  }

  // ---------- auto-flood (inline button inside Water Table panel) ----------
  const autoBtn = document.getElementById('autoflood');
  let autoRaf = null;
  function startAuto() {
    if (autoRaf !== null) { cancelAnimationFrame(autoRaf); autoRaf = null; }
    autoBtn.classList.add('on');
    autoBtn.setAttribute('aria-pressed', 'true');
    autoBtn.querySelector('.play-icon').textContent = '■';
    autoBtn.querySelector('.play-label').textContent = 'STOP';
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000; last = now;
      // Base rate 1.5 m/s × autoSpeed multiplier. Slow(0.5)=0.75 m/s,
      // Mid(1)=1.5 m/s, Rush(4)=6 m/s — visibly different at each step.
      const mult = (window.FLOOD_TWEAKS && window.FLOOD_TWEAKS.autoSpeed) || 1;
      let v = parseFloat(slrEl.value) + dt * 1.5 * mult;
      if (v > 70) v = 0;
      slrEl.value = String(v);
      slrEl.dispatchEvent(new Event('input', { bubbles: true }));
      autoRaf = requestAnimationFrame(step);
    };
    autoRaf = requestAnimationFrame(step);
  }
  function stopAuto() {
    if (autoRaf) cancelAnimationFrame(autoRaf);
    autoRaf = null;
    autoBtn.classList.remove('on');
    autoBtn.setAttribute('aria-pressed', 'false');
    autoBtn.querySelector('.play-icon').textContent = '▶';
    autoBtn.querySelector('.play-label').textContent = 'AUTO';
  }
  if (autoBtn) {
    autoBtn.addEventListener('click', () => autoRaf ? stopAuto() : startAuto());
  }

  // ---------- hover tooltip ----------
  // Build a search index of every city + its projected canvas (x, y) at the moment
  // we draw it. Refreshed every render(). On mousemove we find the nearest city
  // within a small radius and show a fixed-position tooltip with its stats.
  const cityProjCache = [];
  function pushCityProjection(c, x, y, peakY) {
    cityProjCache.push({ c, x, y, peakY });
  }
  function clearCityProjections() { cityProjCache.length = 0; }

  const tooltip = document.createElement('div');
  tooltip.className = 'city-tip';
  tooltip.style.cssText = `
    position: fixed; z-index: 20; pointer-events: none;
    background: rgba(8,7,11,0.92);
    border: 1px solid rgba(243,168,56,0.55);
    padding: 10px 12px;
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5px; letter-spacing: 0.06em; color: #e8e0c6;
    min-width: 200px; opacity: 0;
    transition: opacity 0.12s ease;
    transform: translate(12px, -50%);
    box-shadow: 0 4px 24px rgba(0,0,0,0.6);
  `;
  tooltip.innerHTML = '';
  document.body.appendChild(tooltip);

  function fmtNum(n, digits) {
    if (digits === undefined) digits = 1;
    if (Math.abs(n) >= 100) return n.toFixed(0);
    return n.toFixed(digits);
  }
  function showTip(hit, mx, my) {
    const c = hit.c;
    const lat = c.lat;
    const lon = c.lon;
    const latStr = (Math.abs(lat).toFixed(2)) + '\u00b0' + (lat >= 0 ? 'N' : 'S');
    const lonStr = (Math.abs(lon).toFixed(2)) + '\u00b0' + (lon >= 0 ? 'E' : 'W');
    const slr = parseFloat(document.getElementById('slr').value || '0');
    const year = slrToYear(slr);
    // Projected population: city pop × region-growth multiplier at this year.
    const r = regionOf(c.lat, c.lon);
    const popMult = growthFor(r, year);
    const projPop = c.pop * popMult;
    // Effective elevation = original elevation minus current sea level rise.
    const effElev = c.elev - slr;
    const elevStr = (effElev < 0 ? '\u2212' + Math.abs(effElev).toFixed(1) : effElev.toFixed(1)) + ' m';
    const drowned = c.coast && c.elev <= slr;
    const status = drowned
      ? `<span style="color:var(--water-hi)">SUBMERGED &nbsp; &#10005;</span>`
      : (c.coast
          ? `<span style="color:#9be29b">COASTAL &nbsp; \u00b7 &nbsp; EXPOSED</span>`
          : `<span style="color:#9bc5e2">INLAND &nbsp; \u00b7 &nbsp; SAFE</span>`);
    const popColor = drowned ? 'var(--water-hi)' : (popMult < 0.5 ? '#d8b88c' : '#fff');
    const elevColor = effElev < 0 ? 'var(--water-hi)' : (effElev < 5 ? '#d8b88c' : '#fff');
    tooltip.innerHTML =
      // City name in the brand style — Space Grotesk, letter-spaced like the FLOOD title.
      `<div style="font-family:'Space Grotesk',system-ui,sans-serif;font-weight:500;font-size:20px;letter-spacing:0.18em;color:${drowned ? 'var(--water-hi)' : '#fff'};line-height:1;">${c.name.toUpperCase()}</div>` +
      // Lat / lon as a subtitle under the name.
      `<div style="font-size:9.5px;letter-spacing:0.22em;color:#6c6450;margin-top:5px;margin-bottom:10px;">${latStr} &nbsp; \u00b7 &nbsp; ${lonStr}</div>` +
      `<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 14px;line-height:1.4;">` +
        `<span style="color:#6c6450;">POP</span><span style="color:${popColor};">${fmtNum(projPop, 1)} M &nbsp; <span style="color:#6c6450;font-size:9.5px;">(${year})</span></span>` +
        `<span style="color:#6c6450;">ELEV</span><span style="color:${elevColor};">${elevStr} <span style="color:#6c6450;font-size:9.5px;">AMSL</span></span>` +
      `</div>` +
      `<div style="margin-top:9px;padding-top:7px;border-top:1px solid rgba(232,224,198,0.12);font-size:9px;letter-spacing:0.22em;">${status}</div>`;
    // Position tooltip and clamp to viewport so it never spills off-screen.
    tooltip.style.left = mx + 'px';
    tooltip.style.top  = my + 'px';
    tooltip.style.opacity = '1';
    // Measure after content is rendered, then adjust.
    requestAnimationFrame(() => {
      const r = tooltip.getBoundingClientRect();
      const margin = 8;
      let nx = mx + 12;   // default: to the right of cursor
      let ny = my;        // default: vertically centered (transform: translateY(-50%))
      // If overflowing right edge, flip to left of cursor.
      if (nx + r.width > window.innerWidth - margin) {
        nx = mx - r.width - 12;
      }
      if (nx < margin) nx = margin;
      // Vertical: tooltip is translateY(-50%), so its centre is at ny.
      // Make sure top edge ≥ margin and bottom edge ≤ innerHeight - margin.
      const halfH = r.height / 2;
      if (ny - halfH < margin) ny = margin + halfH;
      if (ny + halfH > window.innerHeight - margin) ny = window.innerHeight - margin - halfH;
      tooltip.style.left = nx + 'px';
      tooltip.style.top  = ny + 'px';
    });
  }
  function hideTip() { tooltip.style.opacity = '0'; }

  function onCanvasMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (!cityProjCache.length) { hideTip(); return; }
    // Strict per-peak hit detection. Hover triggers ONLY when the cursor is:
    //   • within 12px horizontally of the city's longitude column, AND
    //   • vertically between the city's peak top and its baseline (with small slack).
    // Small cities (where peakY ~= baseY) get a minimum hover height of 28px so
    // they remain hoverable. No nearest-neighbour fallback — empty area = no tip.
    let best = null, bestDx = Infinity;
    for (const p of cityProjCache) {
      const dx = Math.abs(mx - p.x);
      if (dx > 12) continue;
      const topY = Math.min(p.peakY - 6, p.y - 28);
      const botY = p.y + 4;
      if (my < topY || my > botY) continue;
      if (dx < bestDx) { bestDx = dx; best = p; }
    }
    if (best) showTip(best, e.clientX, e.clientY);
    else hideTip();
  }
  function onCanvasLeave() { hideTip(); }

  // ---------- real GeoJSON loader ----------
  // Loads the Natural Earth ne_110m_land outline from the LOCAL file shipped in
  // the project (world.geojson). The file was copied verbatim from
  // https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
  // and lives in the project root so this works fully offline.
  //
  // On load we ALSO rasterize the polygons into a landmask and REBUILD the
  // density grid using that landmask as the source of truth — so the joyplot
  // ridges align pixel-for-pixel with the world outline (same projection, same
  // coastline data). Cities are then re-stamped on top as peaks.
  function loadRealGeoJson() {
    fetch('world.geojson', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(geo => {
        if (!geo || !geo.features) throw new Error('bad geojson');
        window.WORLD_GEOJSON = geo;
        // Use the geojson's own "name" field for the source label so swapping
        // file (110m ↔ 50m ↔ 10m) auto-updates the panel readout.
        const src = (geo.name || '').replace('ne_', 'natural-earth-').replace('_land','')
                     || 'natural-earth';
        window.WORLD_GEOJSON_SOURCE = src;
        if (window.__flood) window.__flood.render0();
        const tag = document.getElementById('outline-source');
        if (tag) tag.textContent = src;
      })
      .catch(err => {
        console.warn('[FLOOD] local world.geojson load failed:', err.message);
        window.WORLD_GEOJSON_SOURCE = 'unavailable';
        const tag = document.getElementById('outline-source');
        if (tag) tag.textContent = 'unavailable';
      });
  }

  // Build a polygon index with bounding boxes for fast point-in-poly culling.
  function buildPolyIndex(geo) {
    const polys = [];
    for (const f of geo.features) {
      const g = f.geometry;
      if (!g) continue;
      const ringSets = g.type === 'Polygon' ? [g.coordinates]
                     : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const rings of ringSets) {
        if (!rings || !rings[0] || rings[0].length < 3) continue;
        const outer = rings[0];
        let lo0 = Infinity, lo1 = Infinity, hi0 = -Infinity, hi1 = -Infinity;
        for (let k = 0; k < outer.length; k++) {
          const p = outer[k];
          if (p[0] < lo0) lo0 = p[0];
          if (p[0] > hi0) hi0 = p[0];
          if (p[1] < lo1) lo1 = p[1];
          if (p[1] > hi1) hi1 = p[1];
        }
        polys.push({ outer, lo0, lo1, hi0, hi1 });
      }
    }
    return polys;
  }

  function isOnLand(lat, lon, polys) {
    for (let pi = 0; pi < polys.length; pi++) {
      const p = polys[pi];
      if (lat < p.lo1 || lat > p.hi1) continue;
      if (lon < p.lo0 || lon > p.hi0) continue;
      const ring = p.outer;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if ((yi > lat) !== (yj > lat) &&
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      if (inside) return true;
    }
    return false;
  }

  function rasterizeLandmask(polys) {
    const mask = new Uint8Array(ROWS * COLS);
    for (let i = 0; i < ROWS; i++) {
      const lat = LAT_TOP - (i + 0.5) * LAT_RES;
      for (let j = 0; j < COLS; j++) {
        const lon = LON_LEFT + (j + 0.5) * LON_RES;
        if (isOnLand(lat, lon, polys)) mask[i * COLS + j] = 1;
      }
    }
    return mask;
  }

  // Base rural land density for any (lat,lon) on land. Climate band by latitude
  // + regional bumps for known dense/sparse regions. Matches the spirit of the
  // earlier LAND_SEEDS array but is now anchored to the geojson coastline.
  function baseLandDensity(lat, lon) {
    const a = Math.abs(lat);
    let base = 0.34;
    // Latitude / climate band
    if (a < 8)       base *= 0.85;   // equatorial — rainforest, denser-than-thinks but variable
    else if (a < 25) base *= 0.95;
    else if (a < 35) base *= 1.05;
    else if (a < 50) base *= 1.05;
    else if (a < 60) base *= 0.55;
    else if (a < 65) base *= 0.28;
    else             base *= 0.10;   // subarctic

    // Regional bumps — sparse regions
    if (lat > 17 && lat < 33 && lon > -12 && lon <  32) base *= 0.06;   // Sahara
    if (lat > 14 && lat < 32 && lon >  34 && lon <  58) base *= 0.18;   // Arabian peninsula
    if (lat > -33 && lat < -19 && lon > 117 && lon < 145) base *= 0.10;  // Outback
    if (lat >  55 && lat <  75 && lon >  55 && lon < 180) base *= 0.22;  // Siberia
    if (lat > -50 && lat < -38 && lon > -76 && lon < -60) base *= 0.20;  // Patagonia
    if (lat >  60 && lat <  73 && lon > -160 && lon < -55) base *= 0.20; // N Canada/Arctic
    if (lat >  20 && lat <  40 && lon >  85 && lon <  98) base *= 0.55;  // Tibet plateau
    if (lat > -18 && lat <  10 && lon > -75 && lon < -55) base *= 0.55;  // Amazon

    // Regional bumps — dense regions
    if (lat >  18 && lat <  32 && lon >  70 && lon < 100) base *= 1.6;   // Ganges plain
    if (lat >   5 && lat <  35 && lon >  70 && lon <  90) base *= 1.5;   // Indian subcontinent
    if (lat >  20 && lat <  42 && lon > 100 && lon < 125) base *= 1.7;   // E China
    if (lat >  30 && lat <  40 && lon > 124 && lon < 142) base *= 1.6;   // Japan / Korea
    if (lat > -10 && lat <  12 && lon >  95 && lon < 130) base *= 1.5;   // SE Asia / Java
    if (lat >  35 && lat <  60 && lon > -11 && lon <  35) base *= 1.5;   // Europe
    if (lat >  28 && lat <  45 && lon > -100 && lon < -70) base *= 1.4;  // US east
    if (lat >  10 && lat <  15 && lon > -15 && lon <  10) base *= 1.5;   // West Africa coast
    if (lat > -28 && lat < -18 && lon >  26 && lon <  36) base *= 1.3;   // S Africa belt
    if (lat >  10 && lat <  20 && lon >  30 && lon <  40) base *= 1.4;   // Nile / Ethiopia
    if (lat > -24 && lat < -15 && lon > -52 && lon < -38) base *= 1.5;   // Brazil SE

    return Math.min(2.0, base);
  }

  function rebuildDensity(landmask) {
    density.fill(0);
    for (let i = 0; i < ROWS; i++) {
      const lat = LAT_TOP - (i + 0.5) * LAT_RES;
      for (let j = 0; j < COLS; j++) {
        if (!landmask[i * COLS + j]) continue;
        const lon = LON_LEFT + (j + 0.5) * LON_RES;
        density[i * COLS + j] = baseLandDensity(lat, lon);
      }
    }
    cellElev.fill(99999);
    for (const c of cities) {
      stamp(density, c.lat, c.lon, c.pop, CITY_SIGMA);
      if (c.coast) stampCoastalElev(c.lat, c.lon, c.elev, CITY_SIGMA * 2.5);
    }
    for (const s of COAST_SEEDS) {
      stampCoastalElev(s[0], s[1], s[2], s[3]);
    }
    // Recompute totalPop reference for percentile scaling.
    totalPop = 0;
    for (let i = 0; i < density.length; i++) totalPop += density[i];
  }
  // Kick off in background.
  loadRealGeoJson();

  // ---------- init ----------
  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', onCanvasMove);
  canvas.addEventListener('mouseleave', onCanvasLeave);
  resize();
  setHud(0);
  updateChartMarker(0);
  tweenHud();

  // expose for tweaks panel
  window.__flood = { render, render0: () => render(parseFloat(slrEl.value) || 0) };
})();
