import type { Plugin } from 'rolldown';
import { createPlugin, type PluginOptions } from './plugin';

export interface RolldownPluginOptions extends PluginOptions {}

export function qwik(options: RolldownPluginOptions = {}): Plugin {
	return createPlugin(options).plugin;
}
