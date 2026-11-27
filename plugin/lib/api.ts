/**
 * Thin client for the plugin's API routes. All requests go through CloudTAK's std(),
 * which handles the base URL and auth token. Layer registration, defaults and cleanup
 * happen on the server, so a job completes correctly even if this page is closed.
 */
import { apiFetch } from './host.ts';

export const DEST = 'terrain-data-downloader';
// Must start with 'home-menu': CloudTAK only opens the side panel for routes named home-menu*
// (Map.vue noMenuShown). Same convention as Quick Point Dropper / Sidebar Configurator.
export const ROUTE_NAME = 'home-menu-plugin-terrain-data-downloader';
export const MENU_KEY = 'plugin-terrain-data-downloader';

const BASE = '/api/plugin/terrain-data-downloader';

export const ROUTES_MISSING = 'Plugin API routes are not installed (404)';

/**
 * apiFetch() for this plugin's own routes. A missing route normally comes back as a 404
 * ("API endpoint does not exist!"), but a proxy in front of CloudTAK can answer with an
 * HTML page instead, in which case apiFetch() hands back text rather than JSON.
 */
async function pstd(url: string, opts: Parameters<typeof apiFetch>[1] = {}): Promise<unknown> {
    const res = await apiFetch(url, opts);
    if (typeof res === 'string') {
        throw new Error(`${ROUTES_MISSING}: ${url} returned a non-JSON response`);
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
    add: string[];
    remove: string[];
    terrain: { enabled: boolean; maxzoom: number };
    snapping: { enabled: boolean; categories: string[] };
}

export interface MasterTerrain {
    basemap: number | null;
    file: string;
    states: string[];
    maxzoom: number;
    bytes: number;
    updated: string;
}

export interface MasterSnap {
    basemap: number | null;
    file: string;
    states: string[];
    categories: string[];
    bytes: number;
    updated: string;
}

export interface LegacyLayer {
    id: number;
    name: string;
    type: string;
    file: string;
    states: string[];
}

export interface Status {
    terrain: MasterTerrain | null;
    snapping: MasterSnap | null;
    defaultTerrain: number | null;
    legacy: LegacyLayer[];
    running: string | null;
    defaultCategories: string[];
}

export interface Plan {
    terrain: { touched: boolean; states: number; maxzoom: number; tiles: number; newTiles: number; bytes: number; limit: number };
    snapping: { touched: boolean; states: number; downloads: string[]; download: number; categoriesChanged: boolean };
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
    summary: string[];
    error?: string;
}

export async function listStates(): Promise<StateItem[]> {
    const res = await pstd(`${BASE}/states`) as { items: StateItem[] };
    return res.items;
}

export async function listCategories(): Promise<SnapCategory[]> {
    const res = await pstd(`${BASE}/categories`) as { items: SnapCategory[] };
    return res.items;
}

export async function getStatus(): Promise<Status> {
    return await pstd(`${BASE}/status`) as Status;
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

export function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
    return `${bytes} B`;
}
