import { CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
import { EnterpriseCitationProvider } from "./base";
export declare class WestlawProvider extends EnterpriseCitationProvider {
    readonly id = "westlaw";
    readonly name = "Westlaw";
    readonly description = "Looks up citations through your organization's Westlaw / Thomson Reuters API subscription. Requires the API base URL and client credentials issued under your firm's Westlaw contract.";
    readonly credentialFields: ProviderCredentialField[];
    private accessToken;
    protected verifyCredentials(credentials: Record<string, string>): Promise<void>;
    signOut(): void;
    lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null>;
}
