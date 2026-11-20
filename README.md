# Terrain Data Downloader

A CloudTAK plugin that downloads public elevation data and OpenStreetMap line data (roads, trails and, if you choose, railways, rivers and more) for the US states you tick in a checklist, converts them into the formats CloudTAK uses natively, and imports them as server-wide CloudTAK layers. The terrain powers 3D terrain, elevation readouts and slope shading. The snapping layer lets the line tool snap to the lines you selected. Only CloudTAK system administrators can use it.

**Minimum CloudTAK: v13.124.0**. Built and verified against CloudTAK v13.124.0 (commit 5cb43c9, 2026-11-20). No upper limit: newer CloudTAK versions are expected to work. Report breakage as an issue.

## What it does

| | Terrain | Snapping |
|---|---|---|
| Source | [AWS Open Data Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium PNG, built from USGS 3DEP, NASA SRTM, GMTED2010 and ETOPO1) | [BBBike](https://data.bbbike.org/osm/region/north-america/us/) weekly per-state OSM extracts (PMTiles, Shortbread schema) |
| Processing | Fetches every tile covering the state boundary from z0 up to the detail level you pick | Keeps only LineStrings in the [categories you select](#snapping-categories), merged from the relevant Shortbread layers. Everything else (buildings, labels, unselected lines) is dropped, because the snapper grabs every line left in the layer |
| Stored as | One `raster-dem` PMTiles archive (Terrarium encoding) | One vector PMTiles archive with a single `out` layer (CloudTAK's own import layer name, so the default vector style renders it). Each line keeps its OSM attributes plus a `category` field |
| Registered as | Server overlay, type `raster-dem`, encoding `terrarium` | Server overlay, type `vector`, `snapping_enabled: true`, `snapping_layer: out` |

### Snapping categories

CloudTAK's line tool asks the tileset for *every* LineString in a tile (`?type=LineString`, no layer filter). Whatever is in the snapping layer becomes snappable, so you choose its contents when you download:

| Category | Default | Shortbread source |
|---|---|---|
| Roads | ✓ | `streets`: motorway → residential, links, busways |
| Service roads | ✓ | `streets` kind `service`: driveways, parking aisles, alleys |
| Tracks | ✓ | `streets` kind `track`: forest, farm and 4x4 tracks |
| Trails & paths | ✓ | `streets` kinds `path`, `footway`, `cycleway`, `bridleway`, `steps`, `pedestrian` |
| Railways | | `streets` rail kinds / `rail=true` |
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

### Multiple states

- **Terrain is always combined into one archive.** CloudTAK applies a single active terrain at a time (`app/src/base/overlay-class.ts`), so one combined layer is the only arrangement that works seamlessly across state lines. Shared border tiles are fetched once.
- **Snapping is combined by default**, with a toggle to keep states separate. CloudTAK's line tool snaps to one chosen layer at a time, so a combined layer lets a route cross a state line. Border tiles present in both extracts are merged at the vector-tile level and duplicate features are removed. Keep them separate if you expect to replace one state's data independently.

## How to use

1. Open **Menu → Terrain Data Downloader** (CloudTAK system administrators only, see [Admin only](#admin-only)).
2. Tick one or more states (filter box, All/None buttons).
3. Choose **Terrain** and its detail level, and/or **Snapping** with the line categories to include (Defaults / All / None shortcuts) and whether to combine states.
   Tick **Make this the CloudTAK default terrain** and/or **Make this the default snapping layer** to apply the defaults as soon as the layers are registered.
4. Check the estimate, then press **Download & import**. Progress and a log are shown. You can leave the page; the job keeps running on the server and the page resumes it when reopened.
5. When the job finishes, the layers are registered automatically in the **Terrain Data Downloader** overlay collection:
   - Users add the terrain from **Overlays**. Snapping layers appear in the line tool's snapping list.
   - The **star** on any imported layer makes it (or stops it being) the default. A filled star marks the current default.
6. The trash icon removes the CloudTAK layer and its hosted tileset. A layer that is currently a default is un-set first.

### Defaults

| | How it works | Who gets it |
|---|---|---|
| Default terrain | Sets CloudTAK's own **Default Terrain** setting (`map::terrain`, also shown in Admin → Config → Map) | CloudTAK adds it as a hidden terrain overlay for new users and for existing users who have no terrain overlay yet. Users who already chose another terrain keep theirs |
| Default snapping layer | CloudTAK has no default-snapping setting (the line tool always opens on "No Snapping"). The plugin stores the choice (`plugins/terrain-data-downloader/settings.json` in the asset bucket) and, for every user, preselects that layer each time the line tool starts | All users with the plugin loaded. They can still pick another layer or "No Snapping" while drawing |

### Admin only

Enforced the same way as ValleyTacticalSolutions' Sidebar Configurator and Quick Point Dropper:

- The menu entry uses CloudTAK's `requiresSystemAdmin` (with the `A` admin badge), so it is hidden from everyone else.
- Every plugin API route that reads jobs or changes anything requires a CloudTAK system administrator. The only exception is `GET /settings`, which any signed-in user can read, because each user's browser needs it to preselect the default snapping layer.

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
3. **Temporary disk space in the API container.** Jobs work in the OS temp directory (`/tmp` in the container). Allow roughly 3× the largest selected state's OSM extract plus the terrain output: about 5 GB for California, and under 100 MB for small states.
4. **Single API instance.** Job status is kept in memory on the API process that started the job. That is the standard single-container docker-compose deployment. Behind a load balancer with several API tasks, progress polling can land on a different task. Finished files are still written to the bucket and listed under **Admin → Hosted Tilesets**.
5. After install: **Settings → Refresh App** in CloudTAK (a normal browser refresh is not enough).

**Troubleshooting:** if the page says *Plugin server routes are not installed*, the browser half is installed but the CloudTAK API is not running this plugin's route. CloudTAK answers unknown `/api/...` paths with the app's `index.html` instead of a 404. Make sure `server/plugin-terrain-data-downloader.ts` is in `api/stateless/routes/` and the **API image was rebuilt and restarted**. If it says *CloudTAK system administrators only*, the signed-in account is not a system admin.

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
- `../../../src/stores/map.ts` (`useMapStore`): `draw.mode`, `draw.snappingOptions`, `draw.snappingLayer`, `draw.route.definitions`, used to preselect the default snapping layer

CloudTAK HTTP endpoints called from the browser: `GET /api/config/tiles`, `GET/PUT /api/config` (`map::terrain`), `GET/POST/DELETE /api/basemap`.

The server half uses `../../common/auth.js` (`Auth.as_user(..., { admin: true })`), `../../common/aws/s3.js` (`S3.put`, `S3.get`, `S3.exists`, `S3.del`), `config.models.Basemap` (`from`, `list`) and `../config.js` (type only).

## Plugin API routes

All routes require a CloudTAK system administrator, except `GET /settings` (any signed-in user).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/plugin/terrain-data-downloader/states` | State list |
| GET | `/api/plugin/terrain-data-downloader/categories` | Snapping categories |
| GET / PUT | `/api/plugin/terrain-data-downloader/settings` | Default snapping layer (`{ "snapping": <basemap id> \| null }`) |
| POST | `/api/plugin/terrain-data-downloader/plan` | Tile count / download size estimate |
| POST | `/api/plugin/terrain-data-downloader/job` | Queue a job (one runs at a time) |
| GET | `/api/plugin/terrain-data-downloader/job[/:id]` | Job status / recent jobs |
| DELETE | `/api/plugin/terrain-data-downloader/job/:id` | Cancel |
| DELETE | `/api/plugin/terrain-data-downloader/file/:name` | Delete a `tdd-*` hosted tileset |

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

MIT
