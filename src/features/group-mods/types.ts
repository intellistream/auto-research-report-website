export type Decision = "included" | "pending" | "excluded" | "reference_only";
export type StageMapping={version:string;status:"mapped"|"unmapped";basis:string;unmappedReason:string|null;sourcePhases:string[];sourceRefs:{sourceId:string;jsonPointer:string;identityValue:string;valueSha256:string}[]};
export type Mod = {
 id:string; componentId:string; displayName:string; sourceName:string; aliases:string[];
 eligibility:{decision:Decision;reason:string};kind:string;lifecycle:string;
 originalStatus:Record<string,string|null>;
 facts:{problem:string|null;problemBasis:string;summary:string;effect:string|null;compatibility:Record<string,unknown>};
 maintainers:{login:string;name:string}[];projectLead:null;repository:string|null;codeVisibility:string;
 attribution:string;stages:string[];stageMapping?:StageMapping;canonicalPage:string;fieldHashes:Record<string,string>;
 sourceRefs:{sourceSnapshotId:string;locator:string;identityValue:string;valueSha256:string}[];
 unknownFields:string[];reviewScope:string;
};
export type Source={id:string;canonicalWorkId:string;kind:string;title:string;titleZh?:string|null;url:string;observedOn:string;version:Record<string,unknown>;contentSha256:string;locator?:Record<string,string>;reviewScope:string;publicExcerpt:string;reportReferences?:{role:string;title:string;href:string;day?:string;version?:string;entryNumber?:string}[]};
export type Relation={
 id:string;modId:string;communityWorkId:string;relationType:string;reviewStatus:"supported"|"candidate"|"unsupported"|"withdrawn";assessedOn:string;assessedBy:string;
 commonProblem:string;modApproach:string;communityApproach:string;differences:string[];
 associationReason?:string;comparisonAxes?:{dimension:string;mod:string;community:string}[];researchSignificance?:string;
 codeReferences?:{side:"mod"|"community";label:string;url:string;revision:string;excerpt:string}[];
 applicability:{state:string;checks:{dimension:string;mod:string;community:string;result:string}[]};
 reusableCapability:string;forbiddenInference:string;conclusionScope:string;performanceTransfer:string;
 reviewNeeded:boolean;reviewNeededReasons:string[];sourceSnapshotId:string;
 modEvidence:{sourceId:string;jsonPointer:string;identityValue:string;valueSha256:string;sourceSnapshotId:string}[];
 communityEvidence:{sourceId:string;locator:Record<string,string>;sourceVersion:Record<string,unknown>}[];
 reviewedAgainst:Record<string,unknown>;currentAgainst:Record<string,unknown>;
};
export type Question={
 id:string;modIds:string[];relationIds:string[];title:string;kind:string;status:string;experimentStatus:string;
 purpose?:"research"|"verification";researchContext?:{modProgress:string;communityProgress:string;difference:string;significance:string};verificationTasks?:string[];
 basis:string;hypothesis:string|null;reviewNeeded:boolean;owner:string|null;lastReviewedOn:string;
 minimumValidation:{prerequisites:string;baselines:string[];controls:string[];metrics:string[];failureCriterion:string};
 resolution:null|Record<string,unknown>;
};
export type CorpusSummary={corpusId:string;generatedAt:string;periodStart:string;periodEnd:string;counts:Record<string,number|Record<string,number>>;inputCount:number;note:string};
export type Screening={corpusId:string;status:"screened";candidateCount:number;reviewedCount:number;pendingCount:number;note:string};
export type Coverage={modId:string;primaryRelationId?:string;screening?:Screening;comparisonStatus:string;missingEvidenceMessage:string;searchScope:string;topicContexts:{topicId:string;relation:string;basis:string}[]};
export type Change={id:string;kind:string;recordedOn:string;title:string;detail:string;modIds:string[];previousSnapshotId?:string;sourceId?:string;before?:Record<string,unknown>;after?:Record<string,unknown>};
export type Bundle={schemaVersion:1;ruleVersion:string;payloadSha256:string;payload:{
 asOf:string;stageMappingVersion?:string;corpusSummary?:CorpusSummary;sourceChain:Record<string,unknown>;previousSnapshotId:string|null;mods:Mod[];relations:Relation[];questions:Question[];
 sourceSnapshots:Source[];coverage:Coverage[];reviews:{id:string;entityId:string;recordedAt:string;actor:string;action:string;rationale:string}[];
 changes:Change[];audit:{id:string;name:string;decision:Decision;reason:string;kind:string|null;lifecycle:string|null}[];
 stages:Record<string,string>;scopeNotice:string;
}};
export type Snapshot={snapshotId:string;previousSnapshotId:string|null;bundlePath:string|null;bundleSha256:string|null;asOf:string;isBaseline:boolean;withdrawn?:boolean;counts:{mods:number;supportedMods:number;relations:number;questions:number;reviewNeeded:number}};
export type ModSearch={componentId:string;displayName:string;aliases:string[];problemSummary:string;maintainerNames:string[];stageIds:string[];relatedWorks?:string[];topicIds?:string[];eligibilityLabel:string};
export type GroupIndex={schemaVersion:1;currentSnapshotId:string;snapshots:Snapshot[];modSearchIndex:ModSearch[]};
