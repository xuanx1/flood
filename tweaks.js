// FLOOD — Settings panel.
// Standalone fixed-position island in the top-right area, fully separate from
// the Water Table panel. State exposed on window.FLOOD_TWEAKS for the renderer
// to read.

(function () {
  'use strict';

  const state = {
    worldOutline: false,
    labels:       true,
    latGrid:      false,
    coastalHalo:  true,
    autoSpeed:    1,          // 0.5 / 1 / 4
  };
  window.FLOOD_TWEAKS = state;

  // ---------- styles ----------
  const css = `
    .settings-island {
      position: fixed;
      bottom: 220px;
      left: 36px;
      width: 256px;
      z-index: 14;
      background: rgba(8,7,11,0.42);
      border: 1px solid var(--rule);
      backdrop-filter: blur(10px);
      padding: 16px 18px 14px;
      font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      color: var(--ink);
      user-select: none;
    }
    .settings-island::before,
    .settings-island::after {
      content: ''; position: absolute; width: 10px; height: 10px;
      border: 1px solid var(--ink-dim);
    }
    .settings-island::before { top: -1px; left: -1px;  border-right: none; border-bottom: none; }
    .settings-island::after  { bottom: -1px; right: -1px; border-left: none; border-top: none; }

    .settings-island header.island-head {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      font-size: 9.5px; letter-spacing: 0.34em; color: var(--ink);
      margin-bottom: 14px;
    }
    .settings-island header.island-head .title {
      display: flex; align-items: center;
      white-space: nowrap;
    }
    .settings-island header.island-head .dot {
      width: 7px; height: 7px; background: var(--water-hi); border-radius: 50%;
      box-shadow: 0 0 8px var(--water-hi); animation: blink 1.6s ease-in-out infinite;
      display: inline-block; margin-right: 8px; flex: 0 0 auto;
    }
    .settings-island header.island-head .src {
      font-size: 8.5px; color: var(--dim); letter-spacing: 0.18em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .settings-island .tw-row .name {
      font-size: 10px; letter-spacing: 0.16em;
      color: var(--ink); text-transform: uppercase;
      white-space: nowrap;
    }
    .settings-island .tw-seg button {
      white-space: nowrap;
    }

    .settings-island section {
      border-top: 1px solid rgba(232,224,198,0.10);
      padding: 11px 0 9px;
    }
    .settings-island section:first-of-type { border-top: none; padding-top: 0; }
    .settings-island h4 {
      margin: 0 0 9px;
      font-size: 9px; font-weight: 400; letter-spacing: 0.36em;
      color: var(--dim); text-transform: uppercase;
    }

    .tw-row {
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px; margin-bottom: 7px;
    }
    .tw-row:last-child { margin-bottom: 2px; }
    .tw-row .name {
      font-size: 10px; letter-spacing: 0.16em;
      color: var(--ink); text-transform: uppercase;
    }

    /* toggle */
    .tw-toggle {
      position: relative; width: 34px; height: 16px; border-radius: 8px;
      background: rgba(0,0,0,0.5); border: 1px solid rgba(232,224,198,0.18);
      cursor: pointer; flex: 0 0 auto;
    }
    .tw-toggle::after {
      content: ''; position: absolute; top: 1px; left: 1px;
      width: 12px; height: 12px; border-radius: 50%;
      background: rgba(232,224,198,0.5); transition: left 0.15s, background 0.15s;
    }
    .tw-toggle.on { background: var(--water-hi); }
    .tw-toggle.on::after { left: 19px; background: #07060a; box-shadow: 0 0 6px rgba(255,106,77,0.6); }

    /* segmented */
    .tw-seg {
      display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
      width: 100%; height: 22px;
      background: rgba(0,0,0,0.45);
      border: 1px solid rgba(232,224,198,0.18);
      margin-top: 4px;
    }
    .tw-seg button {
      background: transparent; border: 0; padding: 0;
      color: rgba(232,224,198,0.55);
      font: inherit; font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase;
      cursor: pointer;
    }
    .tw-seg button:hover { color: rgba(232,224,198,0.9); }
    .tw-seg button.on {
      background: var(--water-hi); color: #07060a;
      box-shadow: 0 0 9px rgba(255,106,77,0.55);
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- DOM ----------
  const panel = document.createElement('div');
  panel.className = 'settings-island';
  panel.innerHTML = `
    <header class="island-head">
      <span class="title"><span class="dot"></span>SETTINGS</span>
    </header>

    <section>
      <h4>Overlays</h4>
      <div class="tw-row">
        <span class="name">World outline</span>
        <div class="tw-toggle" data-key="worldOutline"></div>
      </div>
      <div class="tw-row">
        <span class="name">City labels</span>
        <div class="tw-toggle on" data-key="labels"></div>
      </div>
    </section>

    <section>
      <h4>Plot</h4>
      <div class="tw-row">
        <span class="name">Lat / lon grid</span>
        <div class="tw-toggle" data-key="latGrid"></div>
      </div>
      <div class="tw-row">
        <span class="name">Coastal halo</span>
        <div class="tw-toggle on" data-key="coastalHalo"></div>
      </div>
    </section>

    <section>
      <h4>Scenario</h4>
      <div class="tw-row" style="margin-bottom:2px;">
        <span class="name">Auto-flood speed</span>
      </div>
      <div class="tw-seg" data-key="autoSpeed">
        <button data-val="0.5">Slow</button>
        <button data-val="1" class="on">Mid</button>
        <button data-val="4">Rush</button>
      </div>
    </section>
  `;
  document.body.appendChild(panel);

  // ---------- side effects ----------
  function repaint() {
    if (window.__flood && window.__flood.render0) window.__flood.render0();
  }

  // ---------- events ----------
  panel.addEventListener('click', (e) => {
    let t = e.target;
    if (t.classList.contains('tw-toggle')) {
      const key = t.dataset.key;
      state[key] = !state[key];
      t.classList.toggle('on', state[key]);
      repaint();
      return;
    }
    if (t.tagName === 'BUTTON' && t.parentElement && t.parentElement.dataset.key) {
      const key = t.parentElement.dataset.key;
      const val = t.dataset.val;
      // Numeric for autoSpeed, string for everything else.
      state[key] = (key === 'autoSpeed') ? parseFloat(val) : val;
      t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t));
      repaint();
    }
  });

  // ---------- drag ----------
  // (drag removed at user request)
})();
