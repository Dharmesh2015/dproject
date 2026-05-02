// DProject — TypeScript type declarations
// MIT License — Copyright (c) 2026 Dharmesh Patel

export type ISODate = string;
export type Minutes = number;

export type DependencyTypeCode = 0 | 1 | 2 | 3;
export type DependencyTypeName = 'FF' | 'FS' | 'SF' | 'SS';

export interface ProjectMeta {
  name: string;
  title: string;
  subject: string;
  author: string;
  manager: string;
  company: string;
  category: string;
  keywords: string;
  createdAt: ISODate | null;
  lastSavedAt: ISODate | null;
  startDate: ISODate | null;
  finishDate: ISODate | null;
  statusDate: ISODate | null;
  currentDate: ISODate | null;
  scheduleFromStart: boolean;
  currencySymbol: string;
  currencyCode: string;
  currencyDigits: number;
  minutesPerDay: Minutes;
  minutesPerWeek: Minutes;
  daysPerMonth: number;
  defaultStartTime: string;
  defaultFinishTime: string;
  calendarUid: number;
  defaultTaskType: number;
  weekStartDay: number;
  newTasksEstimated: boolean;
}

export interface Predecessor {
  predecessorUid: number;
  type: DependencyTypeCode;
  typeName: DependencyTypeName;
  lag: Minutes;
  crossProject: boolean;
}

export interface Task {
  uid: number;
  id: number;
  name: string;
  type: number;
  isNull: boolean;
  createdAt: ISODate | null;
  contact: string;
  wbs: string;
  outlineNumber: string;
  outlineLevel: number;
  parentUid: number | null;
  priority: number;
  start: ISODate | null;
  finish: ISODate | null;
  duration: Minutes;
  durationFormat: number;
  work: Minutes;
  stopDate: ISODate | null;
  resumeDate: ISODate | null;
  effortDriven: boolean;
  recurring: boolean;
  overAllocated: boolean;
  estimated: boolean;
  milestone: boolean;
  summary: boolean;
  critical: boolean;
  isSubproject: boolean;
  externalTask: boolean;
  earlyStart: ISODate | null;
  earlyFinish: ISODate | null;
  lateStart: ISODate | null;
  lateFinish: ISODate | null;
  startVariance: number;
  finishVariance: number;
  workVariance: number;
  freeSlack: number;
  totalSlack: number;
  fixedCost: number;
  fixedCostAccrual: number;
  percentComplete: number;
  percentWorkComplete: number;
  cost: number;
  actualCost: number;
  remainingCost: number;
  actualDuration: Minutes;
  remainingDuration: Minutes;
  actualWork: Minutes;
  remainingWork: Minutes;
  constraintType: number;
  constraintDate: ISODate | null;
  deadline: ISODate | null;
  calendarUid: number;
  notes: string;
  hideBar: boolean;
  rollup: boolean;
  bcws: number;
  bcwp: number;
  predecessors: Predecessor[];
  baselines: Baseline[];
  extendedAttributes: ExtendedAttributeValue[];
}

export interface Resource {
  uid: number;
  id: number;
  name: string;
  type: number;
  isNull: boolean;
  initials: string;
  phonetics: string;
  ntAccount: string;
  materialLabel: string;
  code: string;
  group: string;
  workGroup: number;
  emailAddress: string;
  maxUnits: number;
  peakUnits: number;
  overAllocated: boolean;
  canLevel: boolean;
  accrueAt: number;
  work: Minutes;
  actualWork: Minutes;
  remainingWork: Minutes;
  standardRate: number;
  overtimeRate: number;
  costPerUse: number;
  cost: number;
  actualCost: number;
  remainingCost: number;
  calendarUid: number;
  isGeneric: boolean;
  isCostResource: boolean;
  isInactive: boolean;
  notes: string;
  extendedAttributes: ExtendedAttributeValue[];
}

export interface Assignment {
  uid: number;
  taskUid: number;
  resourceUid: number;
  percentWorkComplete: number;
  units: number;
  work: Minutes;
  actualWork: Minutes;
  remainingWork: Minutes;
  cost: number;
  actualCost: number;
  remainingCost: number;
  start: ISODate | null;
  finish: ISODate | null;
  delay: number;
  levelingDelay: number;
  costRateTable: number;
  confirmed: boolean;
  notes: string;
  hasFixedRateUnits: boolean;
  fixedMaterial: boolean;
  extendedAttributes: ExtendedAttributeValue[];
}

export interface ExtendedAttributeDef {
  fieldId: string;
  fieldName: string;
  alias: string;
  phoneticAlias: string;
}

export interface ExtendedAttributeValue {
  fieldId: string;
  value: string;
  valueId: string;
  rowUid: number;
}

export interface Baseline {
  number: number;
  start: ISODate | null;
  finish: ISODate | null;
  duration: Minutes;
  work: Minutes;
  cost: number;
}

export interface WorkingTime {
  from: string;  // "HH:MM:SS"
  to: string;
}

export interface WeekDay {
  dayType: number;            // 1=Sun … 7=Sat
  dayWorking: boolean;
  workingTimes: WorkingTime[];
}

export interface CalendarException {
  name: string;
  type: number;
  startDate: ISODate | null;
  finishDate: ISODate | null;
  dayWorking: boolean;
  occurrences: number;
}

export interface Calendar {
  uid: number;
  name: string;
  isBaseCalendar: boolean;
  isBaselineCalendar: boolean;
  baseCalendarUid: number;    // -1 when this IS the base
  weekDays: WeekDay[];
  exceptions: CalendarException[];
}

export interface Project {
  meta: ProjectMeta;
  extendedAttributeDefs: ExtendedAttributeDef[];
  calendars: Calendar[];
  tasks: Task[];
  resources: Resource[];
  assignments: Assignment[];
}

export interface ValidationError {
  code: string;
  message: string;
  where: { taskUid?: number; resourceUid?: number; assignmentUid?: number; parentUid?: number; predecessorUid?: number };
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export interface ValidateOptions {
  /** Allow assignments whose resourceUid is unknown (default true). */
  allowOrphanAssignments?: boolean;
}

export interface SerializeOptions {
  /** Pretty-print with newlines + 2-space indent (default true). */
  pretty?: boolean;
  /** Include `<?xml version="1.0"?>` declaration (default true). */
  declaration?: boolean;
}

export type ErrorCode =
  | 'DUPLICATE_TASK_UID'
  | 'DUPLICATE_RESOURCE_UID'
  | 'DANGLING_PARENT'
  | 'DANGLING_PREDECESSOR'
  | 'CIRCULAR_OUTLINE'
  | 'ASSIGNMENT_BAD_TASK'
  | 'ASSIGNMENT_BAD_RESOURCE'
  | 'FINISH_BEFORE_START'
  | 'NEGATIVE_DURATION'
  | 'MISSING_NAME';

export interface DProjectStatic {
  /** Parse a Microsoft Project Data Interchange (MSPDI) XML string. */
  parse(xmlString: string): Project;

  /** Read from a Blob/File (browser) or absolute path (Node). */
  fromFile(input: Blob | File | string): Promise<Project>;

  /** Fetch from a URL and parse. */
  fromUrl(url: string, opts?: RequestInit): Promise<Project>;

  /** Validate a parsed Project for structural integrity. */
  validate(project: Project, opts?: ValidateOptions): ValidationResult;

  /** Serialize a Project back to MSPDI XML — round-trip safe with parse(). */
  serialize(project: Project, opts?: SerializeOptions): string;

  /** Map of every error code emitted by `validate`. */
  readonly ERROR_CODES: { [K in ErrorCode]: K };

  /** Library version string. */
  readonly version: string;
}

declare const DProject: DProjectStatic;
export default DProject;
