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
        headers: { "User-Agent": "World-FM-Own-API-Importer/1.0" }
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last || new Error("All mirrors failed");
}

console.log("Downloading the global station directory...");
const countries = await get("/json/countries?order=name");
const usable = countries.filter(c => c.iso_3166_1 && c.stationcount > 0);

const all = [];
for (let i = 0; i < usable.length; i++) {
  const c = usable[i];
  process.stdout.write(`\r[${i + 1}/${usable.length}] ${c.name}                    `);
  try {
    const rows = await get(`/json/stations/bycountrycodeexact/${encodeURIComponent(c.iso_3166_1)}?hidebroken=true&order=clickcount&reverse=true&limit=500`);
    for (const s of rows) {
      if (s.url_resolved || s.url) {
        all.push({
          stationuuid: s.stationuuid,
          name: s.name || "",
          country: s.country || c.name || "",
          countrycode: s.countrycode || c.iso_3166_1,
          language: s.language || "",
          tags: s.tags || "",
          codec: s.codec || "",
          bitrate: s.bitrate || 0,
          url_resolved: s.url_resolved || s.url || "",
          homepage: s.homepage || "",
          favicon: s.favicon || "",
          latitude: Number.isFinite(Number(s.geo_lat)) ? Number(s.geo_lat) : null,
          longitude: Number.isFinite(Number(s.geo_long)) ? Number(s.geo_long) : null
        });
      }
    }
  } catch (e) {
    console.error(`\nSkipped ${c.name}: ${e.message}`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
console.log(`\nSaved ${all.length} stations to ${OUT}`);
