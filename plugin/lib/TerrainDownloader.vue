<template>
    <div class='tdd col-12 px-2 pb-3'>
        <TablerLoading
            v-if='loading'
            desc='Loading Terrain Data Downloader'
        />
        <TablerAlert
            v-else-if='fatal'
            :title='fatalTitle'
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
                    <label
                        v-if='req.terrain.enabled'
                        class='form-check mt-2 mb-0'
                    >
                        <input
                            v-model='req.terrain.makeDefault'
                            type='checkbox'
                            class='form-check-input'
                        >
                        <span class='form-check-label'>
                            Make this the CloudTAK default terrain
                            <span class='d-block small text-secondary'>Sets the server's Default Terrain (Admin → Config → Map), added to every user's overlays</span>
                        </span>
                    </label>
                </div>
            </div>

            <!-- Snapping -->
            <div class='card mb-3'>
                <div class='card-body'>
                    <TablerToggle
                        v-model='req.snapping.enabled'
                        label='Snapping'
                        description='OpenStreetMap lines the CloudTAK line tool snaps to. Only the categories you tick are included; everything in the layer becomes snappable.'
                    />
                    <template v-if='req.snapping.enabled'>
                        <div class='d-flex align-items-center mt-2 mb-1'>
                            <span
                                class='small text-secondary'
                                v-text='`${categories.size} of ${categoryList.length} categories`'
                            />
                            <div class='ms-auto btn-group btn-group-sm'>
                                <button
                                    type='button'
                                    class='btn btn-outline-secondary'
                                    @click='setCategories("defaults")'
                                >
                                    Defaults
                                </button>
                                <button
                                    type='button'
                                    class='btn btn-outline-secondary'
                                    @click='setCategories("all")'
                                >
                                    All
                                </button>
                                <button
                                    type='button'
                                    class='btn btn-outline-secondary'
                                    @click='setCategories("none")'
                                >
                                    None
                                </button>
                            </div>
                        </div>
                        <div class='tdd-cats border rounded p-2'>
                            <label
                                v-for='c in categoryList'
                                :key='c.id'
                                class='form-check mb-1'
                            >
                                <input
                                    type='checkbox'
                                    class='form-check-input'
                                    :checked='categories.has(c.id)'
                                    @change='toggleCategory(c.id)'
                                >
                                <span class='form-check-label'>
                                    <span v-text='c.label' />
                                    <span
                                        class='d-block small text-secondary'
                                        v-text='c.description'
                                    />
                                </span>
                            </label>
                        </div>
                        <TablerToggle
                            v-if='selected.size > 1'
                            v-model='req.snapping.combine'
                            class='mt-2'
                            label='Combine states into one snapping layer'
                            description='Recommended. CloudTAK snaps to one layer at a time, so a combined layer lets routes cross state lines.'
                        />
                        <label class='form-check mt-2 mb-0'>
                            <input
                                v-model='req.snapping.makeDefault'
                                type='checkbox'
                                class='form-check-input'
                            >
                            <span class='form-check-label'>
                                Make this the default snapping layer
                                <span class='d-block small text-secondary'>Preselected in every user's line tool (they can still switch it off)</span>
                            </span>
                        </label>
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
                        v-if='isDefault(b)'
                        class='small text-success'
                        v-text='b.type === "raster-dem" ? "Default terrain for all users" : "Default snapping layer for all users"'
                    />
                </div>
                <div class='ms-auto d-flex'>
                    <TablerIconButton
                        :title='isDefault(b) ? "Remove as default" : (b.type === "raster-dem" ? "Make default terrain for all users" : "Make default snapping layer for all users")'
                        @click='toggleDefault(b)'
                    >
                        <IconStarFilled
                            v-if='isDefault(b)'
                            :size='20'
                            class='text-yellow'
                        />
                        <IconStar
                            v-else
                            :size='20'
                        />
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
                Elevation: AWS Terrain Tiles (USGS 3DEP, SRTM, GMTED2010, ETOPO1). Snapping lines: &copy; OpenStreetMap contributors, extracts by BBBike.org.
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
    IconStarFilled,
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
    getSettings,
    listCategories,
    listJobs,
    listManaged,
    listStates,
    plan,
    register,
    setDefaultSnapping,
    setDefaultTerrain,
    startJob,
} from './api.ts';
import type { Job, JobRequest, ManagedBasemap, Plan, SnapCategory, StateItem } from './api.ts';

const DETAIL: Record<string, number> = {
    'Low - ~120 m (z10)': 10,
    'Medium - ~60 m (z11)': 11,
    'High - ~30 m, DTED Level 2 class (z12)': 12,
    'Very high - ~15 m (z13)': 13,
};
const detailOptions = Object.keys(DETAIL);

const loading = ref(true);
const fatal = ref<Error | undefined>();
const fatalTitle = ref('Terrain Data Downloader is not available');
const states = ref<StateItem[]>([]);
const selected = ref<Set<string>>(new Set());
const filter = ref('');
const detail = ref(detailOptions[2]);

const req = ref<JobRequest>({
    states: [],
    terrain: { enabled: true, maxzoom: 12, makeDefault: false },
    snapping: { enabled: true, categories: [], combine: true, makeDefault: false },
});

const categoryList = ref<SnapCategory[]>([]);
const categories = ref<Set<string>>(new Set());

const estimate = ref<Plan | null>(null);
const planning = ref(false);
const planError = ref('');
const job = ref<Job | null>(null);
const registerError = ref('');
const managed = ref<ManagedBasemap[]>([]);
const defaultTerrain = ref<number | null>(null);
const defaultSnapping = ref<number | null>(null);

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
    if (req.value.snapping.enabled && !categories.value.size) return false;
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

function toggleCategory(id: string): void {
    const next = new Set(categories.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    categories.value = next;
}

function setCategories(mode: 'defaults' | 'all' | 'none'): void {
    categories.value = new Set(categoryList.value
        .filter((c) => mode === 'all' || (mode === 'defaults' && c.default))
        .map((c) => c.id));
}

function body(): JobRequest {
    return {
        states: Array.from(selected.value),
        terrain: { ...req.value.terrain, maxzoom: DETAIL[detail.value] ?? 12 },
        // Keep the server's category order so labels are stable
        snapping: { ...req.value.snapping, categories: categoryList.value.filter((c) => categories.value.has(c.id)).map((c) => c.id) },
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
    defaultSnapping.value = await getSettings().then((s) => s.snapping).catch(() => null);
}

function isDefault(b: ManagedBasemap): boolean {
    return b.type === 'raster-dem' ? defaultTerrain.value === b.id : defaultSnapping.value === b.id;
}

async function toggleDefault(b: ManagedBasemap): Promise<void> {
    registerError.value = '';
    try {
        if (b.type === 'raster-dem') {
            await setDefaultTerrain(isDefault(b) ? null : b.id);
        } else {
            await setDefaultSnapping(isDefault(b) ? null : b.id);
        }
    } catch (err) {
        registerError.value = err instanceof Error ? err.message : String(err);
    }
    await refreshManaged();
}

/** Create CloudTAK basemaps for any finished result that is not registered yet */
async function registerResults(finished: Job): Promise<void> {
    registerError.value = '';
    await refreshManaged();
    const existing = new Set(managed.value.map((b) => fileFromUrl(b.url)));
    let snapDefaultSet = false;
    for (const result of finished.results) {
        if (existing.has(result.file) || deletedFiles.value.has(result.file)) continue;
        try {
            const created = await register(result);
            if (result.kind === 'terrain' && finished.request.terrain.makeDefault) {
                await setDefaultTerrain(created.id);
            } else if (result.kind === 'snapping' && finished.request.snapping.makeDefault && !snapDefaultSet) {
                // Only one layer can be preselected; with separate states the first one wins
                await setDefaultSnapping(created.id);
                snapDefaultSet = true;
            }
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

async function remove(b: ManagedBasemap): Promise<void> {
    if (!window.confirm(`Delete "${b.name}" and its hosted tileset? Users who added it will lose it.`)) return;
    try {
        // CloudTAK refuses to delete the default terrain, and a stale default snapping id is useless
        if (isDefault(b)) {
            if (b.type === 'raster-dem') await setDefaultTerrain(null);
            else await setDefaultSnapping(null);
        }
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
        [states.value, categoryList.value] = await Promise.all([listStates(), listCategories()]);
        setCategories('defaults');
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
        console.error('[terrain-data-downloader] failed to load', err);
        const e = err instanceof Error ? err : new Error(String(err));
        const msg = e.message.toLowerCase();
        if (msg.includes('404') || msg.includes('not found') || msg.includes('cannot get')) {
            fatalTitle.value = 'Plugin server routes are not installed';
            fatal.value = new Error('The CloudTAK API does not have this plugin\'s routes yet. Reinstall the plugin from TAK Portal (or copy server/*.ts into api/stateless/routes/) and rebuild the CloudTAK API image, then Settings -> Refresh App.', { cause: e });
        } else if (msg.includes('admin') || msg.includes('403') || msg.includes('401') || msg.includes('permission')) {
            fatalTitle.value = 'CloudTAK system administrators only';
            fatal.value = new Error(`Your account is not a CloudTAK system administrator (server said: ${e.message}).`, { cause: e });
        } else {
            fatal.value = e;
        }
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
.tdd-states,
.tdd-cats {
    max-height: 260px;
    overflow-y: auto;
}

.tdd-log {
    max-height: 180px;
    overflow-y: auto;
    white-space: pre-wrap;
}
</style>
