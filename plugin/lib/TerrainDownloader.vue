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
            <!-- Active / last job -->
            <div
                v-if='job'
                class='card mb-2'
            >
                <div class='card-body py-2'>
                    <div class='d-flex align-items-center mb-2'>
                        <span
                            class='badge me-2'
                            :class='statusClass(job.status)'
                            v-text='job.status'
                        />
                        <span
                            class='text-truncate small'
                            v-text='job.step'
                        />
                        <div class='ms-auto'>
                            <TablerIconButton
                                v-if='busy'
                                title='Cancel'
                                @click='cancel'
                            >
                                <IconPlayerStop :size='18' />
                            </TablerIconButton>
                            <TablerIconButton
                                v-else
                                title='Dismiss'
                                @click='job = null'
                            >
                                <IconX :size='18' />
                            </TablerIconButton>
                        </div>
                    </div>
                    <TablerProgress
                        v-if='busy'
                        :percent='job.progress'
                    />
                    <ul
                        v-if='job.summary.length'
                        class='small mb-0 ps-3'
                    >
                        <li
                            v-for='line in job.summary'
                            :key='line'
                            v-text='line'
                        />
                    </ul>
                    <div
                        v-if='job.error && job.status === "failed"'
                        class='text-danger small mt-1'
                        v-text='job.error'
                    />
                    <div
                        v-if='notice'
                        class='text-warning small mt-1'
                        v-text='notice'
                    />
                    <details class='mt-1'>
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
                        class='tdd-min0 text-truncate'
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
                            :title='stateTitle(s)'
                        >
                            <input
                                type='checkbox'
                                class='form-check-input'
                                :checked='selected.has(s.slug)'
                                @change='toggle(s.slug)'
                            >
                            <span class='form-check-label d-flex align-items-center tdd-min0'>
                                <span
                                    class='text-secondary me-1'
                                    v-text='s.abbr'
                                />
                                <span
                                    class='text-truncate'
                                    v-text='s.name'
                                />
                                <IconMountain
                                    v-if='inTerrain.has(s.slug)'
                                    :size='12'
                                    class='ms-1 text-green flex-shrink-0'
                                />
                                <IconRoute
                                    v-if='inSnapping.has(s.slug)'
                                    :size='12'
                                    class='ms-1 text-green flex-shrink-0'
                                />
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
                        <span class='fw-bold'>Download Terrain</span>
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
                        <div
                            v-if='detailChanged'
                            class='small text-warning mt-1'
                            v-text='`Rebuilds all ${status?.terrain?.states.length ?? 0} states.`'
                        />
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
                        <span class='fw-bold'>Download Snapping</span>
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
                                class='me-2 flex-grow-1'
                                :class='categories.size ? "text-secondary" : "text-danger"'
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
                        <div
                            v-if='categoriesChanged'
                            class='small text-warning mt-1'
                            v-text='`Rebuilds all ${status?.snapping?.states.length ?? 0} states.`'
                        />
                    </template>
                </div>
            </div>

            <!-- Plan + actions -->
            <div class='card mb-2'>
                <div class='card-body py-2'>
                    <div class='small mb-2'>
                        <span
                            v-if='!action'
                            class='text-secondary'
                            v-text='idleHint'
                        />
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
                            <div
                                v-if='estimate.terrain.touched'
                                v-text='terrainLine'
                            />
                            <div
                                v-if='estimate.snapping.touched'
                                v-text='snappingLine'
                            />
                            <div
                                v-if='estimate.terrain.touched && estimate.terrain.tiles > estimate.terrain.limit'
                                class='text-danger'
                                v-text='`Too many tiles - lower the detail level.`'
                            />
                            <div
                                v-if='!estimate.terrain.touched && !estimate.snapping.touched'
                                class='text-secondary'
                            >
                                No changes.
                            </div>
                        </template>
                    </div>
                    <div class='d-flex gap-2'>
                        <button
                            v-if='removable.length'
                            type='button'
                            class='btn btn-outline-danger btn-sm text-nowrap'
                            :disabled='busy'
                            :title='removeTitle'
                            @click='removeSelected'
                        >
                            <IconTrash
                                :size='16'
                                class='me-1'
                            />
                            <span v-text='removeLabel' />
                        </button>
                        <button
                            type='button'
                            class='btn btn-primary btn-sm text-nowrap ms-auto'
                            :disabled='!canStart'
                            @click='start'
                        >
                            <IconDownload
                                :size='16'
                                class='me-1'
                            />
                            <span v-text='action === "apply" ? "Apply changes" : "Download"' />
                        </button>
                    </div>
                </div>
            </div>

            <!-- What is in CloudTAK now -->
            <div class='card mb-2'>
                <div class='card-body py-2'>
                    <div class='d-flex align-items-center mb-1'>
                        <span class='fw-bold'>In CloudTAK</span>
                        <TablerIconButton
                            class='ms-auto'
                            title='Refresh'
                            @click='refreshStatus'
                        >
                            <IconRefresh :size='16' />
                        </TablerIconButton>
                    </div>
                    <div class='d-flex align-items-start small mb-1'>
                        <IconMountain
                            :size='16'
                            class='me-2 mt-1 flex-shrink-0'
                        />
                        <div class='flex-grow-1 tdd-min0'>
                            <div>
                                Terrain
                                <span
                                    v-if='status?.terrain && status.defaultTerrain === status.terrain.basemap'
                                    class='badge bg-green-lt ms-1'
                                >Default</span>
                            </div>
                            <div
                                v-if='status?.terrain'
                                class='text-secondary'
                                v-text='`${status.terrain.states.length} state(s) · ${detailName(status.terrain.maxzoom)} · ${formatBytes(status.terrain.bytes)}`'
                            />
                            <div
                                v-else
                                class='text-secondary'
                            >
                                Not downloaded yet
                            </div>
                            <div
                                v-if='status?.terrain'
                                class='text-truncate'
                            >
                                <span
                                    v-for='abbr in abbrs(status.terrain.states)'
                                    :key='abbr'
                                    class='badge bg-secondary-lt me-1'
                                    v-text='abbr'
                                />
                            </div>
                        </div>
                    </div>
                    <div class='d-flex align-items-start small'>
                        <IconRoute
                            :size='16'
                            class='me-2 mt-1 flex-shrink-0'
                        />
                        <div class='flex-grow-1 tdd-min0'>
                            <div>
                                Snapping
                            </div>
                            <div
                                v-if='status?.snapping'
                                class='text-secondary text-truncate'
                                :title='categoryNames(status.snapping.categories)'
                                v-text='`${status.snapping.states.length} state(s) · ${categoryNames(status.snapping.categories)} · ${formatBytes(status.snapping.bytes)}`'
                            />
                            <div
                                v-else
                                class='text-secondary'
                            >
                                Not downloaded yet
                            </div>
                            <div
                                v-if='status?.snapping'
                                class='text-truncate'
                            >
                                <span
                                    v-for='abbr in abbrs(status.snapping.states)'
                                    :key='abbr'
                                    class='badge bg-secondary-lt me-1'
                                    v-text='abbr'
                                />
                            </div>
                        </div>
                    </div>
                    <div
                        v-if='status?.legacy.length'
                        class='small text-warning mt-1'
                        v-text='`${status.legacy.length} older layer(s) will be merged on the next download.`'
                    />
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
    IconTrash,
    IconX,
} from '@tabler/icons-vue';
import {
    cancelJob,
    formatBytes,
    getJob,
    getStatus,
    listCategories,
    listJobs,
    listStates,
    plan,
    startJob,
} from './api.ts';
import type { Job, JobRequest, Plan, SnapCategory, StateItem, Status } from './api.ts';
import { dropTerrainNow, showTerrainNow } from './live-refresh.ts';

const DETAIL: Record<string, number> = {
    'Low detail (~120 m)': 10,
    'Medium detail (~60 m)': 11,
    'High detail (~30 m)': 12,
    'Very high detail (~15 m)': 13,
};
const detailOptions = Object.keys(DETAIL);

const loading = ref(true);
const fatal = ref<Error | undefined>();
const fatalTitle = ref('Terrain Data Downloader is not available');
const states = ref<StateItem[]>([]);
const status = ref<Status | null>(null);
const selected = ref<Set<string>>(new Set());
const filter = ref('');
const detail = ref(detailOptions[2]);

const req = ref({
    terrain: { enabled: true },
    snapping: { enabled: true },
});

const categoryList = ref<SnapCategory[]>([]);
const categories = ref<Set<string>>(new Set());

// Collapsible sections: the state list starts open because it is the first thing to choose
const open = ref({ states: true, categories: false });

const estimate = ref<Plan | null>(null);
const planning = ref(false);
const planError = ref('');
const job = ref<Job | null>(null);
const notice = ref('');

let pollTimer: ReturnType<typeof setInterval> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
let planSeq = 0;
let unmounted = false;

const inTerrain = computed(() => new Set(status.value?.terrain?.states ?? []));
const inSnapping = computed(() => new Set(status.value?.snapping?.states ?? []));
const maxzoom = computed(() => DETAIL[detail.value] ?? 12);

const visibleStates = computed(() => {
    const f = filter.value.trim().toLowerCase();
    if (!f) return states.value;
    return states.value.filter((s) => s.name.toLowerCase().includes(f) || s.abbr.toLowerCase() === f);
});

const selectedAbbrs = computed(() => abbrs([...selected.value]));

const selectedCategoryIds = computed(() => categoryList.value.filter((c) => categories.value.has(c.id)).map((c) => c.id));

const categorySummary = computed(() => {
    if (!categories.value.size) return 'No categories selected';
    return categoryNames(selectedCategoryIds.value);
});

const categoriesChanged = computed(() => {
    const cur = status.value?.snapping?.categories;
    if (!cur) return false;
    return cur.length !== categories.value.size || cur.some((c) => !categories.value.has(c));
});

const detailChanged = computed(() => !!status.value?.terrain && maxzoom.value !== status.value.terrain.maxzoom);

/** Selected states Remove would take out of the terrain layer (only while Download Terrain is on) */
const removeFromTerrain = computed(() => req.value.terrain.enabled ? [...selected.value].filter((s) => inTerrain.value.has(s)) : []);

/** Selected states Remove would take out of the snapping layer (only while Download Snapping is on) */
const removeFromSnapping = computed(() => req.value.snapping.enabled ? [...selected.value].filter((s) => inSnapping.value.has(s)) : []);

/** Selected states Remove would affect in at least one layer */
const removable = computed(() => [...new Set([...removeFromTerrain.value, ...removeFromSnapping.value])]);

const removeLabel = computed(() => {
    if (removeFromTerrain.value.length && removeFromSnapping.value.length) return 'Remove from both';
    return removeFromTerrain.value.length ? 'Remove from terrain' : 'Remove from snapping';
});

const removeTitle = computed(() => {
    const parts: string[] = [];
    if (removeFromTerrain.value.length) parts.push(`terrain: ${abbrs(removeFromTerrain.value).join(', ')}`);
    if (removeFromSnapping.value.length) parts.push(`snapping: ${abbrs(removeFromSnapping.value).join(', ')}`);
    return `Remove from ${parts.join('; ')}`;
});

/** 'add' = download the selected states; 'apply' = only detail/category changes for the existing layers */
const action = computed<'add' | 'apply' | null>(() => {
    if (!req.value.terrain.enabled && !req.value.snapping.enabled) return null;
    if (selected.value.size) return 'add';
    if ((req.value.terrain.enabled && detailChanged.value) || (req.value.snapping.enabled && categoriesChanged.value)) return 'apply';
    return null;
});

const idleHint = computed(() => {
    if (!req.value.terrain.enabled && !req.value.snapping.enabled) return 'Turn on terrain or snapping.';
    return 'Select states to download.';
});

const terrainLine = computed(() => {
    const t = estimate.value?.terrain;
    if (!t) return '';
    if (!t.states) return 'Terrain: layer will be deleted';
    const dl = t.newTiles ? `~${formatBytes(t.bytes)} to download` : 'no new downloads';
    return `Terrain: ${t.states} state(s) at ${detailName(t.maxzoom)} · ${dl}`;
});

const snappingLine = computed(() => {
    const s = estimate.value?.snapping;
    if (!s) return '';
    if (!s.states) return 'Snapping: layer will be deleted';
    const dl = s.downloads.length ? `download ${abbrs(s.downloads).join(', ')} (${formatBytes(s.download)})` : 'rebuild from cached data';
    return `Snapping: ${s.states} state(s) · ${dl}`;
});

const busy = computed(() => !!job.value && (job.value.status === 'queued' || job.value.status === 'running'));

const canStart = computed(() => {
    if (!action.value || busy.value || planning.value || !estimate.value || planError.value) return false;
    if (req.value.snapping.enabled && !categories.value.size) return false;
    const e = estimate.value;
    if (e.terrain.touched && e.terrain.tiles > e.terrain.limit) return false;
    return e.terrain.touched || e.snapping.touched;
});

function abbrs(slugs: string[]): string[] {
    const set = new Set(slugs);
    return states.value.filter((s) => set.has(s.slug)).map((s) => s.abbr);
}

function categoryNames(ids: string[]): string {
    const labels = categoryList.value.filter((c) => ids.includes(c.id)).map((c) => c.label);
    if (labels.length && labels.length === categoryList.value.length) return 'All categories';
    return labels.join(', ');
}

function detailName(z: number): string {
    return (Object.keys(DETAIL).find((k) => DETAIL[k] === z) ?? `z${z}`).replace(/ \(.*$/, '');
}

function stateTitle(s: StateItem): string {
    const parts = [s.name];
    if (inTerrain.value.has(s.slug)) parts.push('in terrain layer');
    if (inSnapping.value.has(s.slug)) parts.push('in snapping layer');
    return parts.join(' - ');
}

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
        add: [...selected.value],
        remove: [],
        terrain: { enabled: req.value.terrain.enabled, maxzoom: maxzoom.value },
        snapping: { enabled: req.value.snapping.enabled, categories: selectedCategoryIds.value },
    };
}

/**
 * Removal applies to each layer whose switch is on. It keeps that layer's current detail
 * level and categories, so half-made form changes are not applied along with the removal.
 */
function removeBody(): JobRequest {
    const terrainOn = removeFromTerrain.value.length > 0;
    const snappingOn = removeFromSnapping.value.length > 0;
    return {
        add: [],
        remove: removable.value,
        terrain: { enabled: terrainOn, maxzoom: status.value?.terrain?.maxzoom ?? maxzoom.value },
        snapping: { enabled: snappingOn, categories: status.value?.snapping?.categories ?? selectedCategoryIds.value },
    };
}

function statusClass(s: Job['status']): string {
    if (s === 'success') return 'bg-green text-white';
    if (s === 'failed') return 'bg-red text-white';
    if (s === 'cancelled') return 'bg-secondary text-white';
    return 'bg-blue text-white';
}

function schedulePlan(): void {
    if (planTimer) clearTimeout(planTimer);
    // Invalidate any estimate still in flight so it can't land after the inputs changed
    planSeq++;
    planning.value = false;
    estimate.value = null;
    planError.value = '';
    if (!action.value) return;
    if (req.value.snapping.enabled && !categories.value.size) return;
    planTimer = setTimeout(() => { void runPlan(); }, 500);
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

watch([selected, detail, categories, () => req.value.terrain.enabled, () => req.value.snapping.enabled, status], schedulePlan);

async function refreshStatus(): Promise<void> {
    status.value = await getStatus();
}

/** Adopt the master layers' current settings as the form's starting point */
function syncFormToStatus(): void {
    const s = status.value;
    if (s?.terrain) {
        const z = s.terrain.maxzoom;
        const label = Object.keys(DETAIL).find((k) => DETAIL[k] === z);
        if (label) detail.value = label;
    }
    categories.value = new Set(s?.snapping?.categories ?? categoryList.value.filter((c) => c.default).map((c) => c.id));
}

/** After a job: reload the status and update this map without a page reload */
async function afterJob(finished: Job): Promise<void> {
    const before = status.value;
    await refreshStatus();
    const after = status.value;
    if (finished.status !== 'success') return;

    selected.value = new Set();
    syncFormToStatus();

    try {
        if (after?.terrain?.basemap && after.terrain.updated !== before?.terrain?.updated) {
            await showTerrainNow(after.terrain.basemap, `Terrain (${detailName(after.terrain.maxzoom)})`);
        } else if (!after?.terrain && before?.terrain?.basemap) {
            await dropTerrainNow(before.terrain.basemap);
        }
    } catch (err) {
        console.error('[terrain-data-downloader] live refresh failed', err);
        notice.value = 'Layers updated. Use Settings -> Refresh App to see them on this map.';
    }
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
                await afterJob(next);
            }
        } catch (err) {
            stopPolling();
            notice.value = err instanceof Error ? err.message : String(err);
        }
    }, 2000);
}

async function submit(request: JobRequest): Promise<void> {
    notice.value = '';
    try {
        job.value = await startJob(request);
        startPolling(job.value.id);
    } catch (err) {
        planError.value = err instanceof Error ? err.message : String(err);
    }
}

async function start(): Promise<void> {
    await submit(body());
}

async function removeSelected(): Promise<void> {
    const lines: string[] = [];
    if (removeFromTerrain.value.length) {
        const left = inTerrain.value.size - removeFromTerrain.value.length;
        lines.push(`Terrain: remove ${abbrs(removeFromTerrain.value).join(', ')}${left ? '' : ' (deletes the terrain layer)'}`);
    }
    if (removeFromSnapping.value.length) {
        const left = inSnapping.value.size - removeFromSnapping.value.length;
        lines.push(`Snapping: remove ${abbrs(removeFromSnapping.value).join(', ')}${left ? '' : ' (deletes the snapping layer)'}`);
    }
    if (!window.confirm(`${lines.join('\n')}\n\nContinue?`)) return;
    await submit(removeBody());
}

async function cancel(): Promise<void> {
    if (!job.value) return;
    job.value = await cancelJob(job.value.id);
}

onMounted(async () => {
    try {
        [states.value, categoryList.value] = await Promise.all([listStates(), listCategories()]);
        await refreshStatus();
        syncFormToStatus();

        // Resume the most recent job (e.g. after navigating away mid-download)
        const jobs = await listJobs();
        const latest = jobs[0];
        if (latest) {
            job.value = latest;
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

.tdd-min0 {
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
