"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCitationsForHallucinations = exports.expandPincitePages = exports.caseNamesMatch = exports.findOrphanedCitations = exports.clusterCitationTokens = exports.extractCitationTokens = exports.extractCaseCitations = exports.parseCaseCitation = exports.citationProviderRegistry = void 0;
const registry_1 = require("./registry");
const courtListenerProvider_1 = require("./courtListenerProvider");
const lexisNexisProvider_1 = require("./lexisNexisProvider");
const westlawProvider_1 = require("./westlawProvider");
const bloombergLawProvider_1 = require("./bloombergLawProvider");
const usptoPatentCenterProvider_1 = require("./usptoPatentCenterProvider");
registry_1.citationProviderRegistry.register(new courtListenerProvider_1.CourtListenerProvider());
registry_1.citationProviderRegistry.register(new lexisNexisProvider_1.LexisNexisProvider());
registry_1.citationProviderRegistry.register(new westlawProvider_1.WestlawProvider());
registry_1.citationProviderRegistry.register(new bloombergLawProvider_1.BloombergLawProvider());
registry_1.citationProviderRegistry.register(new usptoPatentCenterProvider_1.UsptoPatentCenterProvider());
var registry_2 = require("./registry");
Object.defineProperty(exports, "citationProviderRegistry", { enumerable: true, get: function () { return registry_2.citationProviderRegistry; } });
__exportStar(require("./types"), exports);
var citationParser_1 = require("./citationParser");
Object.defineProperty(exports, "parseCaseCitation", { enumerable: true, get: function () { return citationParser_1.parseCaseCitation; } });
Object.defineProperty(exports, "extractCaseCitations", { enumerable: true, get: function () { return citationParser_1.extractCaseCitations; } });
Object.defineProperty(exports, "extractCitationTokens", { enumerable: true, get: function () { return citationParser_1.extractCitationTokens; } });
Object.defineProperty(exports, "clusterCitationTokens", { enumerable: true, get: function () { return citationParser_1.clusterCitationTokens; } });
Object.defineProperty(exports, "findOrphanedCitations", { enumerable: true, get: function () { return citationParser_1.findOrphanedCitations; } });
Object.defineProperty(exports, "caseNamesMatch", { enumerable: true, get: function () { return citationParser_1.caseNamesMatch; } });
var pincitePages_1 = require("./pincitePages");
Object.defineProperty(exports, "expandPincitePages", { enumerable: true, get: function () { return pincitePages_1.expandPincitePages; } });
var hallucinationCheck_1 = require("./hallucinationCheck");
Object.defineProperty(exports, "checkCitationsForHallucinations", { enumerable: true, get: function () { return hallucinationCheck_1.checkCitationsForHallucinations; } });
