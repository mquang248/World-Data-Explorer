# World Data Explorer

Explore global indicators like GDP, population, languages and more on an interactive 3D globe. The app consists of a static frontend (Mapbox GL JS + Chart.js) and a lightweight Node.js/Express backend that aggregates public datasets with caching.

## Live Demo

Visit the deployed app here: https://wdexplorer.vercel.app

## Features

- Interactive world map (Mapbox GL JS, globe projection)
- Country details sidebar with flag, GDP, population, languages
- Time‑series charts (GDP total, GDP growth)
- Fallbacks for missing data and clear "No data" empty states
- Simple caching (in‑memory; optional MongoDB persistence)

## Project structure

```
frontend/  # Static site (HTML/CSS/JS) with Mapbox GL JS and Chart.js
backend/   # Node.js + Express API with caching and optional MongoDB
```

## Getting started (local)

1) Backend

```
cd backend
# Optionally create .env with MONGODB_URI, MONGODB_DB, PREFETCH, etc.
npm install
npm run dev
```

2) Frontend

Edit `frontend/index.html` inside `<head>` to set environment:

```html
<meta name="backend-url" content="http://localhost:8080" />
<meta name="mapbox-token" content="YOUR_MAPBOX_TOKEN" />
```

Then open `frontend/index.html` in your browser.

## API endpoints (backend)

- `GET /health` → service health
- `GET /api/country/:code` → aggregated data for country (ISO2/ISO3)
- `GET /api/gdp/:code` → GDP series
- `GET /api/population/:code` → Population series
- `GET /api/search?q=...` → Country search (name → cca2/cca3 + flag)

## Deployment

Frontend (static)

- Vercel: import `frontend` folder, no build step required
- Netlify: publish directory = `frontend`
- GitHub Pages: serve the `frontend` folder contents

Backend (Node)

- Render/Railway/Heroku: root dir `backend`, start `npm start`
- Set environment variables as needed:
  - `MONGODB_URI` (optional)
  - `MONGODB_DB` (optional)
  - `PREFETCH=1`, `PREFETCH_REGIONS=Asia,Europe` (optional cache warmup)

After deploying the backend, update the frontend meta tag `backend-url` with the deployed backend URL. Ensure `mapbox-token` is set to a valid Mapbox access token.

## Tech stack

- Frontend: Vanilla JS, Mapbox GL JS, Chart.js
- Backend: Node.js, Express, Axios, Node‑Cache, optional Mongoose/MongoDB

## Author

- Maintainer: add your name/contact here

