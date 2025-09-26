# World Data Explorer – Backend

Express API gateway with caching (in-memory + optional MongoDB Atlas) for World Bank and REST Countries.

## Endpoints

- `GET /health` – service health
- `GET /api/country/:code` – combined country info (GDP series, population series, languages, flag)
- `GET /api/gdp/:code` – GDP series
- `GET /api/population/:code` – population series
- `GET /api/search?q=` – country search (name EN + VI)

Country code accepts `CCA3` (preferred) or `CCA2`.

## Environment

Create `.env`:

```
PORT=8080
MONGODB_URI= # optional
MONGODB_DB=world-data-explorer
```

## Run locally

```
npm run dev
```

## Deploy

- Render: Use a Node web service, set start command `npm start`, add envs, expose port from `PORT`.
- AWS EC2: Run with PM2 or systemd, open security group for the port.

### Suggested environment for Render

```
PORT=8080
MONGODB_URI=
MONGODB_DB=world-data-explorer
PREFETCH=1
PREFETCH_REGIONS=Asia,Europe
PREFETCH_CONCURRENCY=3
```


