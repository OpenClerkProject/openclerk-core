"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BluebookRuleSetRegistry = exports.bluebookRuleSetRegistry = void 0;
class BluebookRuleSetRegistry {
    constructor() {
        this.ruleSets = new Map();
    }
    register(ruleSet) {
        this.ruleSets.set(ruleSet.id, ruleSet);
    }
    unregister(id) {
        this.ruleSets.delete(id);
    }
    get(id) {
        return this.ruleSets.get(id);
    }
    list() {
        return Array.from(this.ruleSets.values());
    }
}
exports.BluebookRuleSetRegistry = BluebookRuleSetRegistry;
exports.bluebookRuleSetRegistry = new BluebookRuleSetRegistry();
