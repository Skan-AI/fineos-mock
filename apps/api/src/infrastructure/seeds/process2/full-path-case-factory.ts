import {
  createDiagnosisCode,
  toCaseId,
  toPartyId,
  type AbsenceComponent,
  type AbsenceConditionDetails,
  type CaseAlert,
  type CaseDocument,
  type CaseEForm,
  type CaseId,
  type CaseLookup,
  type CaseMapNode,
  type CaseNextAction,
  type CaseTask,
  type DiagnosisCode,
  type DossierField,
  type DossierPanel,
  type GdcComponent,
  type LeaveReason,
  type LookupContent,
  type Process2Dossier,
  type Process2PartyProfile,
  type ProviderDetails,
} from "@fineos/contracts";
import type { Process2CaseSeed } from "./types";

export type CoveredRequestCategory =
  | "Accident or treatment required for an injury"
  | "Sickness, treatment required for a medical condition or any other medical procedure"
  | "Pregnancy, birth or related medical treatment";

interface DiagnosisOption {
  readonly code: string;
  readonly description: string;
}

interface DiagnosisStory {
  readonly expected: DiagnosisOption;
  readonly decoys: readonly [DiagnosisOption, DiagnosisOption];
  readonly evidenceExcerpt: string;
}

interface ProviderConfig {
  readonly partyId: string;
  readonly customerNumber: string;
  readonly fullName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly nationalProviderIdentifier: string;
  readonly specialty: string;
}

export interface FullPathCaseConfig {
  readonly root: string;
  readonly claimantPartyId: string;
  readonly customerNumber: string;
  readonly claimantName: string;
  readonly dateOfBirth: string;
  readonly gender: string;
  readonly maritalStatus: string;
  readonly email: string;
  readonly phone: string;
  readonly addressLine: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly employer: string;
  readonly jobTitle: string;
  readonly employeeId: string;
  readonly hireDate: string;
  readonly notificationDate: string;
  readonly lastDayWorked: string;
  readonly leaveStart: string;
  readonly leaveEnd: string;
  readonly firstTreatmentDate: string;
  readonly surgeryDate: string;
  readonly leaveReason: Extract<LeaveReason, "serious_health_condition" | "pregnancy">;
  readonly leaveReasonLabel: string;
  readonly requestCategory: CoveredRequestCategory;
  readonly eventType: "Accident" | "Sickness" | "Pregnancy";
  readonly conditionDescription: string;
  readonly procedure: string;
  readonly conditionCategory: string;
  readonly diagnosis: DiagnosisStory;
  readonly provider: ProviderConfig;
}

interface SeedIds {
  readonly root: CaseId;
  readonly absence: CaseId;
  readonly gdc: CaseId;
  readonly claimant: ReturnType<typeof toPartyId>;
  readonly provider: ReturnType<typeof toPartyId>;
}

const idsFor = (config: FullPathCaseConfig): SeedIds => ({
  root: toCaseId(config.root),
  absence: toCaseId(`${config.root}-ABS-01`),
  gdc: toCaseId(`${config.root}-GDC-02`),
  claimant: toPartyId(config.claimantPartyId),
  provider: toPartyId(config.provider.partyId),
});

const internalId = (config: FullPathCaseConfig, suffix: string): string =>
  `${config.root}-${suffix}`;

const isValidNpi = (npi: string): boolean => {
  if (!/^\d{10}$/.test(npi)) return false;
  const digits = [...`80840${npi}`].map(Number);
  const total = digits.reduceRight((sum, digit, index) => {
    const doubled = (digits.length - index) % 2 === 0 ? digit * 2 : digit;
    return sum + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return total % 10 === 0;
};

const validateConfig = (config: FullPathCaseConfig): void => {
  const codes = [config.diagnosis.expected.code, ...config.diagnosis.decoys.map(({ code }) => code)];
  if (!isValidNpi(config.provider.nationalProviderIdentifier)) {
    throw new Error(`Invalid provider NPI for ${config.root}`);
  }
  if (new Set(codes).size !== codes.length) {
    throw new Error(`Duplicate diagnosis code for ${config.root}`);
  }
};

const displayDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
};

const field = (key: string, label: string, value: string, route?: string): DossierField =>
  route ? { key, label, value, route } : { key, label, value };

const panel = (id: string, title: string, fields: readonly DossierField[]): DossierPanel =>
  ({ id, title, fields });

const profilePanels = (config: FullPathCaseConfig): readonly DossierPanel[] => [
  panel(internalId(config, "PANEL-PERSONAL"), "Personal Details", [
    field("name", "Name", config.claimantName),
    field("dateOfBirth", "Date of Birth", displayDate(config.dateOfBirth)),
    field("gender", "Gender", config.gender),
    field("maritalStatus", "Marital Status", config.maritalStatus),
  ]),
];

const contactPanels = (config: FullPathCaseConfig): readonly DossierPanel[] => [
  panel(internalId(config, "PANEL-CONTACT"), "Contact Details", [
    field("phone", "Mobile Phone", config.phone),
    field("email", "Email", config.email),
    field("preferredContact", "Preferred Contact Method", "Email"),
  ]),
];

const communicationPanels = (config: FullPathCaseConfig): readonly DossierPanel[] => [
  panel(internalId(config, "PANEL-COMMUNICATION"), "Communication Preferences", [
    field("goPaperless", "Go paperless", "Yes"),
    field("emailUpdates", "Notify on update via Email", "Yes"),
    field("preferredLanguage", "Preferred language", "English"),
  ]),
];

const employmentPanels = (config: FullPathCaseConfig): readonly DossierPanel[] => [
  panel(internalId(config, "PANEL-EMPLOYMENT"), "Occupation & Employment", [
    field("employer", "Employer", config.employer),
    field("jobTitle", "Job Title", config.jobTitle),
    field("employeeId", "Employee ID", config.employeeId),
    field("dateOfHire", "Date of Hire", displayDate(config.hireDate)),
    field("workState", "Work State", config.state),
    field("employmentStatus", "Employment Status", "Active"),
  ]),
];

const partyProfile = (config: FullPathCaseConfig, ids: SeedIds): Process2PartyProfile => ({
  partyId: ids.claimant, fullName: config.claimantName, customerNumber: config.customerNumber,
  gender: config.gender, maritalStatus: config.maritalStatus, preferredLanguage: "English",
  identifiers: [{ type: "Employee ID", value: config.employeeId }],
  addresses: [{ type: "Home", line1: config.addressLine, city: config.city, region: config.state, postalCode: config.postalCode, country: "USA" }],
  profilePanels: profilePanels(config), contactPanels: contactPanels(config),
  communicationPreferences: communicationPanels(config),
  occupationEmploymentPanels: employmentPanels(config),
});

const conditionDetails = (config: FullPathCaseConfig): AbsenceConditionDetails => ({
  leaveReason: config.leaveReason,
  workState: config.state,
  description: config.conditionDescription,
  fields: [
    field("leaveReason", "Leave Reason", config.leaveReasonLabel),
    field("workState", "Work State", config.state),
    field("conditionDescription", "Condition Description", config.conditionDescription),
  ],
});

const providerPanels = (config: FullPathCaseConfig): readonly DossierPanel[] => [
  panel(internalId(config, "PANEL-PROVIDER"), "Provider Details", [
    field("name", "Provider", config.provider.fullName),
    field("specialty", "Provider Type", config.provider.specialty),
    field("npi", "National Provider Identifier", config.provider.nationalProviderIdentifier),
  ]),
];

const providerDetails = (config: FullPathCaseConfig, ids: SeedIds): ProviderDetails => ({
  partyId: ids.provider, fullName: config.provider.fullName,
  customerNumber: config.provider.customerNumber,
  nationalProviderIdentifier: config.provider.nationalProviderIdentifier,
  providerType: config.provider.specialty, serviceGroup: "Medical",
  approvalIndicator: "Approved", approvalStartDate: config.notificationDate,
  approvalEndDate: "-", certifications: [], panels: providerPanels(config),
});

const rootTasks = (config: FullPathCaseConfig): readonly CaseTask[] => [{
  id: internalId(config, "TASK-ELIGIBILITY"), name: "Case Eligibility Document",
  status: "open", priority: "high", assignedTo: "Eligibility Specialist Team",
  dueDate: config.notificationDate,
}];

const rootAlerts = (config: FullPathCaseConfig): readonly CaseAlert[] => [{
  id: internalId(config, "ALERT-ELIGIBILITY"), severity: "error",
  message: "Case Eligibility Document failed.",
}];

const rootNextActions = (config: FullPathCaseConfig, ids: SeedIds): readonly CaseNextAction[] => [{
  id: internalId(config, "ACTION-AUTOMATION"), title: `${ids.gdc} - Automation`,
  description: "Case Eligibility Document failed.", targetDate: config.notificationDate,
  status: "OVERDUE", route: `/cases/${ids.root}/general`,
}];

const caseMap = (config: FullPathCaseConfig, ids: SeedIds): CaseMapNode => ({
  id: ids.root, type: "notification", label: "Notification", status: "SUBMITTED",
  participants: [
    { name: config.claimantName, role: "Requester", partyId: ids.claimant },
    { name: config.employer, role: "Employer" },
  ],
  children: [absenceCaseMap(config, ids), gdcCaseMap(config, ids)],
});

const absenceCaseMap = (config: FullPathCaseConfig, ids: SeedIds): CaseMapNode => ({
  id: ids.absence, type: "absence_case", label: "Absence Case", status: "ADJUDICATION",
  route: `/cases/${ids.absence}/absence-hub`,
  participants: [
    { name: config.claimantName, role: "Employee", partyId: ids.claimant },
    { name: config.employer, role: "Employer" },
    { name: config.provider.fullName, role: "Medical Provider", partyId: ids.provider },
  ],
});

const gdcCaseMap = (config: FullPathCaseConfig, ids: SeedIds): CaseMapNode => ({
  id: ids.gdc, type: "gdc_case", label: "Group Disability Claim", status: "OPEN",
  route: `/cases/${ids.gdc}/claim-hub`,
  participants: [
    { name: config.claimantName, role: "Claimant", partyId: ids.claimant },
    { name: config.employer, role: "Employer" },
    { name: config.provider.fullName, role: "Medical Provider", partyId: ids.provider },
  ],
});

const document = (
  config: FullPathCaseConfig, suffix: string, caseType: string,
  documentType: string, eFormKind?: "claim" | "absence",
): CaseDocument => ({
  id: internalId(config, suffix), icon: "pdf", caseType,
  createdDate: displayDate(config.notificationDate), createdBy: config.claimantName,
  status: "Completed", documentType, description: `${documentType} for ${config.root}.`,
  group: "System Generated", delivery: "Electronic", title: documentType, eFormKind,
});

const documents = (config: FullPathCaseConfig): readonly CaseDocument[] => [
  document(config, "DOC-INTAKE", "Notification", "Intake Summary"),
  document(config, "DOC-ABS-EFORM", "Absence Case", "QuestionPathAbsence Eform", "absence"),
  document(config, "DOC-GDC-EFORM", "Group Disability Claim", "QuestionPathClaim Eform", "claim"),
];

const eFormRows = (config: FullPathCaseConfig): CaseEForm["rows"] => [
  { question: "Type of Request", answer: config.requestCategory },
  { question: "Event Date", answer: displayDate(config.leaveStart) }, { question: "Event Type", answer: config.eventType },
  { question: "Expected RTW Date", answer: displayDate(config.leaveEnd) }, { question: "Absence Type", answer: "Continuous" },
  { question: "Leave Reason", answer: config.leaveReasonLabel }, { question: "Reason for leave", answer: config.conditionDescription },
  { question: "Reason Qualifier1", answer: "Not Work Related" }, { question: "Reason Qualifier2", answer: config.eventType },
  { question: "Surgery or procedure", answer: config.procedure },
  { question: "Medical Provider", answer: config.provider.fullName },
];

const eForms = (config: FullPathCaseConfig): readonly CaseEForm[] => [
  { id: internalId(config, "EFORM-ABS"), kind: "absence", title: "QuestionPathAbsenceEform", rows: eFormRows(config) },
  { id: internalId(config, "EFORM-GDC"), kind: "claim", title: "QuestionPathClaimEform", rows: eFormRows(config) },
];

const evidenceIds = (config: FullPathCaseConfig) => ({
  expected: internalId(config, "EVIDENCE-EXPECTED"),
  decoys: internalId(config, "EVIDENCE-DECOYS"),
});

const ACT15_LOOKUP_LINKS: LookupContent["links"] = [
  { label: "ICD 10 Data", route: "/lookups/icd10data" },
  { label: "ICD Codes: Reference Sheet", route: "/lookups/icd-reference" },
  { label: "Common ICD-10 Codes Chart", route: "/lookups/icd-chart" },
];

const lookupContent = (
  config: FullPathCaseConfig, source: string, links: LookupContent["links"] = [],
): LookupContent => ({
  title: `${source} — ${config.procedure}`,
  paragraphs: [config.diagnosis.evidenceExcerpt],
  panels: [panel(internalId(config, `PANEL-${source.toUpperCase()}`), "Diagnosis guidance", [
    field("expectedCode", config.diagnosis.expected.code, config.diagnosis.expected.description),
  ])],
  links, tables: [],
});

const diagnosisCandidates = (
  config: FullPathCaseConfig, evidence: ReturnType<typeof evidenceIds>,
): CaseLookup["candidates"] => {
  const [firstDecoy, secondDecoy] = config.diagnosis.decoys;
  return [
    { ...config.diagnosis.expected, category: config.conditionCategory, evidenceIds: [evidence.expected] },
    { ...firstDecoy, category: config.conditionCategory, evidenceIds: [evidence.decoys] },
    { ...secondDecoy, category: config.conditionCategory, evidenceIds: [evidence.decoys] },
  ];
};

const diagnosisEvidence = (
  config: FullPathCaseConfig, evidence: ReturnType<typeof evidenceIds>,
): CaseLookup["evidence"] => [
  { id: evidence.expected, source: "ICD10Data.com", excerpt: config.diagnosis.evidenceExcerpt, supportedCodes: [config.diagnosis.expected.code], route: "/lookups/icd10data" },
  { id: evidence.decoys, source: "Common ICD-10 Codes Chart", excerpt: `Related ${config.conditionCategory.toLowerCase()} codes considered during review.`, supportedCodes: config.diagnosis.decoys.map(({ code }) => code), route: "/lookups/icd-chart" },
];

const caseLookup = (config: FullPathCaseConfig): CaseLookup => ({
  query: `${config.conditionDescription} ICD-10 diagnosis code`,
  candidates: diagnosisCandidates(config, evidenceIds(config)),
  evidence: diagnosisEvidence(config, evidenceIds(config)),
  uKnow: lookupContent(config, "uKnow", ACT15_LOOKUP_LINKS),
  google: lookupContent(config, "Google"),
  icd10Data: lookupContent(config, "ICD10Data"),
  icdReference: lookupContent(config, "ICDReference"),
  chart: lookupContent(config, "ICDChart"),
});

const leavePanel = (config: FullPathCaseConfig): readonly DossierPanel[] => [
  panel(internalId(config, "PANEL-LEAVE"), "Leave", [
    field("leaveRequestedDate", "Leave Requested Date", displayDate(config.notificationDate)),
    field("earliestLastDayWorked", "Earliest Last Day Worked", displayDate(config.lastDayWorked)),
  ]),
];

const leaveRequests = (config: FullPathCaseConfig): AbsenceComponent["leaveRequests"] => [{
  id: internalId(config, "LEAVE-REQUEST-01"), requestedFrom: config.leaveStart,
  requestedThrough: config.leaveEnd, reason: config.leaveReasonLabel,
  qualifiers: ["Not Work Related", config.eventType],
}];

const absenceComponent = (
  config: FullPathCaseConfig, ids: SeedIds, condition: AbsenceConditionDetails,
): AbsenceComponent => ({
  caseId: ids.absence, employeePartyId: ids.claimant, status: "ADJUDICATION",
  hub: absenceHub(config),
  leavePanels: leavePanel(config), leaveRequests: leaveRequests(config),
  leavePlans: [{ name: "Fed FMLA", selectionMethod: "Automatic", applicability: "Applicable", evaluation: "Undecided" }],
  periods: [{ lastDayWorked: config.lastDayWorked, startDate: config.leaveStart, endDate: config.leaveEnd, status: "Pending", pattern: "Continuous" }],
  condition, employmentPanels: employmentPanels(config),
});

const absenceCalendar = (config: FullPathCaseConfig): AbsenceComponent["hub"]["calendar"] => ({
  title: "Absence Calendar", month: displayDate(config.leaveStart),
  entries: [{
    id: internalId(config, "CALENDAR-01"), label: "Continuous Leave", status: "Pending",
    range: `${displayDate(config.leaveStart)} - ${displayDate(config.leaveEnd)}`,
  }],
});

const absenceHub = (config: FullPathCaseConfig): AbsenceComponent["hub"] => ({
  decisionProgress: "Adjudication", firstNotifiedOn: displayDate(config.notificationDate),
  returnToWork: {
    expectedDate: displayDate(config.leaveEnd), actualDate: "-",
    intention: "Returning to full-time work",
  },
  calendar: absenceCalendar(config),
  sharedNotes: config.conditionDescription,
});

const incidentPanel = (config: FullPathCaseConfig): DossierPanel =>
  panel(internalId(config, "PANEL-INCIDENT"), "Incident", [
    field("lastDayWorked", "Last Day Worked", displayDate(config.lastDayWorked)),
    field("accidentSickness", "Accident/Sickness", config.eventType),
    field("condition", "Condition", config.conditionDescription),
    field("dateFirstUnableToWork", "Date First Unable to Work", displayDate(config.leaveStart)),
  ]);

const surgeryPanel = (config: FullPathCaseConfig): DossierPanel =>
  panel(internalId(config, "PANEL-SURGERY"), "Surgery", [
    field("expectedSurgeryDate", "Expected Surgery Date", displayDate(config.surgeryDate)),
    field("typeOfSurgery", "Type of Surgery", "Medically Necessary"),
    field("nameOfSurgery", "Name of Surgery or Procedure", config.procedure),
  ]);

const returnToWorkPanel = (config: FullPathCaseConfig): DossierPanel =>
  panel(internalId(config, "PANEL-RETURN-TO-WORK"), "Return To Work", [
    field("expected", "Expected return to work date", displayDate(config.leaveEnd)),
    field("actual", "Actual return to work date", "-"),
  ]);

const medicalSummary = (config: FullPathCaseConfig): DossierPanel =>
  panel(internalId(config, "PANEL-MEDICAL-SUMMARY"), "Medical", [
    field("provider", "Provider", "-"),
    field("firstTreatment", "Date of First Treatment", displayDate(config.firstTreatmentDate)),
    field("diagnosis", "Diagnosis", "-"),
  ]);

const medicalPanels = (config: FullPathCaseConfig): readonly DossierPanel[] => [
  panel(internalId(config, "PANEL-MEDICAL-DETAILS"), "Medical Details", [
    field("firstUnable", "Date First Unable To Work", displayDate(config.leaveStart)),
    field("firstTreatment", "Date of First Treatment", displayDate(config.firstTreatmentDate)),
    field("condition", "Condition", config.conditionDescription),
    field("conditionCategory", "Condition Category", config.conditionCategory),
    field("nameOfSurgery", "Name of Surgery or Procedure", config.procedure),
  ]),
];

const claimPanels = (config: FullPathCaseConfig): readonly DossierPanel[] => [
  panel(internalId(config, "PANEL-CLAIM"), "Claim Decision", [
    field("timeToDecision", "Time to Decision", "3 days"),
    field("claimant", "Claimant", config.claimantName),
  ]),
];

const providerSearch = (
  config: FullPathCaseConfig, provider: ProviderDetails,
): GdcComponent["providerSearch"] => ({
  criteria: [
    field("first", "First Name", config.provider.firstName),
    field("last", "Last Name", config.provider.lastName),
    field("searchBy", "Search by", "Person"),
  ],
  candidates: [provider],
});

const gdcComponent = (
  config: FullPathCaseConfig, ids: SeedIds, provider: ProviderDetails,
): GdcComponent => ({
  caseId: ids.gdc, claimantPartyId: ids.claimant, status: "OPEN",
  claimPanels: claimPanels(config),
  incident: incidentPanel(config), surgery: surgeryPanel(config),
  returnToWork: returnToWorkPanel(config), medicalSummary: medicalSummary(config),
  medicalPanels: medicalPanels(config), diagnoses: [], providers: [],
  providerSearch: providerSearch(config, provider),
  tasks: rootTasks(config), alerts: rootAlerts(config),
  nextActions: rootNextActions(config, ids),
});

const caseSummary = (config: FullPathCaseConfig, ids: SeedIds): Process2Dossier["summary"] => ({
  title: `Notification ${ids.root}`, status: "SUBMITTED",
  bands: [
    { label: "Requester", value: config.claimantName },
    { label: "Date", value: displayDate(config.notificationDate) },
    { label: "Expected return to work date", value: displayDate(config.leaveEnd) },
  ],
  sidebarFacts: [field("employer", "Employer", config.employer)],
});

const caseOwnership = (): Process2Dossier["ownership"] => ({
  bands: [{ label: "Assigned To", value: "Eligibility Specialist Team / Eligibility Specialist" }],
  sidebarFacts: [field("department", "In Department", "Eligibility Specialist Team")],
});

const dossier = (
  config: FullPathCaseConfig, ids: SeedIds, party: Process2PartyProfile,
  provider: ProviderDetails, condition: AbsenceConditionDetails,
): Process2Dossier => ({
  caseId: ids.root, intakeType: "leave_and_gdc", scope: "leave_and_gdc",
  componentScope: "absence_and_gdc", party,
  summary: caseSummary(config, ids), ownership: caseOwnership(),
  caseMap: caseMap(config, ids), documents: documents(config), eForms: eForms(config),
  tasks: rootTasks(config), alerts: rootAlerts(config),
  nextActions: rootNextActions(config, ids), lookup: caseLookup(config),
  absence: absenceComponent(config, ids, condition), gdc: gdcComponent(config, ids, provider),
});

const expectedDiagnosisCode = (config: FullPathCaseConfig): DiagnosisCode => {
  const result = createDiagnosisCode(config.diagnosis.expected.code);
  if (!result.ok) throw new Error(`Invalid seed diagnosis code for ${config.root}`);
  return result.value;
};

const scenario = (
  config: FullPathCaseConfig, ids: SeedIds, condition: AbsenceConditionDetails,
): Process2CaseSeed["scenario"] => ({
  scenarioId: ids.root, title: `${config.claimantName} — successful Absence and GDC case`,
  decisions: { DEC_01: "yes", DEC_02: "yes", DEC_03: "yes", DEC_04: "yes", DEC_05: "yes" },
  logic: { LGC_01: "absence_and_gdc", LGC_02: expectedDiagnosisCode(config), LGC_03: condition },
  terminal: { kind: "completed", status: "COMPLETED", activatedTracks: ["absence", "gdc"] },
});

type PersistedRows = Pick<
  Process2CaseSeed,
  "party" | "notification" | "absenceCase" | "absencePeriods" | "gdcCase" | "providers"
>;

const persistedRows = (
  config: FullPathCaseConfig, ids: SeedIds,
  party: Process2PartyProfile, provider: ProviderDetails,
): PersistedRows => ({
  party: { id: ids.claimant, fullName: config.claimantName, partyType: "insured", details: party, customerNumber: config.customerNumber, dateOfBirth: config.dateOfBirth, employer: config.employer, phone: config.phone, email: config.email },
  notification: { id: ids.root, partyId: ids.claimant, source: "Phone", notificationDate: config.notificationDate, intakeType: "leave_and_gdc", status: "SUBMITTED", scope: "leave_and_gdc" },
  absenceCase: { id: ids.absence, notificationId: ids.root, employeePartyId: ids.claimant, status: "ADJUDICATION", leaveReason: config.leaveReason, conditionDescription: config.conditionDescription, workState: config.state },
  absencePeriods: [{ id: internalId(config, "ABSENCE-PERIOD-01"), absenceCaseId: ids.absence, lastDayWorked: config.lastDayWorked, startDate: config.leaveStart, endDate: config.leaveEnd }],
  gdcCase: { id: ids.gdc, notificationId: ids.root, claimantPartyId: ids.claimant, status: "OPEN" },
  providers: [{ id: ids.provider, fullName: config.provider.fullName, partyType: "medical_provider", details: provider, customerNumber: config.provider.customerNumber }],
});

export const createFullPathCaseSeed = (config: FullPathCaseConfig): Process2CaseSeed => {
  validateConfig(config);
  const ids = idsFor(config);
  const party = partyProfile(config, ids);
  const provider = providerDetails(config, ids);
  const condition = conditionDetails(config);
  return {
    ...persistedRows(config, ids, party, provider),
    dossier: dossier(config, ids, party, provider, condition),
    scenario: scenario(config, ids, condition),
  };
};
