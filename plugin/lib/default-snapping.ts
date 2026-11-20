/**
 * Preselects the admin-chosen default snapping layer in every user's line tool.
 *
 * CloudTAK has no server setting for this: the line tool always opens on "No Snapping" and
 * fills its list (draw.populateSnappingLayers) each time a line drawing starts. This watcher
 * waits for that list and selects the default once per drawing, so users can still switch
 * to another layer or back to "No Snapping" while drawing.
 */
import { watch } from 'vue';
import type { Pinia } from 'pinia';
import { useMapStore } from '../../../src/stores/map.ts';
import { getSettings } from './api.ts';

const NO_SNAPPING = 'No Snapping';
const LINE_MODES = new Set(['linestring', 'routesnap']);

export function startDefaultSnapping(pinia: Pinia): () => void {
    const mapStore = useMapStore(pinia);
    let applied = false;
    let defaultId: number | null = null;
    let lookup: Promise<void> | null = null;

    const draw = () => {
        try {
            return mapStore.draw;
        } catch {
            return null; // drawing tools not initialised yet
        }
    };

    const apply = (): void => {
        const d = draw();
        if (!d || applied || defaultId === null) return;
        if (d.snappingLayer !== NO_SNAPPING) { applied = true; return; }

        for (const [name, def] of d.route.definitions) {
            if (Number((def as { id?: unknown }).id) === defaultId) {
                applied = true;
                d.snappingLayer = name;
                return;
            }
        }
    };

    return watch(
        () => {
            const d = draw();
            return d ? `${d.mode}|${d.snappingOptions.length}` : '';
        },
        () => {
            const d = draw();
            if (!d) return;

            if (!LINE_MODES.has(String(d.mode))) {
                applied = false;
                lookup = null;
                return;
            }

            // Re-read the setting at the start of each drawing so admin changes apply without a reload
            if (!lookup) {
                lookup = getSettings()
                    .then((s) => { defaultId = s.snapping; })
                    .catch(() => { defaultId = null; })
                    .then(() => apply());
            } else {
                apply();
            }
        },
    );
}
