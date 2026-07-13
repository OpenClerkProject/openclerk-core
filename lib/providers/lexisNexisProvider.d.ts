import { CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
import { EnterpriseCitationProvider } from "./base";
export declare class LexisNexisProvider extends EnterpriseCitationProvider {
    readonly id = "lexisnexis";
    readonly name = "LexisNexis";
    readonly description = "Looks up citations through your organization's LexisNexis API subscription. Requires the API base URL and client credentials issued under your firm's LexisNexis contract.";
    readonly credentialFields: ProviderCredentialField[];
    private accessToken;
    protected verifyCredentials(credentials: Record<string, string>): Promise<void>;
    signOut(): void;
    lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null>;
}
