/**
 * Thin client for the plugin's API routes and the CloudTAK core endpoints it uses.
 * All requests go through CloudTAK's std() so the base URL and auth token are handled for us.
 */
import { std } from '../../../src/std.ts';

export const DEST = 'terrain-data-downloader';
export const ROUTE_NAME = 'plugin-terrain-data-downloader';
export const MENU_KEY = 'plugin-terrain-data-downloader';
export const COLLECTION = 'Terrain Data Downloader';

const BASE = '/api/plugin/terrain-data-downloader';

export interface StateItem {
    slug: string;
    abbr: string;
    name: string;
    area: number;
}

export interface JobRequest {
    states: string[];
    terrain: { enabled: boolean; maxzoom: number };
    snapping: { enabled: boolean; roads: boolean; trails: boolean; combine: boolean };
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
    const res = await std(`${BASE}/states`) as { items: StateItem[] };
    return res.items;
}

export async function plan(body: JobRequest): Promise<Plan> {
    return await std(`${BASE}/plan`, { method: 'POST', body, timeout: 120_000 }) as Plan;
}

export async function startJob(body: JobRequest): Promise<Job> {
    return await std(`${BASE}/job`, { method: 'POST', body }) as Job;
}

export async function listJobs(): Promise<Job[]> {
    const res = await std(`${BASE}/job`) as { items: Job[] };
    return res.items;
}

export async function getJob(id: string): Promise<Job> {
    return await std(`${BASE}/job/${encodeURIComponent(id)}`) as Job;
}

export async function cancelJob(id: string): Promise<Job> {
    return await std(`${BASE}/job/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Job;
}

export async function deleteHostedFile(file: string): Promise<void> {
    await std(`${BASE}/file/${encodeURIComponent(file)}`, { method: 'DELETE' });
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

export async function setDefaultTerrain(id: number): Promise<void> {
    await std('/api/config', { method: 'PUT', body: { 'map::terrain': id } });
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
    return `${bytes} B`;
}
