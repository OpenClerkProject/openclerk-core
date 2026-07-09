import { CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
import { EnterpriseCitationProvider } from "./base";

/**
 * TODO: USPTO Patent Center lookups are not implemented yet.
 *
 * This is a placeholder registration so the provider shows up in the Online
 * Lookup provider list and the plugin wiring (registry, UI, credential
 * rendering) can be exercised end-to-end before the real integration lands.
 * USPTO Patent Center (patentcenter.uspto.gov) fronts Patent Examination
 * Data System (PEDS) / Open Data Portal APIs for filings and prosecution
 * history rather than case-law citations, so lookupCitation() intentionally
 * always resolves to null ("move on") until that's built out.
 */
export class UsptoPatentCenterProvider extends EnterpriseCitationProvider {
  readonly id = "uspto-patent-center";
  readonly name = "USPTO Patent Center (TODO)";
  readonly description =
    "Not yet implemented. Intended to look up patent filings/prosecution history via USPTO Patent Center for the Non-patent Literature workflow.";
  readonly credentialFields: ProviderCredentialField[] = [];

  protected async verifyCredentials(): Promise<void> {
    throw new Error("USPTO Patent Center lookups are not implemented yet.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match CitationProvider
  async lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null> {
    return null;
  }
}
