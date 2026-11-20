/**
 * End-to-end smoke test of the server pipeline against real public data (Delaware).
 *
 *   node test/smoke.mjs <CloudTAK checkout with api built to api/dist> <work dir>
 *
 * Verifies with independent readers from CloudTAK's app/node_modules:
 *   - zxyToTileId matches the official pmtiles implementation
 *   - BBBike zip entry extracted over HTTP Range is byte-identical to the archive member
 *   - filtered snapping archive opens in pmtiles, has a single `out` layer of LineStrings, no rail
 *   - merged border tiles decode and de-duplicate
 *   - terrain archive opens in pmtiles and returns byte-identical Terrarium PNGs
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [ct, work] = process.argv.slice(2);
if (!ct || !work) throw new Error('usage: node test/smoke.mjs <CloudTAK> <workdir>');
await fsp.mkdir(work, { recursive: true });

const appRequire = createRequire(path.join(ct, 'app/package.json'));
const pmtiles = await import(pathToFileURL(appRequire.resolve('pmtiles')).href);
const { VectorTile } = await import(pathToFileURL(appRequire.resolve('@mapbox/vector-tile')).href);
const pbfMod = await import(pathToFileURL(appRequire.resolve('pbf')).href); const Pbf = pbfMod.default ?? pbfMod.PbfReader;
const mod = await import(pathToFileURL(path.join(ct, 'api/dist/stateless/routes/plugin-terrain-data-downloader.js')).href);
const T = mod.__test;

class FileSource {
    constructor(file) { this.file = file; this.fd = fs.openSync(file, 'r'); }
    getKey() { return this.file; }
    async getBytes(offset, length) {
        const buf = Buffer.alloc(length);
        fs.readSync(this.fd, buf, 0, length, offset);
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
    }
}

function sha(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

// 1. Hilbert tile ids
for (let i = 0; i < 5000; i++) {
    const z = Math.floor(Math.random() * 16);
    const x = Math.floor(Math.random() * 2 ** z);
    const y = Math.floor(Math.random() * 2 ** z);
    assert.equal(T.zxyToTileId(z, x, y), pmtiles.zxyToTileId(z, x, y), `tileId mismatch z${z}/${x}/${y}`);
    assert.equal(T.tileIdZoom(pmtiles.zxyToTileId(z, x, y)), z);
}
console.log('ok - zxyToTileId matches pmtiles for 5000 random tiles');

// 2. Range-based zip extraction
const zipUrl = 'https://data.bbbike.org/osm/pmtiles/region/north-america/us/delaware/delaware.osm.pmtiles-shortbread.zip';
const src = path.join(work, 'delaware-src.pmtiles');
await T.downloadZipEntry(zipUrl, '.pmtiles', src, () => {}, () => false);
const srcHeader = T.decodeHeader(fs.readFileSync(src).subarray(0, 127));
assert.equal(srcHeader.tileType, T.PM_TILETYPE.mvt);
console.log(`ok - extracted ${(fs.statSync(src).size / 1e6).toFixed(1)} MB Shortbread archive over HTTP Range (${srcHeader.tileEntries} entries)`);

// 3. Filter snapping lines (default categories)
const DEFAULT_CATS = new Set(T.SNAP_CATEGORIES.filter((c) => c.default).map((c) => c.id));
const fh = await fsp.open(src, 'r');
const writer = await T.TileWriter.open(path.join(work, 'de-snap.data'));
const kinds = new Map();
let kept = 0;
let scanned = 0;
const rawByZ = new Map();
for await (const e of T.pmtilesEntries(fh, srcHeader)) {
    scanned++;
    const mvt = T.decompress(await T.readAt(fh, srcHeader.dataOffset + e.offset, e.length), srcHeader.tileCompression);
    const out = T.filterSnapTile(mvt, DEFAULT_CATS);
    if (!out) continue;
    kept++;
    const z = T.tileIdZoom(e.tileId);
    rawByZ.set(z, (rawByZ.get(z) || 0) + 1);
    for (let i = 0; i < e.runLength; i++) await writer.add(e.tileId + i, out);
}
await fh.close();
const store = await writer.close();
console.log(`ok - scanned ${scanned} source entries, ${kept} contain roads/trails; zooms with data:`, Object.fromEntries([...rawByZ].sort((a, b) => a[0] - b[0])));

// gzip bodies like writeSnap does
const gzWriter = await T.TileWriter.open(path.join(work, 'de-snap-gz.data'));
const rfh = await fsp.open(store.file, 'r');
for (const e of store.entries.slice().sort((a, b) => a.tileId - b.tileId)) {
    await gzWriter.add(e.tileId, zlib.gzipSync(await T.readAt(rfh, e.offset, e.length)));
}
await rfh.close();
const gzStore = await gzWriter.close();
const snapOut = path.join(work, 'tdd-roads-de.pmtiles');
const written = await T.writePMTiles(gzStore, snapOut, {
    tileType: T.PM_TILETYPE.mvt,
    tileCompression: T.PM_COMPRESSION.gzip,
    bounds: [-75.79, 38.45, -75.04, 39.84],
    metadata: { name: 'test', vector_layers: [{ id: 'out', fields: {} }] },
});
console.log(`ok - wrote snapping archive ${(written.bytes / 1e6).toFixed(1)} MB (source ${(fs.statSync(src).size / 1e6).toFixed(1)} MB), z${written.minZoom}-${written.maxZoom}`);

const p = new pmtiles.PMTiles(new FileSource(snapOut));
const h = await p.getHeader();
assert.equal(h.tileType, pmtiles.TileType.Mvt);
assert.equal(h.maxZoom, 14);
const meta = await p.getMetadata();
assert.equal(meta.vector_layers[0].id, 'out');

// Wilmington, DE at z14
const wx = Math.floor((-75.5466 + 180) / 360 * 2 ** 14);
const wy = Math.floor((1 - Math.log(Math.tan(39.7391 * Math.PI / 180) + 1 / Math.cos(39.7391 * Math.PI / 180)) / Math.PI) / 2 * 2 ** 14);
const tile = await p.getZxy(14, wx, wy);
assert.ok(tile, 'Wilmington z14 tile missing');
const vt = new VectorTile(new Pbf(new Uint8Array(Buffer.from(tile.data))));
assert.deepEqual(Object.keys(vt.layers), ['out']);
const layer = vt.layers.out;
for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    assert.equal(f.type, 2, 'non-LineString kept');
    const k = String(f.properties.kind);
    assert.ok(!['runway', 'taxiway'].includes(k), `non-default kind kept: ${k}`);
    assert.ok(DEFAULT_CATS.has(String(f.properties.category)), `bad category ${f.properties.category}`);
    kinds.set(k, (kinds.get(k) || 0) + 1);
    f.loadGeometry();
}
assert.ok(DEFAULT_CATS.has('railways') && [...kinds.keys()].some((k) => k === 'rail'), 'railways are a default category and Wilmington has rail');
console.log(`ok - Wilmington z14 tile decodes: ${layer.length} LineStrings, kinds`, Object.fromEntries(kinds));

// Category isolation: each category alone contains only itself, and the parts add up to the whole
const anyTile = Buffer.from(tile.data);
const srcPm = new pmtiles.PMTiles(new FileSource(src));
const ALL = new Set(T.SNAP_CATEGORIES.map((c) => c.id));
const totals = Object.fromEntries([...ALL].map((c) => [c, 0]));
let wholeTotal = 0;
const decodeOut = (buf) => (buf ? new VectorTile(new Pbf(new Uint8Array(buf))).layers.out : null);
for (let x = wx - 12; x <= wx + 12; x += 2) for (let y = wy - 40; y <= wy + 60; y += 4) {
    const st = await srcPm.getZxy(14, x, y);
    if (!st) continue;
    const mvt = Buffer.from(st.data);
    const whole = decodeOut(T.filterSnapTile(mvt, ALL));
    wholeTotal += whole ? whole.length : 0;
    let parts = 0;
    for (const id of ALL) {
        const l = decodeOut(T.filterSnapTile(mvt, new Set([id])));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
            assert.equal(l.feature(i).properties.category, id, `category ${id} leaked ${l.feature(i).properties.category}`);
            assert.equal(l.feature(i).type, 2);
        }
        totals[id] += l.length;
        parts += l.length;
    }
    assert.equal(parts, whole ? whole.length : 0, `tile 14/${x}/${y}: categories overlap or drop features`);
}
assert.equal(T.filterSnapTile(srcMvtOrEmpty(), new Set()), null);
for (const must of ['roads', 'service', 'trails', 'railways', 'rivers', 'streams', 'boundaries']) assert.ok(totals[must] > 0, `no ${must} found in sample`);
console.log(`ok - ${ALL.size} categories are exclusive and complete over ${wholeTotal} sampled lines:`, totals);
function srcMvtOrEmpty() { return Buffer.alloc(0); }

// 4. Merge border tiles (merge a tile with itself -> all features de-duplicated)
const merged = T.mergeOutTiles([anyTile, anyTile]);
const mvt2 = new VectorTile(new Pbf(new Uint8Array(merged)));
assert.equal(mvt2.layers.out.length, layer.length, 'merge did not de-duplicate identical features');
for (let i = 0; i < mvt2.layers.out.length; i++) {
    assert.equal(mvt2.layers.out.feature(i).properties.kind, layer.feature(i).properties.kind);
}
console.log('ok - merged tile decodes, duplicates removed, tags remapped correctly');

// 5. Terrain: plan and build a low-zoom archive, compare bytes to upstream
const de = T.STATE_BY_SLUG.get('delaware');
const plan12 = await T.planTerrain([de], 12);
const plan13 = await T.planTerrain([de], 13);
console.log(`ok - Delaware terrain plan: z12 ${plan12.tiles.length} tiles, z13 ${plan13.tiles.length} tiles, bounds ${plan12.bounds.map((n) => n.toFixed(2))}`);
const ga = await T.planTerrain([T.STATE_BY_SLUG.get('georgia')], 12);
const ak = await T.planTerrain([T.STATE_BY_SLUG.get('alaska')], 10);
const tx = await T.planTerrain([T.STATE_BY_SLUG.get('texas')], 12);
console.log(`ok - plans: Georgia z12 ${ga.tiles.length}, Alaska z10 ${ak.tiles.length}, Texas z12 ${tx.tiles.length}`);

const small = await T.planTerrain([de], 10);
const tw = await T.TileWriter.open(path.join(work, 'terrain.data'));
const upstream = new Map();
for (const t of small.tiles) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${t.z}/${t.x}/${t.y}.png`);
    assert.ok(res.ok);
    const body = Buffer.from(await res.arrayBuffer());
    upstream.set(`${t.z}/${t.x}/${t.y}`, sha(body));
    await tw.add(t.id, body);
}
const tstore = await tw.close();
const terrOut = path.join(work, 'tdd-terrain-de.pmtiles');
await T.writePMTiles(tstore, terrOut, {
    tileType: T.PM_TILETYPE.png,
    tileCompression: T.PM_COMPRESSION.none,
    bounds: small.bounds,
    metadata: { encoding: 'terrarium' },
});
const tp = new pmtiles.PMTiles(new FileSource(terrOut));
const th = await tp.getHeader();
assert.equal(th.tileType, pmtiles.TileType.Png);
assert.equal(th.minZoom, 0);
assert.equal(th.maxZoom, 10);
for (const t of small.tiles) {
    const got = await tp.getZxy(t.z, t.x, t.y);
    assert.ok(got, `missing terrain ${t.z}/${t.x}/${t.y}`);
    assert.equal(sha(Buffer.from(got.data)), upstream.get(`${t.z}/${t.x}/${t.y}`));
}
console.log(`ok - terrain archive (${small.tiles.length} tiles z0-10) reads back byte-identical in pmtiles`);

// 6. Force leaf directories with many synthetic entries
const lw = await T.TileWriter.open(path.join(work, 'leaf.data'));
for (let i = 0; i < 60000; i++) await lw.add(pmtiles.zxyToTileId(14, 4000 + (i % 300), 6000 + Math.floor(i / 300)), Buffer.from(String(i)));
const lstore = await lw.close();
const leafOut = path.join(work, 'leaf.pmtiles');
await T.writePMTiles(lstore, leafOut, { tileType: T.PM_TILETYPE.png, tileCompression: T.PM_COMPRESSION.none, bounds: [-1, -1, 1, 1], metadata: {} });
const lp = new pmtiles.PMTiles(new FileSource(leafOut));
assert.ok((await lp.getHeader()).leafDirectoryLength > 0, 'expected leaf directories');
for (const i of [0, 1, 29999, 59999]) {
    const got = await lp.getZxy(14, 4000 + (i % 300), 6000 + Math.floor(i / 300));
    assert.equal(Buffer.from(got.data).toString(), String(i));
}
console.log('ok - 60k-entry archive with leaf directories reads back correctly');

// 7. Master-layer scenario logic (what each request does to the master layers)
{
    const ALLC = T.SNAP_CATEGORIES.map((c) => c.id);
    const DEF = T.SNAP_CATEGORIES.filter((c) => c.default).map((c) => c.id);
    const req = (o = {}) => ({ add: [], remove: [], terrain: { enabled: true, maxzoom: 12 }, snapping: { enabled: true, categories: DEF }, ...o });
    const empty = { snapping: null, terrain: null, snap: null };
    const have = {
        snapping: 2,
        terrain: { basemap: 1, file: 'tdd-terrain-x', states: ['delaware', 'maryland'], maxzoom: 12, bytes: 1, updated: 'a' },
        snap: { basemap: 2, file: 'tdd-snap-x', states: ['delaware', 'maryland'], categories: DEF, bytes: 1, updated: 'a' },
    };
    const sorted = (a) => [...a].sort();
    let t;

    t = T.target(req({ add: ['delaware'] }), empty, []);
    assert.ok(t.terrain.touched && t.snap.touched, 'first download touches both');
    assert.deepEqual(t.terrain.states, ['delaware']);
    assert.equal(t.snap.refresh.size, 0, 'first download is not a refresh');

    t = T.target(req({ add: ['virginia'] }), have, []);
    assert.deepEqual(sorted(t.terrain.states), ['delaware', 'maryland', 'virginia'], 'new batch is added to the master');
    assert.deepEqual(sorted(t.snap.states), ['delaware', 'maryland', 'virginia']);

    t = T.target(req({ add: ['delaware'] }), have, []);
    assert.equal(t.terrain.touched, false, 'terrain for an existing state at the same detail is a no-op');
    assert.ok(t.snap.touched && t.snap.refresh.has('delaware'), 're-downloading a state refreshes its snapping data');

    t = T.target(req({ terrain: { enabled: true, maxzoom: 13 } }), have, []);
    assert.ok(t.terrain.touched && t.terrain.maxzoom === 13, 'detail change rebuilds terrain');
    assert.equal(t.snap.touched, false, 'detail change leaves snapping alone');

    t = T.target(req({ snapping: { enabled: true, categories: ALLC } }), have, []);
    assert.ok(t.snap.touched && t.snap.refresh.size === 0, 'category change rebuilds snapping without re-downloading');
    assert.equal(t.terrain.touched, false);

    t = T.target(req({ remove: ['delaware'], terrain: { enabled: false, maxzoom: 12 }, snapping: { enabled: false, categories: DEF } }), have, []);
    assert.deepEqual(t.terrain.states, ['maryland'], 'remove takes a state out of terrain');
    assert.deepEqual(t.snap.states, ['maryland'], 'remove takes a state out of snapping');
    assert.ok(t.terrain.touched && t.snap.touched);
    assert.equal(t.terrain.maxzoom, 12, 'remove keeps the current detail');
    assert.deepEqual(t.snap.categories, DEF, 'remove keeps the current categories');

    t = T.target(req({ remove: ['delaware', 'maryland'], terrain: { enabled: false, maxzoom: 12 }, snapping: { enabled: false, categories: DEF } }), have, []);
    assert.deepEqual(t.terrain.states, [], 'removing every state empties the layer (it is deleted)');
    assert.ok(t.terrain.touched && t.snap.touched);

    t = T.target(req({ add: ['ohio'], snapping: { enabled: false, categories: DEF } }), have, []);
    assert.ok(t.terrain.touched && !t.snap.touched, 'terrain-only batch leaves snapping untouched');

    const legacy = [{ id: 7, name: 'old', type: 'raster-dem', file: 'tdd-terrain-z13-tn-20261120-2135', states: ['tennessee'] }];
    t = T.target(req({ add: ['ohio'] }), empty, legacy);
    assert.deepEqual(sorted(t.terrain.states), ['ohio', 'tennessee'], 'states from an earlier-version layer are adopted into the master');

    assert.deepEqual(T.statesFromLegacyFile('tdd-terrain-z13-tn-20261120-2135'), ['tennessee']);
    assert.deepEqual(sorted(T.statesFromLegacyFile('tdd-snap-co-ut-20261120-2143')), ['colorado', 'utah']);
    assert.deepEqual(T.statesFromLegacyFile('tdd-roads-7states-20261120-2143'), []);
    assert.equal(T.fileFromUrl('https://tiles.x/tiles/public/tdd-snap-tn-20261120-2143/tiles/{z}/{x}/{y}.mvt'), 'tdd-snap-tn-20261120-2143');
    console.log('ok - master-layer scenarios: first download, new batch, re-download, detail change, category change, remove, remove-all, terrain-only, legacy adoption');
}

// 8. Category filtering of cached tiles (snapping rebuild without re-download)
{
    const srcMvt = Buffer.from((await srcPm.getZxy(14, wx, wy)).data);
    const all = T.filterSnapTile(srcMvt, new Set(T.SNAP_CATEGORIES.map((c) => c.id)));
    const roadsOnly = T.mergeOutTiles([all], new Set(['roads']));
    const l = decodeOut(roadsOnly);
    assert.ok(l && l.length > 0);
    for (let i = 0; i < l.length; i++) assert.equal(l.feature(i).properties.category, 'roads');
    assert.equal(T.mergeOutTiles([all], new Set(['aerialways'])), null, 'no matching category -> no tile');
    console.log(`ok - cached tile re-filtered to roads only (${l.length} lines), empty result returns null`);
}

console.log('PASS');
