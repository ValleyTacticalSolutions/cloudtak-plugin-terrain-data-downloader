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
            <div class='card mb-2'>
                <div
                    class='tdd-head card-body py-2 d-flex align-items-center'
                    role='button'
                    @click='open.states = !open.states'
                >
                    <IconChevronRight
                        :size='18'
                        class='tdd-chev me-1'
                        :class='{ "tdd-chev--open": open.states }'
                    />
                    <span class='fw-bold me-2'>States</span>
                    <span
                        v-if='!selected.size'
                        class='small text-secondary'
                    >None selected</span>
                    <span
                        v-else
                        class='tdd-chips text-truncate'
                    >
                        <span
                            v-for='abbr in selectedAbbrs.slice(0, 8)'
                            :key='abbr'
                            class='badge bg-blue-lt me-1'
                            v-text='abbr'
                        />
                        <span
                            v-if='selectedAbbrs.length > 8'
                            class='small text-secondary'
                            v-text='`+${selectedAbbrs.length - 8}`'
                        />
                    </span>
                </div>
                <div
                    v-if='open.states'
                    class='card-body pt-0'
                >
                    <div class='d-flex align-items-center gap-2 mb-2'>
                        <div class='flex-grow-1'>
                            <TablerInput
                                v-model='filter'
                                icon='search'
                                placeholder='Filter states'
                            />
                        </div>
                        <div class='btn-group btn-group-sm'>
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
                    <div class='tdd-grid tdd-scroll'>
                        <label
                            v-for='s in visibleStates'
                            :key='s.slug'
                            class='form-check mb-0'
                            :title='s.name'
                        >
                            <input
                                type='checkbox'
                                class='form-check-input'
                                :checked='selected.has(s.slug)'
                                @change='toggle(s.slug)'
                            >
                            <span class='form-check-label text-truncate d-block'>
                                <span
                                    class='text-secondary me-1'
                                    v-text='s.abbr'
                                />
                                <span v-text='s.name' />
                            </span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Download Terrain -->
            <div class='card mb-2'>
                <div class='card-body py-2'>
                    <label class='d-flex align-items-center mb-0'>
                        <IconMountain
                            :size='18'
                            class='me-2'
                        />
                        <span
                            class='fw-bold'
                            title='3D terrain, elevation readouts and slope shading. Multiple states are always combined into one terrain layer, because CloudTAK uses one active terrain at a time.'
                        >Download Terrain</span>
                        <span class='form-check form-switch ms-auto mb-0'>
                            <input
                                v-model='req.terrain.enabled'
                                class='form-check-input'
                                type='checkbox'
                                role='switch'
                            >
                        </span>
                    </label>
                    <template v-if='req.terrain.enabled'>
                        <select
                            v-model='detail'
                            class='form-select form-select-sm mt-2'
                            aria-label='Terrain detail level'
                        >
                            <option
                                v-for='o in detailOptions'
                                :key='o'
                                :value='o'
                                v-text='o'
                            />
                        </select>
                        <label
                            class='form-check mt-2 mb-0'
                            title='Sets the server Default Terrain (Admin → Config → Map). CloudTAK adds it to the overlays of new users and of users without a terrain layer.'
                        >
                            <input
                                v-model='req.terrain.makeDefault'
                                type='checkbox'
                                class='form-check-input'
                            >
                            <span class='form-check-label small'>Make this the CloudTAK default terrain</span>
                        </label>
                    </template>
                </div>
            </div>

            <!-- Download Snapping -->
            <div class='card mb-2'>
                <div class='card-body py-2'>
                    <label class='d-flex align-items-center mb-0'>
                        <IconRoute
                            :size='18'
                            class='me-2'
                        />
                        <span
                            class='fw-bold'
                            title='OpenStreetMap lines the CloudTAK line tool snaps to. Only the selected categories are included; everything in the layer becomes snappable.'
                        >Download Snapping</span>
                        <span class='form-check form-switch ms-auto mb-0'>
                            <input
                                v-model='req.snapping.enabled'
                                class='form-check-input'
                                type='checkbox'
                                role='switch'
                            >
                        </span>
                    </label>
                    <template v-if='req.snapping.enabled'>
                        <div class='d-flex align-items-start mt-2 small'>
                            <span
                                class='text-secondary me-2 flex-grow-1'
                                :class='{ "text-danger": !categories.size }'
                                v-text='categorySummary'
                            />
                            <a
                                href='#'
                                class='text-nowrap'
                                @click.prevent='open.categories = !open.categories'
                                v-text='open.categories ? "Done" : "Customize"'
                            />
                        </div>
                        <template v-if='open.categories'>
                            <div class='btn-group btn-group-sm mt-2'>
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
                            <div class='tdd-grid mt-2'>
                                <label
                                    v-for='c in categoryList'
                                    :key='c.id'
                                    class='form-check mb-0'
                                    :title='c.description'
                                >
                                    <input
                                        type='checkbox'
                                        class='form-check-input'
                                        :checked='categories.has(c.id)'
                                        @change='toggleCategory(c.id)'
                                    >
                                    <span
                                        class='form-check-label small text-truncate d-block'
                                        v-text='c.label'
                                    />
                                </label>
                            </div>
                        </template>
                        <label
                            v-if='selected.size > 1'
                            class='form-check mt-2 mb-0'
                            title='Recommended. CloudTAK snaps to one layer at a time, so a combined layer lets routes cross state lines.'
                        >
                            <input
                                v-model='req.snapping.combine'
                                type='checkbox'
                                class='form-check-input'
                            >
                            <span class='form-check-label small'>Combine states into one snapping layer</span>
                        </label>
                    </template>
                </div>
            </div>

            <!-- Estimate + start -->
            <div class='card mb-2'>
                <div class='card-body py-2 d-flex align-items-center gap-2'>
                    <div class='small flex-grow-1'>
                        <span
                            v-if='!selected.size'
                            class='text-secondary'
                        >Select at least one state.</span>
                        <span
                            v-else-if='!req.terrain.enabled && !req.snapping.enabled'
                            class='text-secondary'
                        >Turn on terrain or snapping.</span>
                        <span
                            v-else-if='planning || (!estimate && !planError)'
                            class='text-secondary'
                        >Estimating...</span>
                        <span
                            v-else-if='planError'
                            class='text-danger'
                            v-text='planError'
                        />
                        <template v-else-if='estimate'>
                            <div v-if='req.terrain.enabled'>
                                Terrain ~<strong v-text='formatBytes(estimate.terrain.bytes)' />
                                <span
                                    class='text-secondary'
                                    v-text='` (${estimate.terrain.tiles.toLocaleString()} tiles)`'
                                />
                                <span
                                    v-if='estimate.terrain.tiles > estimate.terrain.limit'
                                    class='text-danger'
                                    v-text='` over the ${estimate.terrain.limit.toLocaleString()} tile limit`'
                                />
                            </div>
                            <div v-if='req.snapping.enabled'>
                                Snapping <strong v-text='formatBytes(estimate.snapping.download)' />
                                <span class='text-secondary'> download</span>
                            </div>
                        </template>
                    </div>
                    <button
                        type='button'
                        class='btn btn-primary btn-sm text-nowrap'
                        :disabled='!canStart'
                        @click='start'
                    >
                        <IconDownload
                            :size='16'
                            class='me-1'
                        />
                        Download
                    </button>
                </div>
            </div>

            <!-- Imported layers -->
            <div class='card'>
                <div
                    class='tdd-head card-body py-2 d-flex align-items-center'
                    role='button'
                    @click='open.layers = !open.layers'
                >
                    <IconChevronRight
                        :size='18'
                        class='tdd-chev me-1'
                        :class='{ "tdd-chev--open": open.layers }'
                    />
                    <span class='fw-bold me-2'>Imported layers</span>
                    <span
                        class='badge bg-secondary-lt'
                        v-text='managed.length'
                    />
                    <TablerIconButton
                        class='ms-auto'
                        title='Refresh'
                        @click.stop='refreshManaged'
                    >
                        <IconRefresh :size='18' />
                    </TablerIconButton>
                </div>
                <div
                    v-if='open.layers'
                    class='card-body pt-0'
                >
                    <div
                        v-if='!managed.length'
                        class='small text-secondary'
                    >
                        No layers imported yet.
                    </div>
                    <div
                        v-for='b in managed'
                        :key='b.id'
                        class='d-flex align-items-center border rounded px-2 py-1 mb-1'
                    >
                        <IconMountain
                            v-if='b.type === "raster-dem"'
                            :size='18'
                            class='me-2 flex-shrink-0'
                        />
                        <IconRoute
                            v-else
                            :size='18'
                            class='me-2 flex-shrink-0'
                        />
                        <div class='text-truncate small'>
                            <div
                                class='text-truncate'
                                :title='b.name'
                                v-text='b.name'
                            />
                            <div
                                v-if='isDefault(b)'
                                class='text-success'
                                v-text='b.type === "raster-dem" ? "Default terrain" : "Default snapping layer"'
                            />
                        </div>
                        <div class='ms-auto d-flex flex-shrink-0'>
                            <TablerIconButton
                                :title='isDefault(b) ? "Remove as default" : (b.type === "raster-dem" ? "Make default terrain for all users" : "Make default snapping layer for all users")'
                                @click='toggleDefault(b)'
                            >
                                <IconStarFilled
                                    v-if='isDefault(b)'
                                    :size='18'
                                    class='text-yellow'
                                />
                                <IconStar
                                    v-else
                                    :size='18'
                                />
                            </TablerIconButton>
                            <TablerIconButton
                                title='Delete layer and hosted file'
                                @click='remove(b)'
                            >
                                <IconTrash :size='18' />
                            </TablerIconButton>
                        </div>
                    </div>
                    <p class='small text-secondary mt-2 mb-0'>
                        Users add these from <strong>Overlays</strong> (collection "Terrain Data Downloader"); snapping layers appear in the line tool's snapping list.
                        Elevation: AWS Terrain Tiles (USGS 3DEP, SRTM, GMTED2010, ETOPO1). Snapping lines: &copy; OpenStreetMap contributors, extracts by BBBike.org.
                    </p>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup lang='ts'>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
    TablerAlert,
    TablerIconButton,
    TablerInput,
    TablerLoading,
    TablerProgress,
} from '@tak-ps/vue-tabler';
import {
    IconChevronRight,
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
    'Low detail (~120 m)': 10,
    'Medium detail (~60 m)': 11,
    'High detail (~30 m, DTED Level 2 class)': 12,
    'Very high detail (~15 m)': 13,
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
    terrain: { enabled: true, maxzoom: 12, makeDefault: true },
    snapping: { enabled: true, categories: [], combine: true, makeDefault: false },
});

const categoryList = ref<SnapCategory[]>([]);
const categories = ref<Set<string>>(new Set());

// Collapsible sections: only the state list starts open (it is the first thing to choose)
const open = ref({ states: true, categories: false, layers: false });

const selectedAbbrs = computed(() => states.value.filter((s) => selected.value.has(s.slug)).map((s) => s.abbr));

const categorySummary = computed(() => {
    const labels = categoryList.value.filter((c) => categories.value.has(c.id)).map((c) => c.label);
    if (!labels.length) return 'No categories selected';
    if (labels.length === categoryList.value.length) return 'All categories';
    return labels.join(', ');
});

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
    // Invalidate any estimate still in flight so it can't land after the selection changed
    planSeq++;
    planning.value = false;
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
    for (const result of finished.results) {
        if (existing.has(result.file) || deletedFiles.value.has(result.file)) continue;
        try {
            const created = await register(result);
            // The default snapping layer is only set from the star on an imported layer
            if (result.kind === 'terrain' && finished.request.terrain.makeDefault) {
                await setDefaultTerrain(created.id);
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
        if (msg.includes('404') || msg.includes('not found') || msg.includes('does not exist') || msg.includes('cannot get')) {
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
.tdd-head {
    cursor: pointer;
    user-select: none;
}

.tdd-chev {
    transition: transform 0.15s ease;
    flex-shrink: 0;
}

.tdd-chev--open {
    transform: rotate(90deg);
}

.tdd-chips {
    min-width: 0;
}

.tdd-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.25rem 0.75rem;
}

.tdd-scroll {
    max-height: 220px;
    overflow-y: auto;
}

.tdd-log {
    max-height: 180px;
    overflow-y: auto;
    white-space: pre-wrap;
}
</style>
