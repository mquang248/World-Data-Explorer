const { Router } = require('express');
const { getCountryCombined, getGDPSeries, getPopulationSeries, searchCountries } = require('./services');

const router = Router();

router.get('/country/:code', async (req, res, next) => {
  try {
    const code = (req.params.code || '').toUpperCase();
    if (!code || code.length < 2) return res.status(400).json({ error: 'Invalid country code' });
    const data = await getCountryCombined(code);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.get('/gdp/:code', async (req, res, next) => {
  try {
    const code = (req.params.code || '').toUpperCase();
    const data = await getGDPSeries(code);
    res.json(data);
  } catch (e) { next(e); }
});

router.get('/population/:code', async (req, res, next) => {
  try {
    const code = (req.params.code || '').toUpperCase();
    const data = await getPopulationSeries(code);
    res.json(data);
  } catch (e) { next(e); }
});

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const results = await searchCountries(q);
    res.json(results);
  } catch (e) { next(e); }
});

module.exports = router;


