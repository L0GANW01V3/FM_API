const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const DATA_FILE = path.join(__dirname, "data", "stations.json");

let stations = [];
let loadedAt = null;

function loadStations() {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  stations = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed.stations) ? parsed.stations : []);
  loadedAt = new Date().toISOString();
}

function sendJson(res, status, payload, cacheSeconds = 0) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", cacheSeconds
    ? `public, max-age=${cacheSeconds}`
    : "no-store");
  res.end(body);
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeStation(s) {
  return {
    id: clean(s.stationuuid || s.id),
    name: clean(s.name),
    country: clean(s.country),
    countryCode: clean(s.countrycode || s.countryCode).toUpperCase(),
    state: clean(s.state),
    language: clean(s.language),
    tags: clean(s.tags),
    codec: clean(s.codec),
    bitrate: Number(s.bitrate) || 0,
    url: clean(s.url_resolved || s.url),
    homepage: clean(s.homepage),
    favicon: clean(s.favicon),
    latitude: Number.isFinite(Number(s.latitude ?? s.geo_lat)) ? Number(s.latitude ?? s.geo_lat) : null,
    longitude: Number.isFinite(Number(s.longitude ?? s.geo_long)) ? Number(s.longitude ?? s.geo_long) : null,
    votes: Number(s.votes) || 0,
    lastChecked: clean(s.lastcheckoktime_iso8601 || s.lastchecktime_iso8601),
    coordinateSource: clean(s.coordinateSource) || (Number.isFinite(Number(s.latitude ?? s.geo_lat)) && Number.isFinite(Number(s.longitude ?? s.geo_long)) ? "station" : "none"),
    source: "Radio-Browser"
  };
}

function filterStations(query) {
  const q = clean(query.get("q")).toLowerCase();
  const country = clean(query.get("country")).toLowerCase();
  const countryCode = clean(query.get("countryCode")).toUpperCase();
  const language = clean(query.get("language")).toLowerCase();
  const codec = clean(query.get("codec")).toLowerCase();
  const tag = clean(query.get("tag")).toLowerCase();

  let result = stations.map(normalizeStation);

  if (q) {
    result = result.filter(s =>
      [s.name, s.country, s.state, s.language, s.tags]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  if (country) result = result.filter(s => s.country.toLowerCase() === country);
  if (countryCode) result = result.filter(s => s.countryCode === countryCode);
  if (language) result = result.filter(s => s.language.toLowerCase().split(",").map(x => x.trim()).includes(language));
  if (codec) result = result.filter(s => s.codec.toLowerCase() === codec);
  if (tag) result = result.filter(s => s.tags.toLowerCase().split(",").map(x => x.trim()).includes(tag));

  const sort = clean(query.get("sort")).toLowerCase();
  if (sort === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "votes") {
    result.sort((a, b) => b.votes - a.votes);
  } else if (sort === "bitrate") {
    result.sort((a, b) => b.bitrate - a.bitrate);
  }

  const total = result.length;
  const requestedLimit = Number(query.get("limit") || 50);
  const requestedPage = Number(query.get("page") || 1);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 200);
  const page = Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1);
  const start = (page - 1) * limit;

  return {
    stations: result.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

function countries() {
  const map = new Map();
  for (const raw of stations) {
    const s = normalizeStation(raw);
    if (!s.country) continue;
    const key = s.countryCode || s.country.toUpperCase();
    const current = map.get(key) || {
      country: s.country,
      countryCode: s.countryCode,
      stationCount: 0
    };
    current.stationCount++;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.country.localeCompare(b.country));
}

try {
  loadStations();
} catch (err) {
  console.error("Failed to load stations.json:", err.message);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.end();
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    return sendJson(res, 400, { error: "Invalid URL" });
  }

  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "world-fm-api",
      stationCount: stations.length,
      loadedAt,
      uptimeSeconds: Math.floor(process.uptime())
    }, 30);
  }

  if (pathname === "/api/countries") {
    return sendJson(res, 200, {
      countries: countries(),
      count: countries().length
    }, 3600);
  }

  if (pathname === "/api/stations") {
    const result = filterStations(url.searchParams);
    return sendJson(res, 200, result, 300);
  }

  if (pathname.startsWith("/api/stations/")) {
    const id = decodeURIComponent(pathname.slice("/api/stations/".length));
    const station = stations.map(normalizeStation).find(s => s.id === id);
    if (!station) return sendJson(res, 404, { error: "Station not found" });
    return sendJson(res, 200, { station }, 300);
  }

  return sendJson(res, 404, {
    error: "Not found",
    endpoints: [
      "GET /api/health",
      "GET /api/countries",
      "GET /api/stations",
      "GET /api/stations/:id"
    ]
  });
});

server.listen(PORT, HOST, () => {
  console.log(`World FM API listening on ${HOST}:${PORT}`);
});
