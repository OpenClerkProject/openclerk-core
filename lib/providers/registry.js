"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CitationProviderRegistry = exports.citationProviderRegistry = void 0;
/**
 * Plugin registry for citation lookup providers. Built-in providers register
 * themselves in index.ts; a third-party or firm-specific provider can be
 * added the same way from anywhere that imports this module, without
 * touching the built-ins.
 */
class CitationProviderRegistry {
    constructor() {
        this.providers = new Map();
    }
    register(provider) {
        this.providers.set(provider.id, provider);
    }
    unregister(id) {
        this.providers.delete(id);
    }
    get(id) {
        return this.providers.get(id);
    }
    list() {
        return Array.from(this.providers.values());
    }
}
exports.CitationProviderRegistry = CitationProviderRegistry;
exports.citationProviderRegistry = new CitationProviderRegistry();
