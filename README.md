# Terrain Data Downloader

A CloudTAK plugin that downloads public elevation data and OpenStreetMap line data (roads, trails and, if you choose, railways, rivers and more) for the US states you tick in a checklist, converts them into the formats CloudTAK uses natively, and imports them as server-wide CloudTAK layers. The terrain powers 3D terrain, elevation readouts and slope shading. The snapping layer lets the line tool snap to the lines you selected. Only CloudTAK system administrators can use it.

**Minimum CloudTAK: v13.124.0**. Built and verified against CloudTAK v13.124.0 (commit 5cb43c9, 2026-11-20). No upper limit: newer CloudTAK versions are expected to work. Report breakage as an issue.

## What it does

| | Terrain | Snapping |
|---|---|---|
| Source | [AWS Open Data Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium PNG, built from USGS 3DEP, NASA SRTM, GMTED2010 and ETOPO1) | [BBBike](https://data.bbbike.org/osm/region/north-america/us/) weekly per-state OSM extracts (PMTiles, Shortbread schema) |
| Processing | Fetches every tile covering the state boundary from z0 up to the detail level you pick | Keeps only LineStrings in the [categories you select](#snapping-categories), merged from the relevant Shortbread layers. Everything else (buildings, labels, unselected lines) is dropped, because the snapper grabs every line left in the layer |
| Stored as | One `raster-dem` PMTiles archive (Terrarium encoding) | One vector PMTiles archive with a single `out` layer (CloudTAK's own import layer name, so the default vector style renders it). Each line keeps its OSM attributes plus a `category` field |
| Registered as | One permanent server overlay, type `raster-dem`, encoding `terrarium`, set as CloudTAK's default terrain | One permanent server overlay, type `vector`, `snapping_enabled: true`, `snapping_layer: out`, no collection, so it appears in the line tool's snapping list |

### Snapping categories

CloudTAK's line tool asks the tileset for *every* LineString in a tile (`?type=LineString`, no layer filter). Whatever is in the snapping layer becomes snappable, so you choose its contents when you download:

| Category | Default | Shortbread source |
|---|---|---|
| Roads | ✓ | `streets`: motorway → residential, links, busways |
| Service roads | ✓ | `streets` kind `service`: driveways, parking aisles, alleys |
| Tracks | ✓ | `streets` kind `track`: forest, farm and 4x4 tracks |
| Trails & paths | ✓ | `streets` kinds `path`, `footway`, `cycleway`, `bridleway`, `steps`, `pedestrian` |
| Railways | ✓ | `streets` rail kinds / `rail=true` |
| Rivers & canals | | `water_lines` kinds `river`, `canal` |
| Streams & ditches | | `water_lines` kinds `stream`, `ditch`, `drain` |
| Runways & taxiways | | `streets` kinds `runway`, `taxiway` |
| Ferry routes | | `ferries` |
| Aerialways | | `aerialways`: ski lifts, gondolas |
| Piers, breakwaters & dams | | `pier_lines`, `dam_lines` |
| State & national boundaries | | `boundaries` |

The label layers (`street_labels`, `water_lines_labels`) duplicate geometry and are never included. Every line belongs to exactly one category; the smoke test checks this on real data.

### Why these formats

These choices come from reading CloudTAK's source rather than guessing:

- **CloudTAK has no DTED reader.** Its terrain is a MapLibre `raster-dem` tile source in Terrarium or Mapbox encoding (`api/common/enums.ts` `BasemapTerrain_Encoding`). The file importer (`tasks/events`) turns GeoTIFFs into *visual* raster tiles, not elevation tiles. So the plugin produces Terrarium tiles directly. The z12 level (~30 m) is equivalent to DTED Level 2 / SRTM 1-arc-second resolution. The sources are the same USGS 3DEP and SRTM data DTED products are made from. Real DTED files need a USGS EarthExplorer login and would still need converting before CloudTAK could use them.
- **Snapping only works on hosted PMTiles.** `POST /api/basemap` rejects snapping unless the URL is on CloudTAK's PMTiles server (`config.PMTILES_URL`). The line tool also requests `…/tiles/{z}/{x}/{y}/features?type=LineString` at the layer's maxzoom (`app/src/stores/modules/draw.ts`). That route shape only exists for **Hosted Tilesets** (`public/` in the asset bucket), so both outputs are written there.
- **The download runs server side.** BBBike sends no CORS headers. CloudTAK's Plugin Proxy caps responses at 1 MB / 15 s and does not forward `Range`. State extracts run to hundreds of MB, so the plugin's API route streams them straight from the source into CloudTAK's bucket and nothing large passes through the browser.

### Master layers: one terrain layer, one snapping layer

Everything you download ends up in exactly **one terrain layer and one snapping layer**, however many states and batches you add.

- Each master is a CloudTAK basemap that **keeps the same id forever**. A job builds a new data file, repoints the basemap at it (`PATCH /api/basemap/:id`), and deletes the old file. Users' overlays reference the basemap id (`/api/basemap/:id/tiles`), so everyone follows each update and the defaults never have to change.
- The terrain master is always CloudTAK's **Default Terrain** (`map::terrain`). The snapping master appears in the line tool's snapping list; there is no default snapping layer, so users choose it each time they draw a line.
- CloudTAK uses one active terrain at a time and snaps to one layer at a time, so a single layer per type is what works seamlessly across state lines.
- Registration, defaults and cleanup happen on the server, through CloudTAK's own `/api/basemap` and `/api/config` endpoints, as the admin who started the job. A job finishes correctly even if the page is closed.

| Scenario | Terrain master | Snapping master |
|---|---|---|
| New states (any batch) | Added. Tiles already in the layer are reused; only the new areas are downloaded | Added. The new states' OSM extracts are downloaded |
| A state downloaded again | Nothing to do (terrain source data is static) | That state's latest weekly OSM extract is downloaded and replaces its data |
| Detail level changed | Every state rebuilt at the new level, reusing overlapping tiles | Untouched |
| Snapping categories changed | Untouched | Rebuilt from cached per-state data (all 12 categories are kept in the cache), **no re-download** |
| States removed (**Remove**) | Rebuilt without them (if Download Terrain is on) | Rebuilt without them, their cache deleted (if Download Snapping is on) |
| Last state removed | Layer deleted, default terrain cleared | Layer deleted |
| Several jobs queued | Jobs run one at a time, each on top of the previous result | Same |
| Job cancelled or failed | The previous layer stays live | Same |
| Layers from plugin v1.0–1.2 | States read from the old file names and merged in; old layers deleted | Same |

Border tiles shared by neighbouring states are merged at the vector-tile level and duplicate features removed. State lists, detail level and categories are stored in `plugins/terrain-data-downloader/settings.json` in the asset bucket, and per-state snapping caches in `plugins/terrain-data-downloader/cache/`.

## How to use

1. Open **Menu → Terrain Data Downloader** (CloudTAK system administrators only, see [Admin only](#admin-only)).
2. **In CloudTAK** at the top shows the current terrain and snapping layers: their states, detail level, categories, size and default status.
3. Tick states to download. States already in a layer are marked with a mountain (terrain) or route (snapping) icon.
4. Switch **Download Terrain** and/or **Download Snapping** on or off. The detail level and categories start from the current layers. Changing them shows a note when every state will be rebuilt. With no states ticked, **Apply changes** rebuilds the layers with the new detail or categories.
5. The plan line says exactly what will happen ("Terrain: 6 states at High detail, ~120 MB to download"). Press **Download** or **Apply changes**. You can leave the page; the job keeps running on the server and the page resumes it when reopened.
6. To take states out, tick them and press **Remove**. It removes from the layers whose switch is on, and the button says which: **Remove from both**, **Remove from terrain**, or **Remove from snapping**. For example, to drop only a state's snapping data, switch **Download Terrain** off first. Removals keep each layer's current detail level and categories.
7. When a job finishes, the page updates your own map straight away (no reload needed). Other users get the new data the next time they load CloudTAK. Snapping layer changes show up the next time anyone starts drawing a line.

### Defaults

| | How it works | Who gets it |
|---|---|---|
| Default terrain | The terrain master is always CloudTAK's own **Default Terrain** (`map::terrain`, also shown in Admin → Config → Map) | CloudTAK adds it as a terrain overlay for new users and for existing users who have no terrain overlay yet. Users who already chose another terrain keep theirs. Because the master keeps its id, users who have it get every update |

There is **no default snapping layer**: CloudTAK's line tool opens on "No Snapping" and users pick the snapping layer from its list each time they draw a line.

The snapping master is created **without a collection**. CloudTAK's line tool lists snapping layers with a query that only matches basemaps whose `collection` is empty, so a snapping layer inside a collection never appears in the dropdown.

### Admin only

Enforced the same way as ValleyTacticalSolutions' Sidebar Configurator and Quick Point Dropper:

- The menu entry uses CloudTAK's `requiresSystemAdmin` (with the `A` admin badge), so it is hidden from everyone else.
- Every plugin API route requires a CloudTAK system administrator. For non-admins the plugin adds nothing at all: no menu entry, no routes they can call, and no code that changes their map or line tool.

Detail levels and rough terrain sizes (about 55 KB per tile):

| Level | Ground resolution | Delaware | Georgia | Texas |
|---|---|---|---|---|
| z10 | ~120 m | 131 tiles | | |
| z12 (recommended) | ~30 m | 434 tiles (~24 MB) | 5,508 tiles (~0.3 GB) | 17,823 tiles (~1 GB) |
| z13 | ~15 m | 1,086 tiles | | |

A single job is limited to 250,000 terrain tiles. Large states such as Alaska need z10–z11.

## TAK Portal Marketplace

### Configuration required

1. **CloudTAK API image rebuild.** The plugin adds an API route (`server/plugin-terrain-data-downloader.ts` → `api/stateless/routes/`). TAK Portal copies it and rebuilds on install. Manual installs must rebuild the API image too.
2. **Outbound HTTPS from the CloudTAK API container** to `data.bbbike.org` (state boundaries and OSM extracts) and `s3.amazonaws.com` (Terrain Tiles). No browser CSP change is needed, because the browser only talks to CloudTAK's own API. **No Plugin Proxy configuration is needed.**
3. **Temporary disk space in the API container.** Jobs work in the OS temp directory (`/tmp` in the container). A snapping rebuild stages every state's cached data plus one fresh OSM extract; a terrain rebuild stages the current and new terrain files. Allow roughly 2× the size of both master layers plus 3× the largest state extract being downloaded (about 5 GB for California).
4. **Single API instance.** Job status is kept in memory on the API process that started the job. That is the standard single-container docker-compose deployment. Behind a load balancer with several API tasks, progress polling can land on a different task. Finished files are still written to the bucket and listed under **Admin → Hosted Tilesets**.
5. After install: **Settings → Refresh App** in CloudTAK (a normal browser refresh is not enough).

**Troubleshooting:** if the page says *Plugin server routes are not installed*, the browser half is installed but the CloudTAK API is not running this plugin's route (CloudTAK answers `API endpoint does not exist!`). Make sure `server/plugin-terrain-data-downloader.ts` is in `api/stateless/routes/` and the **API image was rebuilt and restarted**. If it says *CloudTAK system administrators only*, the signed-in account is not a system admin.

### Catalog entry
```json
{
  "id": "terrain-data-downloader",
  "name": "Terrain Data Downloader",
  "description": "Download US state terrain (elevation) and customizable OSM snapping data into CloudTAK. Admin only.",
  "repo": "https://github.com/ValleyTacticalSolutions/cloudtak-plugin-terrain-data-downloader.git",
  "ref": "main",
  "added": "2026-11-20",
  "maintainer": "ValleyTacticalSolutions",
  "web": { "source": "plugin", "dest": "terrain-data-downloader" },
  "routes": { "source": "server" },
  "exclude": ["test"],
  "additionalActions": [
    {
      "title": "Allow outbound HTTPS from the CloudTAK API",
      "text": "The plugin's API route downloads data server side from two public hosts.",
      "instructions": [
        "Make sure the CloudTAK API container can reach https://data.bbbike.org and https://s3.amazonaws.com (firewall, proxy or egress rules).",
        "No browser CSP or Plugin Proxy changes are needed."
      ]
    },
    {
      "title": "Provide temporary disk space",
      "text": "Jobs stage downloads in the API container's /tmp before uploading to the asset bucket.",
      "instructions": [
        "Allow about 3x the largest selected state's OSM extract (about 5 GB for California).",
        "Run a single CloudTAK API instance, because job progress is kept in that process's memory."
      ]
    },
    {
      "title": "Refresh CloudTAK",
      "text": "Load the new menu entry.",
      "instructions": ["After install, open CloudTAK Settings and choose Refresh App."]
    }
  ],
  "detect": ["api/web/plugins/terrain-data-downloader/index.ts", "app/plugins/terrain-data-downloader/index.ts"]
}
```
<!-- Requires CloudTAK v13.124.0 or newer (catalog has no version field; this note is for reviewers). -->

To list it: submit the repo URL through TAK Portal's CloudTAK Marketplace plugin request form, or open an issue/PR on ValleyTacticalSolutions/TAK-Portal adding the entry to `catalog/cloudtak-plugins.json`.

## Manual install (without TAK Portal)

```bash
CT=/path/to/CloudTAK
mkdir -p "$CT/app/plugins/terrain-data-downloader"
cp -a plugin/. "$CT/app/plugins/terrain-data-downloader/"
cp server/*.ts "$CT/api/stateless/routes/"
# rebuild and redeploy the CloudTAK API image, then Settings -> Refresh App
```

`WEB_PLUGINS=<git url>` alone is **not** enough: CloudTAK's `api/bin/plugin.ts` installs only the web half, and the server route must be copied as shown above.

## Core imports

The web half uses these CloudTAK internals. Check them on CloudTAK upgrades:

- `../../plugin.ts` (`PluginAPI`, `PluginInstance`): `routes.add`, `menu.add/remove`, `profile.get('system_admin')`, `pinia`
- `../../src/components/CloudTAK/util/MenuTemplate.vue`
- `../../../src/std.ts` (`std`)
- `../../../src/stores/map.ts` (`useMapStore`): `reconcileOverlays()` (live terrain refresh)
- `../../../src/base/overlay.ts` (`OverlayManager`): `sync`, `loaded`, `loadedByMode`, `createLoaded`, `deleteLoaded`, overlay `update({ visible })`, used to show the rebuilt terrain without a reload

The browser only calls this plugin's own API routes.

The server half uses `../../common/auth.js` (`Auth.as_user(..., { admin: true })`), `../../common/aws/s3.js` (`S3.put`, `S3.get`, `S3.exists`, `S3.del`), `config.models.Basemap.list` (finding layers from earlier plugin versions), `config.models.Setting.typed('map::terrain')`, `config.SigningSecret` / `API_URL` / `PMTILES_URL`, and `jsonwebtoken`. It registers layers by calling CloudTAK's own `POST/PATCH/DELETE /api/basemap` and `PUT /api/config` with a server-minted admin token for the job's user, the same way CloudTAK's import worker calls the API.

## Plugin API routes

All routes require a CloudTAK system administrator.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/plugin/terrain-data-downloader/states` | State list |
| GET | `/api/plugin/terrain-data-downloader/categories` | Snapping categories |
| GET | `/api/plugin/terrain-data-downloader/status` | Master layers, defaults, layers from earlier versions |
| POST | `/api/plugin/terrain-data-downloader/plan` | What a request would change, with download estimates |
| POST | `/api/plugin/terrain-data-downloader/job` | Queue a change: `{ add, remove, terrain: { enabled, maxzoom }, snapping: { enabled, categories } }` (one job runs at a time) |
| GET | `/api/plugin/terrain-data-downloader/job[/:id]` | Job status / recent jobs |
| DELETE | `/api/plugin/terrain-data-downloader/job/:id` | Cancel |

## Development

```bash
# Builds the plugin inside a CloudTAK checkout exactly like the image build
# (app lint, vue-tsc, vite build, API oxlint + tsc), then runs the data smoke test.
bash verify-cloudtak.sh                 # fresh clone of CloudTAK main
CT_DIR=/path/to/CloudTAK bash verify-cloudtak.sh
```

`test/smoke.mjs` downloads Delaware's data and checks the output with the official `pmtiles` and `@mapbox/vector-tile` readers. It covers tile IDs, Range-based zip extraction, snapping categories (each category exclusive, all categories adding up to the whole), border-tile merging, byte-identical terrain tiles, and leaf directories.

## Data licensing

- Terrain Tiles: AWS Open Data / Mapzen. Underlying data from USGS 3DEP (public domain), NASA SRTM, GMTED2010 and ETOPO1. See the [attribution requirements](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
- Roads/trails: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). Extracts by [BBBike.org](https://extract.bbbike.org/community.html), a donation-funded service: please download responsibly.

## License

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`), the same license as CloudTAK.
