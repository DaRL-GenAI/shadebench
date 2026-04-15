// =============================================================
// DeepShade × ShadeBench — interactive demo
// =============================================================

// 34 cities of ShadeBench, with country flags for the gallery.
const CITIES = [
  ["abuja","🇳🇬"], ["aswan","🇪🇬"], ["auckland","🇳🇿"], ["aversa","🇮🇹"],
  ["beijing","🇨🇳"], ["brasilia","🇧🇷"], ["buenosaires","🇦🇷"], ["cairo","🇪🇬"],
  ["calgary","🇨🇦"], ["capetown","🇿🇦"], ["guadalajara","🇲🇽"], ["jaipur","🇮🇳"],
  ["johannesburg","🇿🇦"], ["lagos","🇳🇬"], ["madrid","🇪🇸"], ["mexico","🇲🇽"],
  ["mumbai","🇮🇳"], ["nagoya","🇯🇵"], ["nimes","🇫🇷"], ["outback","🇦🇺"],
  ["paris","🇫🇷"], ["phoenix","🇺🇸"], ["rome","🇮🇹"], ["rotorua","🇳🇿"],
  ["salta","🇦🇷"], ["santiago","🇨🇱"], ["saupaulo","🇧🇷"], ["seville","🇪🇸"],
  ["sydney","🇦🇺"], ["tempe","🇺🇸"], ["tokyo","🇯🇵"], ["toronto","🇨🇦"],
  ["valparaiso","🇨🇱"], ["xian","🇨🇳"],
];
const PRETTY = {
  saupaulo: "São Paulo", buenosaires: "Buenos Aires",
  capetown: "Cape Town", xian: "Xi'an",
};
const prettyName = c => PRETTY[c] || (c[0].toUpperCase() + c.slice(1));

// Time-of-day frames: ShadeBench provides 13 hourly shots per tile (06:00–18:00).
// prepare_assets.py writes them to assets/demo/<city>/shade_<HH>.jpg, all from the
// SAME tile (row_col) so the slider scrubs through one fixed location as the sun moves.
const HOURS = ["06","07","08","09","10","11","12","13","14","15","16","17","18"];

const $ = s => document.querySelector(s);

// -------------------------------------------------------------
// Asset path helpers. When prepare_assets.py has not been run,
// we fall back to an inline SVG placeholder so the demo still
// renders something meaningful.
// -------------------------------------------------------------
function demoFrameURL(city, hourIdx) {
  return `assets/demo/${city}/shade_${HOURS[hourIdx]}.jpg`;
}
function cityThumbURL(city) {
  return `assets/cities/${city}.jpg`;
}
function modalityURL(city, kind) {
  // kind: satellite | mask | source | target | obj
  return `assets/demo/${city}/${kind}.jpg`;
}

// SVG placeholder — shows the hour and city so the demo still
// communicates intent before real assets are in place.
function placeholderSVG(label, hue = 220) {
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='hsl(${hue},60%,30%)'/>
        <stop offset='100%' stop-color='hsl(${(hue+40)%360},70%,15%)'/>
      </linearGradient>
      <pattern id='grid' width='32' height='32' patternUnits='userSpaceOnUse'>
        <path d='M 32 0 L 0 0 0 32' fill='none' stroke='rgba(255,255,255,0.06)' stroke-width='1'/>
      </pattern>
    </defs>
    <rect width='512' height='512' fill='url(#g)'/>
    <rect width='512' height='512' fill='url(#grid)'/>
    <g font-family='Inter, sans-serif' fill='white' text-anchor='middle'>
      <text x='256' y='260' font-size='34' font-weight='700' letter-spacing='-1'>${label}</text>
      <text x='256' y='295' font-size='13' opacity='0.6'>place real asset at matching path</text>
    </g>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Attach an image, falling back to placeholder on error.
function setImg(imgEl, url, placeholderLabel, hue) {
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = placeholderSVG(placeholderLabel, hue);
  };
  imgEl.src = url;
}

// -------------------------------------------------------------
// Hero: count-up animations
// -------------------------------------------------------------
function countUp() {
  document.querySelectorAll(".hero-stats b[data-count]").forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    const dur = 1200; const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// -------------------------------------------------------------
// Interactive time-of-day demo
// -------------------------------------------------------------
const state = { city: "phoenix", hourIdx: 6, playing: false, playTimer: null };

function updateDemo() {
  const { city, hourIdx } = state;
  const hour = HOURS[hourIdx];
  $("#timeLabel").textContent = `${hour}:00`;

  // rough solar azimuth/altitude readout (display only; exact values come from the data).
  const t = hourIdx / (HOURS.length - 1);       // 0 = sunrise, 1 = sunset
  const azim = Math.round(90 + t * 180);         // 90° (E) → 270° (W)
  const alt  = Math.round(Math.sin(t * Math.PI) * 75);
  $("#sunMeta").textContent = `azimuth ${azim}° (${t < 0.5 ? "E→S" : "S→W"}) · altitude ${alt}°`;

  // Sun travels EAST → WEST across the sky. The stage is a north-up satellite
  // tile, so east is on the RIGHT of the frame and west is on the LEFT.
  // At t=0 (sunrise) the dot sits at the right edge; at t=1 (sunset) at the left.
  const sunDot = $("#sunDot");
  sunDot.style.left = `${(1 - t) * 100}%`;
  sunDot.style.top  = `${100 - Math.sin(t * Math.PI) * 90}%`;

  const hue = 200 + hourIdx * 12;
  setImg($("#shadeFrame"), demoFrameURL(city, hourIdx),
         `${prettyName(city)} · ${hour}:00`, hue);
}

function initDemo() {
  const sel = $("#cityDemo");
  CITIES.forEach(([c, flag]) => {
    const o = document.createElement("option");
    o.value = c; o.textContent = `${flag}  ${prettyName(c)}`;
    sel.appendChild(o);
  });
  sel.value = state.city;
  sel.addEventListener("change", e => { state.city = e.target.value; updateDemo(); updateModalities(); });

  const slider = $("#timeSlider");
  slider.max = HOURS.length - 1;
  slider.value = state.hourIdx;
  slider.addEventListener("input", e => { state.hourIdx = +e.target.value; updateDemo(); });

  $("#playBtn").addEventListener("click", togglePlay);

  updateDemo();
}

function togglePlay() {
  const btn = $("#playBtn");
  if (state.playing) {
    clearInterval(state.playTimer);
    state.playing = false;
    btn.textContent = "▶ Play";
  } else {
    state.playing = true;
    btn.textContent = "⏸ Pause";
    state.playTimer = setInterval(() => {
      state.hourIdx = (state.hourIdx + 1) % HOURS.length;
      $("#timeSlider").value = state.hourIdx;
      updateDemo();
    }, 500);
  }
}

// -------------------------------------------------------------
// City gallery
// -------------------------------------------------------------
function initGallery() {
  const grid = $("#cityGrid");
  CITIES.forEach(([c, flag], i) => {
    const card = document.createElement("div");
    card.className = "city-card";
    card.innerHTML = `
      <img alt="${c}" />
      <div class="city-gradient"></div>
      <div class="city-tag">
        <span class="city-name">${prettyName(c)}</span>
        <span class="city-flag">${flag}</span>
      </div>`;
    const img = card.querySelector("img");
    setImg(img, cityThumbURL(c), prettyName(c), (i * 22) % 360);
    card.addEventListener("click", () => {
      state.city = c;
      $("#cityDemo").value = c;
      updateDemo();
      updateModalities();
      document.getElementById("demo").scrollIntoView({ behavior: "smooth" });
    });
    grid.appendChild(card);
  });
}

// -------------------------------------------------------------
// Compare slider (drag to reveal)
// -------------------------------------------------------------
const PAIRS = {
  "sat-pred": { left: "satellite", right: "target",    labels: ["Satellite",   "Prediction"]   },
  "pred-gt":  { left: "target",    right: "source",    labels: ["Prediction",  "Ground truth"] },
  "src-tgt":  { left: "source",    right: "target",    labels: ["Source t",    "Target t+Δ"]   },
};
let currentPair = "sat-pred";

function setComparePair(key) {
  currentPair = key;
  const { left, right, labels } = PAIRS[key];
  const c = state.city;
  setImg($("#compareLeft"),  modalityURL(c, left),  labels[0], 210);
  setImg($("#compareRight"), modalityURL(c, right), labels[1], 30);
  document.querySelector(".compare-label.left").textContent = labels[0];
  document.querySelector(".compare-label.right").textContent = labels[1];
  document.querySelectorAll(".compare-tabs .tab").forEach(t => {
    t.classList.toggle("active", t.dataset.pair === key);
  });
}

function initCompare() {
  document.querySelectorAll(".compare-tabs .tab").forEach(t => {
    t.addEventListener("click", () => setComparePair(t.dataset.pair));
  });
  setComparePair("sat-pred");

  const stage   = $("#compareStage");
  const right   = $("#compareRight");
  const divider = $("#compareDivider");

  let dragging = false;
  function setPos(clientX) {
    const rect = stage.getBoundingClientRect();
    let p = (clientX - rect.left) / rect.width;
    p = Math.max(0, Math.min(1, p));
    right.style.clipPath = `inset(0 0 0 ${p * 100}%)`;
    divider.style.left = `${p * 100}%`;
  }
  stage.addEventListener("mousedown", e => { dragging = true; setPos(e.clientX); });
  window.addEventListener("mousemove", e => dragging && setPos(e.clientX));
  window.addEventListener("mouseup",   ()   => { dragging = false; });
  stage.addEventListener("touchstart", e => { dragging = true; setPos(e.touches[0].clientX); }, { passive: true });
  window.addEventListener("touchmove", e => dragging && setPos(e.touches[0].clientX), { passive: true });
  window.addEventListener("touchend",  () => { dragging = false; });
}

// -------------------------------------------------------------
// Modalities grid
// -------------------------------------------------------------
function updateModalities() {
  document.querySelectorAll(".modality-grid img[data-modality]").forEach(img => {
    const kind = img.dataset.modality;
    const labelMap = { satellite: "Satellite", mask: "Mask", source: "Source", target: "Target", obj: "OBJ grid" };
    const hueMap = { satellite: 220, mask: 280, source: 40, target: 10, obj: 150 };
    setImg(img, modalityURL(state.city, kind), labelMap[kind], hueMap[kind]);
  });
}

// -------------------------------------------------------------
// Boot
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  countUp();
  initDemo();
  initGallery();
  initCompare();
  updateModalities();
});

// React to city changes for compare too
const _origUpdate = updateDemo;
// (already reset compare via updateModalities; keep compare pair in sync when city changes)
const observer = new MutationObserver(() => {});
document.addEventListener("DOMContentLoaded", () => {
  $("#cityDemo").addEventListener("change", () => setComparePair(currentPair));
});
