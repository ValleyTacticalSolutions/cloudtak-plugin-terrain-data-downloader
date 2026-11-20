import type { App } from 'vue';
import { h } from 'vue';
import type { PluginAPI, PluginInstance } from '../../plugin.ts';
import MenuTemplate from '../../src/components/CloudTAK/util/MenuTemplate.vue';
import { IconMountain } from '@tabler/icons-vue';
import TerrainDownloader from './lib/TerrainDownloader.vue';
import { ROUTE_NAME, MENU_KEY } from './lib/api.ts';

export default class TerrainDataDownloader implements PluginInstance {
    api: PluginAPI;

    constructor(api: PluginAPI) {
        this.api = api;

        // Routes are registered once and never removed: CloudTAK may call disable()
        // before enable(), and menu.add() silently fails if its route is missing.
        this.api.routes.add({
            path: 'plugin-terrain-data-downloader',
            name: ROUTE_NAME,
            component: {
                render: () => h(MenuTemplate, { name: 'Terrain Data Downloader' }, {
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
            tooltip: 'Terrain Data Downloader',
            description: 'Download US state terrain and road/trail snapping data into CloudTAK',
            icon: IconMountain,
            requiresSystemAdmin: true,
        });
    }

    async disable(): Promise<void> {
        this.api.menu.remove(MENU_KEY);
    }
}
