import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "data", "stations.json");
const CENTROIDS = path.join(__dirname, "data", "country-centroids.json");

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info"
];

async function get(pathname) {
  let lastError;
  for (const base of MIRRORS) {
    try {
      const r = await fetch(base + pathname, {
        headers: {
          "User-Agent": "GlobeWave-FM-API/1.4",
          Accept: "application/json"
        }
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All Radio-Browser mirrors failed");
}

function loadCentroids() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CENTROIDS, "utf8"));
    return new Map(Object.entries(parsed));
  } catch (e) {
    console.warn(`Country centroid file unavailable: ${e.message}`);
    return new Map();
  }
}

console.log("Downloading the global station directory...");

const countries = await get("/json/countries?order=name");
if (!Array.isArray(countries)) {
  throw new Error("Radio-Browser countries response is not an array");
}

const usable = countries.filter(
  c => c?.iso_3166_1 && Number(c.stationcount) > 0
);

const countryCentroids = loadCentroids();
console.log(`Loaded ${countryCentroids.size} local country centroids.`);

const all = [];
let exactCoordinates = 0;
let countryCoordinates = 0;
let noCoordinates = 0;

for (let i = 0; i < usable.length; i++) {
  const c = usable[i];
  process.stdout.write(`\r[${i + 1}/${usable.length}] ${c.name}                    `);

  try {
    const rows = await get(
      `/json/stations/bycountrycodeexact/${encodeURIComponent(c.iso_3166_1)}?hidebroken=true&order=clickcount&reverse=true&limit=500`
    );

    if (!Array.isArray(rows)) {
      console.warn(`\nUnexpected station response for ${c.name}`);
      continue;
    }

    for (const s of rows) {
      if (!(s?.url_resolved || s?.url)) continue;

      const lat = Number(s.geo_lat);
      const lon = Number(s.geo_long);

      const hasExactCoordinates =
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 && lat <= 90 &&
        lon >= -180 && lon <= 180 &&
        !(lat === 0 && lon === 0);

      let latitude = null;
      let longitude = null;
      let coordinateSource = "none";

      if (hasExactCoordinates) {
        latitude = lat;
        longitude = lon;
        coordinateSource = "station";
        exactCoordinates++;
      } else {
        const code = String(s.countrycode || c.iso_3166_1 || "").toUpperCase();
        const fallback = countryCentroids.get(code);

        if (fallback && Number.isFinite(Number(fallback.latitude)) && Number.isFinite(Number(fallback.longitude))) {
          latitude = Number(fallback.latitude);
          longitude = Number(fallback.longitude);
          coordinateSource = "country";
          countryCoordinates++;
        } else {
          noCoordinates++;
        }
      }

      all.push({
        stationuuid: s.stationuuid || "",
        name: s.name || "",
        country: s.country || c.name || "",
        countrycode: s.countrycode || c.iso_3166_1 || "",
        state: s.state || "",
        language: s.language || "",
        tags: s.tags || "",
        codec: s.codec || "",
        bitrate: Number(s.bitrate) || 0,
        url_resolved: s.url_resolved || s.url || "",
        homepage: s.homepage || "",
        favicon: s.favicon || "",
        latitude,
        longitude,
        coordinateSource,
        votes: Number(s.votes) || 0,
        lastcheckoktime_iso8601: s.lastcheckoktime_iso8601 || "",
        lastchecktime_iso8601: s.lastchecktime_iso8601 || ""
      });
    }
  } catch (e) {
    console.error(`\nSkipped ${c.name}: ${e.message}`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(all, null, 2), "utf8");

console.log(`\n\nSaved ${all.length} stations to ${OUT}`);
console.log(`Exact station coordinates: ${exactCoordinates}`);
console.log(`Country fallback coordinates: ${countryCoordinates}`);
console.log(`No coordinates: ${noCoordinates}`);
console.log("GlobeWave station import complete.");
