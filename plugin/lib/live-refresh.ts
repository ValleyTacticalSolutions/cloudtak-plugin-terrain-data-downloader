/**
 * Make a rebuilt master terrain layer appear on the current map without a page reload.
 *
 * CloudTAK only reads the user's overlay list at startup, and its default-terrain provisioning
 * (ensureDefaultTerrain) runs during that sync and adds the overlay hidden. So after a job the
 * map would keep showing the old terrain (or none) until a hard refresh. This syncs the overlay
 * list, makes the master terrain the visible, active terrain, and re-creates its overlay so
 * MapLibre drops tiles cached from the previous file (the tile URLs stay the same because the
 * master basemap keeps its id).
 */
import { apiUrl } from './host.ts';

// The overlay list lives in CloudTAK's own database and managers, which only the compiled web
// build can reach. In the runtime bundle (native apps) these imports are replaced by a module
// that throws, and the caller falls back to asking the user to use Settings -> Refresh App.
async function core() {
    const [{ default: OverlayManager }, { useMapStore }] = await Promise.all([
        import('../../../src/base/overlay.ts'),
        import('../../../src/stores/map.ts')
    ]);
    return { OverlayManager, mapStore: useMapStore() };
}

export async function showTerrainNow(basemapId: number, name: string): Promise<void> {
    const { OverlayManager, mapStore } = await core();
    const modeId = String(basemapId);

    await OverlayManager.sync();
    await mapStore.reconcileOverlays();

    // Only one terrain is active at a time - hide any other terrain overlay so the master applies
    for (const overlay of [...OverlayManager.loaded]) {
        if (overlay.type === 'raster-dem' && overlay.mode_id !== modeId && overlay.visible) {
            await overlay.update({ visible: false });
        }
    }

    const existing = OverlayManager.loadedByMode('overlay', modeId);
    if (existing) await OverlayManager.deleteLoaded(existing);

    await OverlayManager.createLoaded({
        url: String(await apiUrl(`/api/basemap/${basemapId}/tiles`)),
        name,
        mode: 'overlay',
        mode_id: modeId,
        type: 'raster-dem',
        visible: true,
    });
}

/** Remove the terrain overlay from the current map after the master terrain layer was deleted */
export async function dropTerrainNow(basemapId: number): Promise<void> {
    const { OverlayManager } = await core();
    const existing = OverlayManager.loadedByMode('overlay', String(basemapId));
    if (existing) await OverlayManager.deleteLoaded(existing);
}
