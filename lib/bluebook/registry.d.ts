import { BluebookRuleSet } from "./types";
declare class BluebookRuleSetRegistry {
    private ruleSets;
    register(ruleSet: BluebookRuleSet): void;
    unregister(id: string): void;
    get(id: string): BluebookRuleSet | undefined;
    list(): BluebookRuleSet[];
}
export declare const bluebookRuleSetRegistry: BluebookRuleSetRegistry;
export { BluebookRuleSetRegistry };
