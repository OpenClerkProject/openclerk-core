import { CitationProvider } from "./types";
/**
 * Plugin registry for citation lookup providers. Built-in providers register
 * themselves in index.ts; a third-party or firm-specific provider can be
 * added the same way from anywhere that imports this module, without
 * touching the built-ins.
 */
declare class CitationProviderRegistry {
    private providers;
    register(provider: CitationProvider): void;
    unregister(id: string): void;
    get(id: string): CitationProvider | undefined;
    list(): CitationProvider[];
}
export declare const citationProviderRegistry: CitationProviderRegistry;
export { CitationProviderRegistry };
