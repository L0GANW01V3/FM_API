import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "data", "stations.json");

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info"
];

async function get(pathname) {
  let last;
  for (const base of MIRRORS) {
    try {
      const r = await fetch(base + pathname, {
        headers: { "User-Agent": "GlobeWave-FM-API/1.1" }
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last || new Error("All Radio-Browser mirrors failed");
}

async function getCountryCentroids() {
  try {
    const r = await fetch("https://restcountries.com/v3.1/all?fields=cca2,latlng", {
      headers: { "User-Agent": "GlobeWave-FM-API/1.1" }
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const rows = await r.json();
    const map = new Map();
    for (const c of rows) {
      const code = String(c.cca2 || "").toUpperCase();
      const ll = Array.isArray(c.latlng) ? c.latlng : [];
      if (code && ll.length >= 2 && Number.isFinite(Number(ll[0])) && Number.isFinite(Number(ll[1]))) {
        map.set(code, { latitude: Number(ll[0]), longitude: Number(ll[1]) });
      }
    }
    return map;
  } catch (e) {
    console.warn(`\nCountry centroid lookup unavailable: ${e.message}`);
    return new Map();
  }
}

console.log("Downloading the global station directory...");
const countries = await get("/json/countries?order=name");
const usable = countries.filter(c => c.iso_3166_1 && c.stationcount > 0);
const countryCentroids = await getCountryCentroids();

const all = [];
let exactCoordinates = 0;
let countryCoordinates = 0;
let noCoordinates = 0;

for (let i = 0; i < usable.length; i++) {
  const c = usable[i];
  process.stdout.write(`\r[${i + 1}/${usable.length}] ${c.name}                    `);
  try {
    const rows = await get(`/json/stations/bycountrycodeexact/${encodeURIComponent(c.iso_3166_1)}?hidebroken=true&order=clickcount&reverse=true&limit=500`);

    for (const s of rows) {
      if (!(s.url_resolved || s.url)) continue;

      const lat = Number(s.geo_lat);
      const lon = Number(s.geo_long);
      const hasExact = Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      const fallback = countryCentroids.get(String(s.countrycode || c.iso_3166_1).toUpperCase());

      let latitude = null;
      let longitude = null;
      let coordinateSource = "none";

      if (hasExact) {
        latitude = lat;
        longitude = lon;
        coordinateSource = "station";
        exactCoordinates++;
      } else if (fallback) {
        latitude = fallback.latitude;
        longitude = fallback.longitude;
        coordinateSource = "country";
        countryCoordinates++;
      } else {
        noCoordinates++;
      }

      all.push({
        stationuuid: s.stationuuid,
        name: s.name || "",
        country: s.country || c.name || "",
        countrycode: s.countrycode || c.iso_3166_1,
        state: s.state || "",
        language: s.language || "",
        tags: s.tags || "",
        codec: s.codec || "",
        bitrate: s.bitrate || 0,
        url_resolved: s.url_resolved || s.url || "",
        homepage: s.homepage || "",
        favicon: s.favicon || "",
        latitude,
        longitude,
        coordinateSource,
        votes: s.votes || 0,
        lastcheckoktime_iso8601: s.lastcheckoktime_iso8601 || "",
        lastchecktime_iso8601: s.lastchecktime_iso8601 || ""
      });
    }
  } catch (e) {
    console.error(`\nSkipped ${c.name}: ${e.message}`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
console.log(`\nSaved ${all.length} stations to ${OUT}`);
console.log(`Exact station coordinates: ${exactCoordinates}`);
console.log(`Country fallback coordinates: ${countryCoordinates}`);
console.log(`No coordinates: ${noCoordinates}`);
