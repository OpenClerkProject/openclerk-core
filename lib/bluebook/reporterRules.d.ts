import { ParsedCitation } from "../providers/types";
import { BluebookIssue } from "./types";
import { ManualReporterCorrection, ManualValidReporterForm } from "./manualCorrections";
type ReporterLookup = {
    validForms: Record<string, string>;
    corrections: Record<string, {
        correctForm: string;
        name: string;
    }>;
};
/**
 * Layers community-contributed overrides (manualCorrections.ts) on top of the vendored
 * reporters-db lookup -- a manual valid-form entry always wins (removes any conflicting
 * generated "correction"), and a manual correction is skipped if something already accepts
 * that form as valid. Exported and kept pure so it's unit-testable with fixture data,
 * independent of the real (normally empty) manual-corrections file.
 */
export declare function applyManualReporterOverrides(generated: ReporterLookup, manualCorrections: ManualReporterCorrection[], manualValidForms: ManualValidReporterForm[]): ReporterLookup;
/**
 * Builds a "spacing-insensitive" index of validForms -- keyed by each valid form with internal
 * whitespace removed, mapping to the correctly-spaced form -- to catch Bluebook Rule 6.1 spacing
 * mistakes (e.g. "S.Ct." instead of "S. Ct.") generically. reporters-db's recorded "variations"
 * only cover the specific malformed spellings someone bothered to record (same limitation noted
 * for the ordinal-typo check above); a spot-check found 805 of the 920 valid forms that contain
 * internal spacing have no recorded spacing-variant correction at all. A form that multiple
 * distinct valid forms collapse to (rare, but possible) is excluded rather than guessed at.
 */
export declare function buildReporterSpacingLookup(forms: Record<string, string>): Record<string, string>;
/**
 * Checks a citation's reporter abbreviation against Free Law Project's reporters-db (Table T1
 * data, see generated/reporterAbbreviations.generated.ts) -- vendored at dev time from
 * https://github.com/freelawproject/reporters-db, not fetched at runtime.
 *
 * Edition-independent: reporter abbreviations themselves don't change between Bluebook
 * editions the way case-name/statutory abbreviations do, so this applies to every edition.
 */
export declare function checkReporterAbbreviation(citation: ParsedCitation): BluebookIssue[];
export {};
