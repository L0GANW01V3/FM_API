# World FM API

API-only Node.js service for the Expo/React Native World FM app.

## Render
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- No database or environment variable is required.

## Endpoints

- `GET /api/health`
- `GET /api/countries`
- `GET /api/stations`
- `GET /api/stations/:id`

### Station query parameters

- `q=bollywood`
- `country=India`
- `countryCode=IN`
- `language=English`
- `codec=MP3`
- `tag=rock`
- `sort=name|votes|bitrate`
- `page=1`
- `limit=50` (max 200)

Example:
`/api/stations?countryCode=IN&q=bollywood&limit=20`

The bundled station data is served locally by the API. The API does not need to call Radio-Browser for each app request.


## Geographic coordinates
The importer now preserves Radio-Browser `geo_lat` and `geo_long` as `latitude` and `longitude`. After deploying this version, run the importer once to regenerate `data/stations.json` with coordinates.


## GlobeWave coordinate support
Run `node import-radio-browser.js` to rebuild the station database.
The importer uses exact Radio-Browser station coordinates when available.
For stations without coordinates, it uses a country centroid and marks `coordinateSource` as `country`.
Stations with no usable location are marked `coordinateSource: none`.
