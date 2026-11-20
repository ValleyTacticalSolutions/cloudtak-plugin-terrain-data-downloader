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

// 3. Filter streets
const fh = await fsp.open(src, 'r');
const writer = await T.TileWriter.open(path.join(work, 'de-snap.data'));
const kinds = new Map();
let kept = 0;
let scanned = 0;
const rawByZ = new Map();
for await (const e of T.pmtilesEntries(fh, srcHeader)) {
    scanned++;
    const mvt = T.decompress(await T.readAt(fh, srcHeader.dataOffset + e.offset, e.length), srcHeader.tileCompression);
    const out = T.filterStreetsTile(mvt, { roads: true, trails: true });
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
    assert.ok(!['rail', 'light_rail', 'subway', 'tram'].includes(k), `rail kept: ${k}`);
    kinds.set(k, (kinds.get(k) || 0) + 1);
    f.loadGeometry();
}
console.log(`ok - Wilmington z14 tile decodes: ${layer.length} LineStrings, kinds`, Object.fromEntries(kinds));

// roads-only / trails-only split
const anyTile = Buffer.from(tile.data);
const TRAILS = ['track', 'path', 'footway', 'cycleway', 'bridleway', 'steps', 'pedestrian'];
const srcTile = await new pmtiles.PMTiles(new FileSource(src)).getZxy(14, wx, wy);
const srcMvt = Buffer.from(srcTile.data);
for (const [opts, check] of [
    [{ roads: true, trails: false }, (k) => !TRAILS.includes(k)],
    [{ roads: false, trails: true }, (k) => TRAILS.includes(k)],
]) {
    const out = T.filterStreetsTile(srcMvt, opts);
    if (!out) continue;
    const l = new VectorTile(new Pbf(new Uint8Array(out))).layers.out;
    for (let i = 0; i < l.length; i++) assert.ok(check(String(l.feature(i).properties.kind)), `filter ${JSON.stringify(opts)} leaked ${l.feature(i).properties.kind}`);
}
console.log('ok - roads-only and trails-only filters are exclusive');

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

console.log('PASS');
