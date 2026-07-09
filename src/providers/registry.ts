import { CitationProvider } from "./types";

/**
 * Plugin registry for citation lookup providers. Built-in providers register
 * themselves in index.ts; a third-party or firm-specific provider can be
 * added the same way from anywhere that imports this module, without
 * touching the built-ins.
 */
class CitationProviderRegistry {
  private providers = new Map<string, CitationProvider>();

  register(provider: CitationProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  get(id: string): CitationProvider | undefined {
    return this.providers.get(id);
  }

  list(): CitationProvider[] {
    return Array.from(this.providers.values());
  }
}

export const citationProviderRegistry = new CitationProviderRegistry();
export { CitationProviderRegistry };
