<template>
    <div class='tdd col-12 px-2 pb-3'>
        <TablerLoading
            v-if='loading'
            desc='Loading Terrain Data Downloader'
        />
        <TablerAlert
            v-else-if='fatal'
            title='Terrain Data Downloader is not available'
            :err='fatal'
        />
        <template v-else>
            <!-- Active job -->
            <div
                v-if='job'
                class='card mb-3'
            >
                <div class='card-body'>
                    <div class='d-flex align-items-center mb-2'>
                        <span
                            class='badge me-2'
                            :class='statusClass(job.status)'
                            v-text='job.status'
                        />
                        <span
                            class='text-truncate'
                            v-text='job.step'
                        />
                        <div class='ms-auto'>
                            <TablerIconButton
                                v-if='job.status === "running" || job.status === "queued"'
                                title='Cancel Job'
                                @click='cancel'
                            >
                                <IconPlayerStop :size='20' />
                            </TablerIconButton>
                            <TablerIconButton
                                v-else
                                title='Dismiss'
                                @click='job = null'
                            >
                                <IconX :size='20' />
                            </TablerIconButton>
                        </div>
                    </div>
                    <TablerProgress :percent='job.progress' />
                    <div
                        v-if='job.error && job.status === "failed"'
                        class='text-danger small mt-2'
                        v-text='job.error'
                    />
                    <div
                        v-if='registerError'
                        class='text-danger small mt-2'
                        v-text='registerError'
                    />
                    <button
                        v-if='unregistered.length'
                        type='button'
                        class='btn btn-sm btn-outline-primary mt-2'
                        @click='registerResults(job)'
                        v-text='`Add ${unregistered.length} finished layer(s) to CloudTAK`'
                    />
                    <details class='mt-2'>
                        <summary class='small text-secondary'>
                            Log
                        </summary>
                        <pre
                            class='tdd-log small mb-0'
                            v-text='job.log.join("\n")'
                        />
                    </details>
                </div>
            </div>

            <!-- States -->
            <div class='mb-3'>
                <div class='d-flex align-items-center mb-1'>
                    <label class='form-label mb-0'>
                        States <span
                            class='text-secondary'
                            v-text='`(${selected.size} selected)`'
                        />
                    </label>
                    <div class='ms-auto btn-group btn-group-sm'>
                        <button
                            type='button'
                            class='btn btn-outline-secondary'
                            @click='selectVisible(true)'
                        >
                            All
                        </button>
                        <button
                            type='button'
                            class='btn btn-outline-secondary'
                            @click='selectVisible(false)'
                        >
                            None
                        </button>
                    </div>
                </div>
                <TablerInput
                    v-model='filter'
                    icon='search'
                    placeholder='Filter states'
                />
                <div class='tdd-states border rounded mt-2 p-2'>
                    <label
                        v-for='s in visibleStates'
                        :key='s.slug'
                        class='form-check mb-1'
                    >
                        <input
                            type='checkbox'
                            class='form-check-input'
                            :checked='selected.has(s.slug)'
                            @change='toggle(s.slug)'
                        >
                        <span class='form-check-label'>
                            <span
                                class='text-secondary me-1'
                                v-text='s.abbr'
                            />
                            <span v-text='s.name' />
                        </span>
                    </label>
                </div>
            </div>

            <!-- Terrain -->
            <div class='card mb-3'>
                <div class='card-body'>
                    <TablerToggle
                        v-model='req.terrain.enabled'
                        label='Terrain (elevation)'
                        description='3D terrain, elevation queries and slope shading in CloudTAK. Multiple states are always combined into one terrain layer because CloudTAK uses one active terrain at a time.'
                    />
                    <TablerEnum
                        v-if='req.terrain.enabled'
                        v-model='detail'
                        class='mt-2'
                        label='Detail level'
                        :options='detailOptions'
                    />
                </div>
            </div>

            <!-- Snapping -->
            <div class='card mb-3'>
                <div class='card-body'>
                    <TablerToggle
                        v-model='req.snapping.enabled'
                        label='Road & trail snapping'
                        description='OpenStreetMap road and trail centerlines used by the CloudTAK line tool to snap to the network.'
                    />
                    <template v-if='req.snapping.enabled'>
                        <div class='d-flex gap-3 mt-2'>
                            <label class='form-check'>
                                <input
                                    v-model='req.snapping.roads'
                                    type='checkbox'
                                    class='form-check-input'
                                >
                                <span class='form-check-label'>Roads</span>
                            </label>
                            <label class='form-check'>
                                <input
                                    v-model='req.snapping.trails'
                                    type='checkbox'
                                    class='form-check-input'
                                >
                                <span class='form-check-label'>Trails &amp; tracks</span>
                            </label>
                        </div>
                        <TablerToggle
                            v-if='selected.size > 1'
                            v-model='req.snapping.combine'
                            label='Combine states into one snapping layer'
                            description='Recommended. CloudTAK snaps to one layer at a time, so a combined layer lets routes cross state lines.'
                        />
                    </template>
                </div>
            </div>

            <!-- Estimate + start -->
            <div class='card mb-3'>
                <div class='card-body small'>
                    <div
                        v-if='planning'
                        class='text-secondary'
                    >
                        Estimating...
                    </div>
                    <template v-else-if='estimate'>
                        <div v-if='req.terrain.enabled'>
                            Terrain: <strong v-text='estimate.terrain.tiles.toLocaleString()' /> tiles,
                            about <strong v-text='formatBytes(estimate.terrain.bytes)' />
                            <span
                                v-if='estimate.terrain.tiles > estimate.terrain.limit'
                                class='text-danger'
                                v-text='` - over the ${estimate.terrain.limit.toLocaleString()} tile limit, lower the detail level`'
                            />
                        </div>
                        <div v-if='req.snapping.enabled'>
                            Snapping: <strong v-text='formatBytes(estimate.snapping.download)' /> OSM download (the stored layer is smaller)
                        </div>
                    </template>
                    <div
                        v-else-if='planError'
                        class='text-danger'
                        v-text='planError'
                    />
                    <div
                        v-else
                        class='text-secondary'
                    >
                        Select at least one state.
                    </div>
                </div>
                <div class='card-footer d-flex'>
                    <button
                        type='button'
                        class='btn btn-primary ms-auto'
                        :disabled='!canStart'
                        @click='start'
                    >
                        <IconDownload
                            :size='18'
                            class='me-1'
                        />
                        Download &amp; import
                    </button>
                </div>
            </div>

            <!-- Managed layers -->
            <div class='mb-2 d-flex align-items-center'>
                <label class='form-label mb-0'>Imported layers</label>
                <TablerIconButton
                    class='ms-auto'
                    title='Refresh'
                    @click='refreshManaged'
                >
                    <IconRefresh :size='20' />
                </TablerIconButton>
            </div>
            <TablerNone
                v-if='!managed.length'
                label='No layers imported yet'
                :create='false'
            />
            <div
                v-for='b in managed'
                :key='b.id'
                class='d-flex align-items-center border rounded p-2 mb-2'
            >
                <IconMountain
                    v-if='b.type === "raster-dem"'
                    :size='20'
                    class='me-2'
                />
                <IconRoute
                    v-else
                    :size='20'
                    class='me-2'
                />
                <div class='text-truncate'>
                    <div
                        class='text-truncate'
                        v-text='b.name'
                    />
                    <div
                        v-if='b.type === "raster-dem" && defaultTerrain === b.id'
                        class='small text-success'
                    >
                        Default terrain for all users
                    </div>
                </div>
                <div class='ms-auto d-flex'>
                    <TablerIconButton
                        v-if='b.type === "raster-dem" && defaultTerrain !== b.id'
                        title='Make default terrain for all users'
                        @click='makeDefault(b.id)'
                    >
                        <IconStar :size='20' />
                    </TablerIconButton>
                    <TablerIconButton
                        title='Delete layer and hosted file'
                        @click='remove(b)'
                    >
                        <IconTrash :size='20' />
                    </TablerIconButton>
                </div>
            </div>
            <p class='small text-secondary mt-2'>
                Users add these from <strong>Overlays</strong> (collection "Terrain Data Downloader"); snapping layers appear in the line tool's snapping list.
                Elevation: AWS Terrain Tiles (USGS 3DEP, SRTM, GMTED2010, ETOPO1). Roads/trails: &copy; OpenStreetMap contributors, extracts by BBBike.org.
            </p>
        </template>
    </div>
</template>

<script setup lang='ts'>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
    TablerAlert,
    TablerEnum,
    TablerIconButton,
    TablerInput,
    TablerLoading,
    TablerNone,
    TablerProgress,
    TablerToggle,
} from '@tak-ps/vue-tabler';
import {
    IconDownload,
    IconMountain,
    IconPlayerStop,
    IconRefresh,
    IconRoute,
    IconStar,
    IconTrash,
    IconX,
} from '@tabler/icons-vue';
import {
    cancelJob,
    deleteBasemap,
    deleteHostedFile,
    fileFromUrl,
    formatBytes,
    getDefaultTerrain,
    getJob,
    listJobs,
    listManaged,
    listStates,
    plan,
    register,
    setDefaultTerrain,
    startJob,
} from './api.ts';
import type { Job, JobRequest, ManagedBasemap, Plan, StateItem } from './api.ts';

const DETAIL: Record<string, number> = {
    'Low - ~120 m (z10)': 10,
    'Medium - ~60 m (z11)': 11,
    'High - ~30 m, DTED Level 2 class (z12)': 12,
    'Very high - ~15 m (z13)': 13,
};
const detailOptions = Object.keys(DETAIL);

const loading = ref(true);
const fatal = ref<Error | undefined>();
const states = ref<StateItem[]>([]);
const selected = ref<Set<string>>(new Set());
const filter = ref('');
const detail = ref(detailOptions[2]);

const req = ref<JobRequest>({
    states: [],
    terrain: { enabled: true, maxzoom: 12 },
    snapping: { enabled: true, roads: true, trails: true, combine: true },
});

const estimate = ref<Plan | null>(null);
const planning = ref(false);
const planError = ref('');
const job = ref<Job | null>(null);
const registerError = ref('');
const managed = ref<ManagedBasemap[]>([]);
const defaultTerrain = ref<number | null>(null);

let pollTimer: ReturnType<typeof setInterval> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
let planSeq = 0;
let unmounted = false;

const visibleStates = computed(() => {
    const f = filter.value.trim().toLowerCase();
    if (!f) return states.value;
    return states.value.filter((s) => s.name.toLowerCase().includes(f) || s.abbr.toLowerCase() === f);
});

const busy = computed(() => !!job.value && (job.value.status === 'queued' || job.value.status === 'running'));

const deletedFiles = ref<Set<string>>(new Set());
const unregistered = computed(() => {
    if (!job.value || job.value.status !== 'success') return [];
    const existing = new Set(managed.value.map((b) => fileFromUrl(b.url)));
    return job.value.results.filter((r) => !existing.has(r.file) && !deletedFiles.value.has(r.file));
});

const canStart = computed(() => {
    if (busy.value || !selected.value.size || planning.value || !estimate.value) return false;
    if (!req.value.terrain.enabled && !req.value.snapping.enabled) return false;
    if (req.value.snapping.enabled && !req.value.snapping.roads && !req.value.snapping.trails) return false;
    if (req.value.terrain.enabled && estimate.value.terrain.tiles > estimate.value.terrain.limit) return false;
    return true;
});

function toggle(slug: string): void {
    const next = new Set(selected.value);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    selected.value = next;
}

function selectVisible(on: boolean): void {
    const next = new Set(selected.value);
    for (const s of visibleStates.value) {
        if (on) next.add(s.slug); else next.delete(s.slug);
    }
    selected.value = next;
}

function body(): JobRequest {
    return {
        states: Array.from(selected.value),
        terrain: { enabled: req.value.terrain.enabled, maxzoom: DETAIL[detail.value] ?? 12 },
        snapping: { ...req.value.snapping },
    };
}

function statusClass(status: Job['status']): string {
    if (status === 'success') return 'bg-green text-white';
    if (status === 'failed') return 'bg-red text-white';
    if (status === 'cancelled') return 'bg-secondary text-white';
    return 'bg-blue text-white';
}

function schedulePlan(): void {
    if (planTimer) clearTimeout(planTimer);
    estimate.value = null;
    planError.value = '';
    if (!selected.value.size || (!req.value.terrain.enabled && !req.value.snapping.enabled)) return;
    planTimer = setTimeout(() => { void runPlan(); }, 600);
}

async function runPlan(): Promise<void> {
    const seq = ++planSeq;
    planning.value = true;
    try {
        const res = await plan(body());
        if (seq === planSeq) estimate.value = res;
    } catch (err) {
        if (seq === planSeq) planError.value = err instanceof Error ? err.message : String(err);
    } finally {
        if (seq === planSeq) planning.value = false;
    }
}

watch([selected, detail, () => req.value.terrain.enabled, () => req.value.snapping.enabled], schedulePlan);

async function refreshManaged(): Promise<void> {
    managed.value = await listManaged();
    defaultTerrain.value = await getDefaultTerrain().catch(() => null);
}

/** Create CloudTAK basemaps for any finished result that is not registered yet */
async function registerResults(finished: Job): Promise<void> {
    registerError.value = '';
    await refreshManaged();
    const existing = new Set(managed.value.map((b) => fileFromUrl(b.url)));
    for (const result of finished.results) {
        if (existing.has(result.file) || deletedFiles.value.has(result.file)) continue;
        try {
            await register(result);
        } catch (err) {
            registerError.value = `Could not register ${result.file}: ${err instanceof Error ? err.message : String(err)}. It is still available under Admin -> Hosted Tilesets.`;
        }
    }
    await refreshManaged();
}

function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
}

function startPolling(id: string): void {
    stopPolling();
    pollTimer = setInterval(async () => {
        try {
            const next = await getJob(id);
            if (unmounted) return;
            job.value = next;
            if (next.status !== 'queued' && next.status !== 'running') {
                stopPolling();
                if (next.results.length) await registerResults(next);
            }
        } catch (err) {
            stopPolling();
            registerError.value = err instanceof Error ? err.message : String(err);
        }
    }, 2000);
}

async function start(): Promise<void> {
    registerError.value = '';
    try {
        job.value = await startJob(body());
        startPolling(job.value.id);
    } catch (err) {
        planError.value = err instanceof Error ? err.message : String(err);
    }
}

async function cancel(): Promise<void> {
    if (!job.value) return;
    job.value = await cancelJob(job.value.id);
}

async function makeDefault(id: number): Promise<void> {
    await setDefaultTerrain(id);
    defaultTerrain.value = id;
}

async function remove(b: ManagedBasemap): Promise<void> {
    if (!window.confirm(`Delete "${b.name}" and its hosted tileset? Users who added it will lose it.`)) return;
    try {
        await deleteBasemap(b.id);
        const file = fileFromUrl(b.url);
        if (file) {
            deletedFiles.value = new Set(deletedFiles.value).add(file);
            await deleteHostedFile(file);
        }
    } catch (err) {
        registerError.value = err instanceof Error ? err.message : String(err);
    }
    await refreshManaged();
}

onMounted(async () => {
    try {
        states.value = await listStates();
        await refreshManaged();

        // Resume the most recent job (e.g. after navigating away mid-download)
        const jobs = await listJobs();
        const latest = jobs[0];
        if (latest) {
            job.value = latest;
            // Finished jobs are not auto-registered here: an admin may have deleted those layers on purpose
            if (latest.status === 'queued' || latest.status === 'running') startPolling(latest.id);
        }
    } catch (err) {
        fatal.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        loading.value = false;
    }
});

onUnmounted(() => {
    unmounted = true;
    stopPolling();
    if (planTimer) clearTimeout(planTimer);
});
</script>

<style scoped>
.tdd-states {
    max-height: 260px;
    overflow-y: auto;
}

.tdd-log {
    max-height: 180px;
    overflow-y: auto;
    white-space: pre-wrap;
}
</style>
