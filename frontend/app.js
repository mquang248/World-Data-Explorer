// Config will be injected from meta into window.* at runtime
const DEFAULT_FLAG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="56"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="12" fill="%236b7280">Flag</text></svg>';

function $(sel) { return document.querySelector(sel); }

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
}

function setThemeToggle() {
  const btn = $('#themeToggle');
  btn.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light');
    document.body.classList.toggle('light', !isLight);
    btn.textContent = isLight ? '🌙' : '☀️';
  });
}

function buildGDPChart(points) {
  const canvas = document.getElementById('gdpChart');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const hasData = Array.isArray(points) && points.length > 1;
  if (!hasData) {
    if (window.__gdpChart) { window.__gdpChart.destroy(); window.__gdpChart = null; }
    wrap.classList.add('empty');
    wrap.setAttribute('data-empty', 'No data');
    canvas.style.display = 'none';
    return;
  }
  wrap.classList.remove('empty');
  wrap.removeAttribute('data-empty');
  canvas.style.display = '';
  const years = points.map(p => p.year);
  const values = points.map(p => p.value / 1_000_000_000);
  if (window.__gdpChart) {
    window.__gdpChart.data.labels = years;
    window.__gdpChart.data.datasets[0].data = values;
    window.__gdpChart.update();
    return;
  }
  window.__gdpChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'GDP (Billions USD)',
        data: values,
        borderColor: '#4f7cff',
        backgroundColor: 'rgba(79,124,255,0.2)',
        tension: 0.25,
        pointRadius: 0,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { display: true }, y: { display: true } }
    }
  });
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

function renderCountryView(payload, fallbackCode) {
  const { country, gdp, population, languages } = payload;
  $('#countryName').textContent = country?.name || fallbackCode;
  $('#countryOfficial').textContent = country?.officialName || '';
  const img = $('#flag');
  img.onerror = () => { img.onerror = null; img.src = DEFAULT_FLAG; };
  img.src = (country?.flagPng || country?.flagSvg || 'flag.png') || DEFAULT_FLAG;
  $('#gdpLatest').textContent = gdp?.latest ? `$${formatNumber(gdp.latest.value)}` : 'No data';
  $('#popLatest').textContent = population?.latest ? formatNumber(population.latest.value) : 'No data';
  const langs = Object.values(languages || {});
  $('#languages').textContent = langs.length ? langs.join(', ') : 'No data';
  buildGDPChart((gdp?.series || []).slice(-20));

  // Geo-socio block
  const gs = payload.geoSocio || {};
  const areaVal = gs?.areaKm2?.value;
  $('#areaKm2').textContent = (areaVal !== undefined && areaVal !== null) ? formatNumber(areaVal) : 'No data';
  const densityVal = gs?.populationDensity?.value;
  $('#density').textContent = (densityVal !== undefined && densityVal !== null) ? formatNumber(densityVal) : 'No data';
  const gdppcVal = gs?.gdpPerCapita?.latest?.value;
  $('#gdppc').textContent = (gdppcVal !== undefined && gdppcVal !== null) ? `$${formatNumber(gdppcVal)}` : 'No data';
  const inflVal = gs?.inflation?.latest?.value;
  $('#inflation').textContent = (inflVal !== undefined && inflVal !== null) ? `${Number(inflVal).toFixed(1)}%` : 'No data';
  const cap = gs.capital || '';
  const largest = gs.largestCity || '';
  const capText = [cap, (largest && largest !== cap) ? largest : null].filter(Boolean).join(' / ');
  $('#capLargest').textContent = capText || 'No data';

  buildGrowthChart((gs.gdpGrowth?.series || []).slice(-20));

  // Header: API most recent year across series
  try {
    const years = [];
    const pushLatestYear = (arr) => { if (Array.isArray(arr) && arr.length) years.push(Number(arr[arr.length - 1].year)); };
    pushLatestYear(gdp?.series);
    pushLatestYear(population?.series);
    pushLatestYear(gs?.gdpPerCapita?.series);
    pushLatestYear(gs?.gdpGrowth?.series);
    pushLatestYear(gs?.inflation?.series);
    const maxYear = years.length ? Math.max(...years.filter(Number.isFinite)) : null;
    const nav = document.getElementById('navLastUpdated');
    if (nav) nav.textContent = maxYear ? `Data year: ${maxYear}` : 'Data year: —';
  } catch (_) {}
}

function showLoadingSkeleton(hintName, code) {
  $('#sidebar').classList.remove('hidden');
  $('#countryName').textContent = hintName || 'Loading…';
  $('#countryOfficial').textContent = '';
  const img = $('#flag');
  img.onerror = null; img.src = 'flag.png';
  $('#gdpLatest').textContent = 'Loading…';
  $('#popLatest').textContent = 'Loading…';
  $('#languages').textContent = 'Loading…';
  buildGDPChart([]);
  const ids = ['areaKm2','density','gdppc','inflation','capLargest'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
}

async function loadCountry(code, hintName) {
  showLoadingSkeleton(hintName, code);
  const cacheKey = code;
  if (!window.__countryCache) window.__countryCache = new Map();
  const cache = window.__countryCache;
  // try localStorage first
  try {
    if (!cache.has(cacheKey)) {
      const raw = localStorage.getItem(`country:v2:${cacheKey}`);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.v) cache.set(cacheKey, obj.v);
      }
    }
  } catch (_) {}
  if (cache.has(cacheKey)) {
    const cachedData = cache.get(cacheKey);
    renderCountryView(cachedData, code);
    return cachedData;
  }
  if (window.__abortController) window.__abortController.abort();
  const controller = new AbortController();
  window.__abortController = controller;
  try {
    const res = await fetch(`${window.BACKEND_URL}/api/country/${code}`, { signal: controller.signal, cache: 'force-cache' });
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json();
    cache.set(cacheKey, data);
    try { localStorage.setItem(`country:v2:${cacheKey}`, JSON.stringify({ t: Date.now(), v: data })); } catch(_) {}
    renderCountryView(data, code);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('#countryName').textContent = hintName || code;
    $('#gdpLatest').textContent = '—';
    $('#popLatest').textContent = '—';
    $('#languages').textContent = '—';
  }
}

async function searchCountries(q) {
  const data = await fetchJSON(`${window.BACKEND_URL}/api/search?q=${encodeURIComponent(q)}`);
  return data;
}

function setupSearch(map) {
  const btn = $('#searchBtn');
  const input = $('#searchInput');
  let pending = false;
  async function run() {
    if (pending) return;
    const q = input.value.trim();
    if (!q) return;
    pending = true; btn.disabled = true; btn.textContent = 'Searching…';
    try {
      const results = await searchCountries(q);
      if (!results.length) return;
      const top = results[0];
      const code = (top.cca3 || top.cca2 || '').toUpperCase();
      if (code) {
        const data = await loadCountry(code);
        // fly to country center if available
        const latlng = data?.country?.latlng;
        if (Array.isArray(latlng) && latlng.length === 2) {
          const [lat, lng] = latlng;
          map.flyTo({ center: [lng, lat], zoom: 3, duration: 1200, essential: true });
        } else {
          const center = map.getCenter();
          map.easeTo({ center, zoom: 2.2, duration: 700 });
        }
      }
    } finally {
      pending = false; btn.disabled = false; btn.textContent = 'Search';
    }
  }
  btn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

function setupSidebar() {
  $('#closeSidebar').addEventListener('click', () => $('#sidebar').classList.add('hidden'));
}

function setupTooltip(map) {
  const tooltip = document.getElementById('tooltip');
  let raf = 0;
  map.on('mousemove', 'country-fills', (e) => {
    const f = e.features && e.features[0];
    if (!f) { tooltip.style.display = 'none'; return; }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.point.x + 12}px`;
      tooltip.style.top = `${e.point.y + 12}px`;
      tooltip.textContent = f.properties?.name_en || f.properties?.name || f.properties?.ADMIN || 'Country';
    });
  });
  map.on('mouseleave', 'country-fills', () => {
    tooltip.style.display = 'none';
  });
}

function setupMap() {
  mapboxgl.accessToken = (window.MAPBOX_TOKEN || '').trim();
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    projection: 'globe',
    zoom: 1.3,
    center: [0, 20]
  });

  map.on('style.load', () => {
    map.setFog({});
  });

  map.on('load', () => {
    map.addSource('countries', {
      type: 'vector',
      url: 'mapbox://mapbox.country-boundaries-v1'
    });

    map.addLayer({
      id: 'country-fills',
      type: 'fill',
      source: 'countries',
      'source-layer': 'country_boundaries',
      paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.35,
          0.12
        ]
      }
    });

    map.addLayer({
      id: 'country-borders',
      type: 'line',
      source: 'countries',
      'source-layer': 'country_boundaries',
      paint: {
        'line-color': '#93c5fd',
        'line-width': 0.6
      }
    });

    let hoveredId = null;
    map.on('mousemove', 'country-fills', (e) => {
      if (e.features.length > 0) {
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'countries', sourceLayer: 'country_boundaries', id: hoveredId }, { hover: false });
        }
        hoveredId = e.features[0].id;
        map.setFeatureState({ source: 'countries', sourceLayer: 'country_boundaries', id: hoveredId }, { hover: true });
        // prefetch disabled to avoid backend overload
      }
    });
    map.on('mouseleave', 'country-fills', () => {
      if (hoveredId !== null) {
        map.setFeatureState({ source: 'countries', sourceLayer: 'country_boundaries', id: hoveredId }, { hover: false });
      }
      hoveredId = null;
    });

    setupTooltip(map);

    map.on('click', 'country-fills', async (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const code = (f.properties?.iso_3166_1_alpha_3 || f.properties?.iso_3166_1).toUpperCase();
      try {
        const nameHint = f.properties?.name_en || f.properties?.name || f.properties?.ADMIN || code;
        loadCountry(code, nameHint);
        const center = e.lngLat;
        map.flyTo({ center, zoom: 3, essential: true, duration: 1000 });
      } catch (err) {
        console.error(err);
      }
    });

    map.on('mouseenter', 'country-fills', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'country-fills', () => { map.getCanvas().style.cursor = ''; });
  });

  return map;
}

function injectEnvFromMeta() {
  const m1 = document.querySelector('meta[name="backend-url"]');
  const m2 = document.querySelector('meta[name="mapbox-token"]');
  window.BACKEND_URL = m1 ? m1.content : (window.BACKEND_URL || 'http://localhost:8080');
  window.MAPBOX_TOKEN = m2 ? m2.content : (window.MAPBOX_TOKEN || '');
}

window.addEventListener('DOMContentLoaded', () => {
  injectEnvFromMeta();
  setThemeToggle();
  setupSidebar();
  // Set default placeholder flag on first load
  const img = document.getElementById('flag');
  if (img && !img.src) { img.src = 'flag.png'; }
  const map = setupMap();
  setupSearch(map);
});

function buildGrowthChart(points) {
  const canvas = document.getElementById('growthChart');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const hasData = Array.isArray(points) && points.length > 1;
  if (!hasData) {
    if (window.__growthChart) { window.__growthChart.destroy(); window.__growthChart = null; }
    wrap.classList.add('empty');
    wrap.setAttribute('data-empty', 'No data');
    canvas.style.display = 'none';
    return;
  }
  wrap.classList.remove('empty');
  wrap.removeAttribute('data-empty');
  canvas.style.display = '';
  const years = points.map(p => p.year);
  const values = points.map(p => Number(p.value));
  if (window.__growthChart) {
    window.__growthChart.data.labels = years;
    window.__growthChart.data.datasets[0].data = values;
    window.__growthChart.update();
    return;
  }
  window.__growthChart = new Chart(canvas, {
    type: 'bar',
    data: { labels: years, datasets: [{ label: 'GDP growth %', data: values, backgroundColor: 'rgba(20,184,166,0.6)' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v)=> v+'%' } } } }
  });
}


