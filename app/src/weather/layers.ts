// Loads every provider in ./providers (each file registers itself). Import this once.
import.meta.glob('./providers/*.ts', { eager: true });
export { allLayers, getLayer } from './registry';
