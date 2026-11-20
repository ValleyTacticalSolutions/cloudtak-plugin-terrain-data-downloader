/**
 * Thin client for the plugin's API routes and the CloudTAK core endpoints it uses.
 * All requests go through CloudTAK's std() so the base URL and auth token are handled for us.
 */
import { std } from '../../../src/std.ts';

export const DEST = 'terrain-data-downloader';
// Must start with 'home-menu': CloudTAK only opens the side panel for routes named home-menu*
// (Map.vue noMenuShown). Same convention as Quick Point Dropper / Sidebar Configurator.
export const ROUTE_NAME = 'home-menu-plugin-terrain-data-downloader';
export const MENU_KEY = 'plugin-terrain-data-downloader';
export const COLLECTION = 'Terrain Data Downloader';

const BASE = '/api/plugin/terrain-data-downloader';

export const ROUTES_MISSING = 'Plugin API routes are not installed (404)';

/**
 * std() for this plugin's own routes. A missing route normally comes back as a 404
 * ("API endpoint does not exist!"), but a proxy in front of CloudTAK can answer with an
 * HTML page instead, in which case std() hands back a raw Response rather than JSON.
 * Turn that into a clear error instead of letting the page render undefined data.
 */
async function pstd(url: string, opts: Parameters<typeof std>[1] = {}): Promise<unknown> {
    const res = await std(url, opts);
    if (res instanceof Response) {
        throw new Error(`${ROUTES_MISSING}: ${url} returned ${res.headers.get('Content-Type') || 'a non-JSON response'}`);
    }
    return res;
}

export interface StateItem {
    slug: string;
    abbr: string;
    name: string;
    area: number;
}

export interface SnapCategory {
    id: string;
    label: string;
    description: string;
    default: boolean;
}

export interface JobRequest {
    states: string[];
    terrain: { enabled: boolean; maxzoom: number; makeDefault: boolean };
    snapping: { enabled: boolean; categories: string[]; combine: boolean; makeDefault: boolean };
}

export interface Settings {
    snapping: number | null;
}

export interface Plan {
    terrain: { tiles: number; bytes: number; limit: number };
    snapping: { download: number; states: Array<{ slug: string; download: number }> };
}

export interface JobResult {
    kind: 'terrain' | 'snapping';
    file: string;
    label: string;
    states: string[];
    minzoom: number;
    maxzoom: number;
    bounds: number[];
    bytes: number;
    tiles: number;
    attribution: string;
}

export interface Job {
    id: string;
    status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
    username: string;
    created: string;
    updated: string;
    request: JobRequest;
    step: string;
    progress: number;
    log: string[];
    results: JobResult[];
    error?: string;
}

export interface ManagedBasemap {
    id: number;
    name: string;
    url: string;
    type: string;
    snapping_enabled?: boolean;
    created?: string;
}

export async function listStates(): Promise<StateItem[]> {
    const res = await pstd(`${BASE}/states`) as { items: StateItem[] };
    return res.items;
}

export async function listCategories(): Promise<SnapCategory[]> {
    const res = await pstd(`${BASE}/categories`) as { items: SnapCategory[] };
    return res.items;
}

export async function getSettings(): Promise<Settings> {
    return await pstd(`${BASE}/settings`) as Settings;
}

export async function setDefaultSnapping(id: number | null): Promise<Settings> {
    return await pstd(`${BASE}/settings`, { method: 'PUT', body: { snapping: id } }) as Settings;
}

export async function plan(body: JobRequest): Promise<Plan> {
    return await pstd(`${BASE}/plan`, { method: 'POST', body, timeout: 120_000 }) as Plan;
}

export async function startJob(body: JobRequest): Promise<Job> {
    return await pstd(`${BASE}/job`, { method: 'POST', body }) as Job;
}

export async function listJobs(): Promise<Job[]> {
    const res = await pstd(`${BASE}/job`) as { items: Job[] };
    return res.items;
}

export async function getJob(id: string): Promise<Job> {
    return await pstd(`${BASE}/job/${encodeURIComponent(id)}`) as Job;
}

export async function cancelJob(id: string): Promise<Job> {
    return await pstd(`${BASE}/job/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Job;
}

export async function deleteHostedFile(file: string): Promise<void> {
    await pstd(`${BASE}/file/${encodeURIComponent(file)}`, { method: 'DELETE' });
}

/** Hosted tileset file name a plugin-managed basemap points at, e.g. tdd-terrain-z12-co-2026... */
export function fileFromUrl(url: string): string | null {
    const match = url.match(/\/tiles\/public\/(tdd-[A-Za-z0-9._-]+?)(?:\.pmtiles)?\/tiles\//);
    return match ? match[1] : null;
}

export async function listManaged(): Promise<ManagedBasemap[]> {
    const params = new URLSearchParams({
        collection: COLLECTION,
        overlay: 'true',
        hidden: 'all',
        limit: '100',
        page: '0',
        sort: 'name',
        order: 'asc',
        filter: '',
    });
    const res = await std(`/api/basemap?${params.toString()}`) as { items: ManagedBasemap[] };
    return res.items.filter((b) => fileFromUrl(b.url));
}

async function tilesBase(): Promise<string> {
    const res = await std('/api/config/tiles') as { url: string };
    return res.url.replace(/\/+$/, '');
}

/**
 * Register a finished hosted tileset as a server-scoped CloudTAK overlay, using the same
 * POST /api/basemap path the Basemap editor uses for Hosted Tilesets.
 */
export async function register(result: JobResult): Promise<ManagedBasemap> {
    const base = await tilesBase();
    const isTerrain = result.kind === 'terrain';
    const ext = isTerrain ? 'png' : 'mvt';

    const body: Record<string, unknown> = {
        name: result.label.slice(0, 120),
        scope: 'server',
        protocol: 'zxy',
        url: `${base}/tiles/public/${result.file}/tiles/{z}/{x}/{y}.${ext}`,
        type: isTerrain ? 'raster-dem' : 'vector',
        format: isTerrain ? 'png' : 'mvt',
        minzoom: result.minzoom,
        maxzoom: result.maxzoom,
        tilesize: 256,
        overlay: true,
        hidden: false,
        sharing_enabled: true,
        collection: COLLECTION,
        attribution: result.attribution,
        bounds: result.bounds,
    };

    if (isTerrain) {
        body.encoding = 'terrarium';
    } else {
        body.snapping_enabled = true;
        body.snapping_layer = 'out';
    }

    return await std('/api/basemap', { method: 'POST', body }) as ManagedBasemap;
}

export async function deleteBasemap(id: number): Promise<void> {
    await std(`/api/basemap/${id}`, { method: 'DELETE' });
}

export async function getDefaultTerrain(): Promise<number | null> {
    const res = await std('/api/config?keys=map::terrain') as Record<string, unknown>;
    const v = res['map::terrain'];
    return v === null || v === undefined || v === '' ? null : Number(v);
}

export async function setDefaultTerrain(id: number | null): Promise<void> {
    await std('/api/config', { method: 'PUT', body: { 'map::terrain': id } });
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
    return `${bytes} B`;
}
