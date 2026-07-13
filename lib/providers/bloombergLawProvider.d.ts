import { CitationMatch, ParsedCitation, ProviderCredentialField } from "./types";
import { EnterpriseCitationProvider } from "./base";
export declare class BloombergLawProvider extends EnterpriseCitationProvider {
    readonly id = "bloomberglaw";
    readonly name = "Bloomberg Law";
    readonly description = "Looks up citations through your organization's Bloomberg Law API subscription. Requires the API base URL and client credentials issued under your firm's Bloomberg Law contract.";
    readonly credentialFields: ProviderCredentialField[];
    private accessToken;
    protected verifyCredentials(credentials: Record<string, string>): Promise<void>;
    signOut(): void;
    lookupCitation(citation: ParsedCitation): Promise<CitationMatch | null>;
}
