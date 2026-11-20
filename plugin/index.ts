import type { App } from 'vue';
import { h } from 'vue';
import type { PluginAPI, PluginInstance } from '../../plugin.ts';
import MenuTemplate from '../../src/components/CloudTAK/util/MenuTemplate.vue';
import { IconMountain } from '@tabler/icons-vue';
import TerrainDownloader from './lib/TerrainDownloader.vue';
import { ROUTE_NAME, MENU_KEY } from './lib/api.ts';
import { startDefaultSnapping } from './lib/default-snapping.ts';

export default class TerrainDataDownloader implements PluginInstance {
    api: PluginAPI;
    stopSnapping: (() => void) | null = null;

    constructor(api: PluginAPI) {
        this.api = api;

        // Routes are registered once and never removed: CloudTAK may call disable()
        // before enable(), and menu.add() silently fails if its route is missing.
        // Admin-only is enforced the same way as Sidebar Configurator / Quick Point Dropper:
        // requiresSystemAdmin on the menu item + Auth.as_user(..., { admin: true }) on every API route.
        this.api.routes.add({
            path: 'plugin-terrain-data-downloader',
            name: ROUTE_NAME,
            component: {
                render: () => h(MenuTemplate, { name: 'Terrain Data Downloader', back: false }, {
                    default: () => h(TerrainDownloader),
                }),
            },
        }, 'home-menu');
    }

    static async install(_app: App, api: PluginAPI): Promise<PluginInstance> {
        return new TerrainDataDownloader(api);
    }

    async enable(): Promise<void> {
        this.api.menu.remove(MENU_KEY);
        this.api.menu.add({
            key: MENU_KEY,
            label: 'Terrain Data Downloader',
            route: ROUTE_NAME,
            tooltip: 'Terrain Data Downloader (Admin)',
            description: 'Download US state terrain and snapping data into CloudTAK',
            icon: IconMountain,
            badge: 'A',
            requiresSystemAdmin: true,
        });

        // Runs for every user: applies the admin's default snapping layer in the line tool
        if (!this.stopSnapping) this.stopSnapping = startDefaultSnapping(this.api.pinia);
    }

    async disable(): Promise<void> {
        this.api.menu.remove(MENU_KEY);
        if (this.stopSnapping) {
            this.stopSnapping();
            this.stopSnapping = null;
        }
    }
}
