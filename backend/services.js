const axios = require('axios');
const NodeCache = require('node-cache');
const mongoose = require('mongoose');

const cache = new NodeCache({ stdTTL: 60 * 60 }); // 1 hour default TTL

// Optional Mongo-backed cache
let CacheModel = null;
try {
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    const schema = new mongoose.Schema({
      key: { type: String, unique: true, index: true },
      value: {},
      expiresAt: { type: Date, index: true },
    }, { timestamps: true, strict: false });
    CacheModel = mongoose.models.CachedEntry || mongoose.model('CachedEntry', schema);
  }
} catch (_) {}

async function getCached(key) {
  const mem = cache.get(key);
  if (mem) return mem;
  if (CacheModel) {
    const doc = await CacheModel.findOne({ key, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).lean();
    if (doc && doc.value) {
      cache.set(key, doc.value);
      return doc.value;
    }
  }
  return null;
}

async function setCached(key, value, ttlSeconds = 3600) {
  cache.set(key, value, ttlSeconds);
  if (CacheModel) {
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
    await CacheModel.findOneAndUpdate(
      { key },
      { key, value, expiresAt },
      { upsert: true, new: true }
    );
  }
}

// Reuse axios instance with keep-alive
const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': 'World-Data-Explorer/1.0' }
});

async function fetchText(url) {
  const resp = await http.get(url, { responseType: 'text' });
  return resp.data;
}

// OWID helpers
function parseOwidCsv(csvText, code) {
  if (!csvText) return [];
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  const idxCode = header.findIndex(h => /code/i.test(h));
  const idxYear = header.findIndex(h => /year/i.test(h));
  const idxValue = header.findIndex(h => /value|v/i.test(h));
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const cols = row.split(',');
    if (cols[idxCode] !== code) continue;
    const year = Number(cols[idxYear]);
    const value = Number(cols[idxValue]);
    if (Number.isFinite(year) && Number.isFinite(value)) out.push({ year, value });
  }
  out.sort((a, b) => a.year - b.year);
  return out;
}

async function fetchOwidSeries(code, datasetId) {
  const key = `owid:${datasetId}:${code}`;
  const cached = await getCached(key);
  if (cached) return cached;
  try {
    const csv = await fetchText(`https://ourworldindata.org/grapher/${datasetId}.csv`);
    const series = parseOwidCsv(csv, code);
    if (series.length) {
      await setCached(key, series, 60 * 60 * 24);
      return series;
    }
  } catch (_) {}
  return [];
}

// Wikidata largest city
async function fetchWikidataLargestCity(iso) {
  const key = `wikidata:largest:${iso}`;
  const cached = await getCached(key);
  if (cached) return cached;
  const query = `SELECT ?cityLabel WHERE {\n  ?country wdt:P31 wd:Q6256 .\n  VALUES ?code { \"${iso}\" }\n  { ?country wdt:P297 ?code } UNION { ?country wdt:P298 ?code } .\n  ?city wdt:P31/wdt:P279* wd:Q515 ; wdt:P17 ?country .\n  OPTIONAL { ?city wdt:P1082 ?pop }\n} ORDER BY DESC(?pop) LIMIT 1`;
  try {
    const resp = await http.get('https://query.wikidata.org/sparql', {
      headers: { Accept: 'application/sparql-results+json' },
      params: { query }
    });
    const city = resp.data?.results?.bindings?.[0]?.cityLabel?.value;
    if (city) {
      await setCached(key, city, 60 * 60 * 24 * 7);
      return city;
    }
  } catch (_) {}
  return null;
}

async function fetchWorldBankSeries(code, indicator) {
  const key = `wb:${indicator}:${code}`;
  const cached = await getCached(key);
  if (cached) return cached;
  const url = `https://api.worldbank.org/v2/country/${code}/indicator/${indicator}?format=json&per_page=60`;
  try {
    const resp = await http.get(url);
    const [, data] = resp.data || [];
    const series = (data || [])
      .filter(d => d && d.value !== null)
      .map(d => ({ year: Number(d.date), value: Number(d.value) }))
      .sort((a, b) => a.year - b.year);
    await setCached(key, series, 60 * 60 * 12);
    return series;
  } catch (e) {
    return [];
  }
}

async function fetchRestCountry(code) {
  const key = `rc:${code}`;
  const cached = await getCached(key);
  if (cached) return cached;
  const url = `https://restcountries.com/v3.1/alpha/${code}`;
  let c = null;
  try {
    const resp = await http.get(url);
    c = resp.data && resp.data[0];
  } catch (_) {}
  const simplified = {
    name: c?.name?.common || code,
    officialName: c?.name?.official || '',
    translations: c?.name?.translations || {},
    cca2: c?.cca2,
    cca3: c?.cca3,
    region: c?.region,
    subregion: c?.subregion,
    languages: c?.languages || {},
    flagPng: c?.flags?.png,
    flagSvg: c?.flags?.svg,
    latlng: c?.latlng,
    area: c?.area,
    capital: Array.isArray(c?.capital) ? c.capital[0] : c?.capital,
  };
  await setCached(key, simplified, 60 * 60 * 24);
  return simplified;
}

async function getGDPSeries(code) {
  return await fetchWorldBankSeries(code, 'NY.GDP.MKTP.CD');
}

async function getPopulationSeries(code) {
  return await fetchWorldBankSeries(code, 'SP.POP.TOTL');
}

async function getAreaKm2Series(code) {
  // Land area (sq. km)
  return await fetchWorldBankSeries(code, 'AG.LND.TOTL.K2');
}

async function getPopulationDensitySeries(code) {
  // People per sq. km of land area
  return await fetchWorldBankSeries(code, 'EN.POP.DNST');
}

async function getGDPPerCapitaSeries(code) {
  return await fetchWorldBankSeries(code, 'NY.GDP.PCAP.CD');
}

async function getGDPGrowthSeries(code) {
  // GDP growth (annual %)
  return await fetchWorldBankSeries(code, 'NY.GDP.MKTP.KD.ZG');
}

async function getInflationSeries(code) {
  // Inflation, consumer prices (annual %)
  return await fetchWorldBankSeries(code, 'FP.CPI.TOTL.ZG');
}

async function getCountryCombined(code) {
  const key = `combined:v2:${code}`;
  const cached = await getCached(key);
  if (cached) return cached;

  try {
    const [gdp, pop, rc] = await Promise.all([
      getGDPSeries(code).catch(() => []),
      getPopulationSeries(code).catch(() => []),
      fetchRestCountry(code).catch(() => ({ cca3: code }))
    ]);

    const [area, density, gdppc, gdpGrowth, inflation] = await Promise.all([
      getAreaKm2Series(code).catch(() => []),
      getPopulationDensitySeries(code).catch(() => []),
      getGDPPerCapitaSeries(code).catch(() => []),
      getGDPGrowthSeries(code).catch(() => []),
      getInflationSeries(code).catch(() => []),
    ]);

    const latestGDP = (gdp || [])[gdp.length - 1] || null;
    const latestPop = (pop || [])[pop.length - 1] || null;

    // OWID fallbacks if WB series missing
    const countryCode = (rc?.cca3 || code).toUpperCase();
    let gdppcSeries = gdppc && gdppc.length ? gdppc : await fetchOwidSeries(countryCode, 'gdp-per-capita-worldbank');
    let inflationSeries = inflation && inflation.length ? inflation : await fetchOwidSeries(countryCode, 'inflation_annual');

    // Fallback computations
    const areaLatest = (area && area[area.length - 1]) || (rc?.area ? { year: new Date().getFullYear(), value: Number(rc.area) } : null);
    let densityLatest = (density && density[density.length - 1]) || null;
    if (!densityLatest && (areaLatest?.value && latestPop?.value)) {
      densityLatest = { year: latestPop.year, value: latestPop.value / areaLatest.value };
    }
    let gdppcLatest = gdppcSeries && gdppcSeries[gdppcSeries.length - 1] || null;
    if (!gdppcLatest && (latestGDP?.value && latestPop?.value)) {
      gdppcLatest = { year: Math.max(latestGDP.year, latestPop.year), value: latestGDP.value / latestPop.value };
    }

    const result = {
      country: rc,
      gdp: { latest: latestGDP, series: gdp || [] },
      population: { latest: latestPop, series: pop || [] },
      languages: rc.languages || {},
      geoSocio: {
        areaKm2: areaLatest,
        populationDensity: densityLatest,
        gdpPerCapita: { latest: gdppcLatest, series: gdppcSeries || [] },
        gdpGrowth: { latest: (gdpGrowth && gdpGrowth[gdpGrowth.length - 1]) || null, series: gdpGrowth || [] },
        inflation: { latest: (inflationSeries && inflationSeries[inflationSeries.length - 1]) || null, series: inflationSeries || [] },
        capital: rc.capital || '',
        largestCity: rc.capital || ''
      }
    };

    // Try enrich largest city, but don't fail the response
    fetchWikidataLargestCity(rc?.cca2 || code).then(city => {
      if (city) {
        result.geoSocio.largestCity = city;
        setCached(key, result, 60 * 60).catch(() => {});
      }
    }).catch(() => {});

    await setCached(key, result, 60 * 60);
    return result;
  } catch (e) {
    // Return minimal object instead of 500
    const rc = await fetchRestCountry(code).catch(() => ({ cca3: code }));
    const result = {
      country: rc,
      gdp: { latest: null, series: [] },
      population: { latest: null, series: [] },
      languages: rc.languages || {},
      geoSocio: {
        areaKm2: rc.area ? { year: new Date().getFullYear(), value: Number(rc.area) } : null,
        populationDensity: null,
        gdpPerCapita: { latest: null, series: [] },
        gdpGrowth: { latest: null, series: [] },
        inflation: { latest: null, series: [] },
        capital: rc.capital || '',
        largestCity: rc.capital || ''
      }
    };
    return result;
  }
}

async function searchCountries(q) {
  const key = `search:${q.toLowerCase()}`;
  const cached = await getCached(key);
  if (cached) return cached;
  const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fields=name,cca2,cca3,flags`;
  try {
    const resp = await http.get(url);
    const results = (resp.data || []).map(c => ({
      cca2: c.cca2,
      cca3: c.cca3,
      name: c.name?.common,
      vi: c.name?.translations?.vie?.common,
      flag: c.flags?.png || c.flags?.svg,
    }));
    await setCached(key, results, 60 * 30);
    return results;
  } catch (e) {
    return [];
  }
}

module.exports = {
  getGDPSeries,
  getPopulationSeries,
  getCountryCombined,
  searchCountries,
};


