const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const apiRoutes = require('./routes');
const { getCountryCombined } = require('./services');

dotenv.config();

const app = express();

// Basic cache headers for public GET endpoints
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.startsWith('/api')) {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  }
  next();
});

// Middleware
app.use(cors({ origin: '*'}));
app.use(express.json());
app.use(morgan('dev'));

// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'world-data-explorer-backend' });
});

// API Routes
app.use('/api', apiRoutes);

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 8080;

async function start() {
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, { dbName: process.env.MONGODB_DB || 'world-data-explorer' });
      console.log('Connected to MongoDB');
    } catch (e) {
      console.warn('MongoDB connection failed (continuing with in-memory cache):', e.message);
    }
  } else {
    console.log('MONGODB_URI not set. Using in-memory cache only.');
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

  // Optional background prefetch for Asia/Europe to warm cache
  if (process.env.PREFETCH === '1') {
    try {
      const regions = (process.env.PREFETCH_REGIONS || 'Asia,Europe').split(',').map(s => s.trim());
      const codes = new Set();
      for (const region of regions) {
        const url = `https://restcountries.com/v3.1/region/${encodeURIComponent(region)}?fields=cca3`;
        const resp = await fetch(url);
        if (resp.ok) {
          const arr = await resp.json();
          arr.forEach(c => { if (c.cca3) codes.add(String(c.cca3).toUpperCase()); });
        }
      }
      const codeList = Array.from(codes);
      console.log(`Prefetching ${codeList.length} countries for cache…`);
      // limit concurrency to avoid bursts
      const concurrency = Number(process.env.PREFETCH_CONCURRENCY || 3);
      let idx = 0;
      async function worker() {
        while (idx < codeList.length) {
          const my = idx++;
          const code = codeList[my];
          try { await getCountryCombined(code); } catch (_) {}
          await new Promise(r => setTimeout(r, 200));
        }
      }
      await Promise.all(Array.from({ length: concurrency }).map(worker));
      console.log('Prefetch complete.');
    } catch (e) {
      console.warn('Prefetch failed:', e.message);
    }
  }
}

start();


