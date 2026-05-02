'use strict';
/**
 * DProject — declarative MSPDI field maps.
 *
 * Open/Closed: adding a new MSPDI field = adding a row here. The walker in
 * parser.js is generic; it never hardcodes field names.
 *
 * Each entry: [mspdiName, outputKey, type]
 *   type ∈ 'string' | 'int' | 'float' | 'bool' | 'date' | 'duration'
 *
 * Fields not listed are ignored by the normaliser. If a consumer needs a rare
 * field, they can register it via dproject.registerField() (Phase 0.5).
 */

const PROJECT_FIELDS = [
  ['Name',                 'name',              'string'],
  ['Title',                'title',             'string'],
  ['Subject',              'subject',           'string'],
  ['Author',               'author',            'string'],
  ['Manager',              'manager',           'string'],
  ['Company',              'company',           'string'],
  ['Category',             'category',          'string'],
  ['Keywords',             'keywords',          'string'],
  ['CreationDate',         'createdAt',         'date'],
  ['LastSaved',            'lastSavedAt',       'date'],
  ['StartDate',            'startDate',         'date'],
  ['FinishDate',           'finishDate',        'date'],
  ['StatusDate',           'statusDate',        'date'],
  ['CurrentDate',          'currentDate',       'date'],
  ['ScheduleFromStart',    'scheduleFromStart', 'bool'],
  ['CurrencySymbol',       'currencySymbol',    'string'],
  ['CurrencyCode',         'currencyCode',      'string'],
  ['CurrencyDigits',       'currencyDigits',    'int'],
  ['MinutesPerDay',        'minutesPerDay',     'int'],
  ['MinutesPerWeek',       'minutesPerWeek',    'int'],
  ['DaysPerMonth',         'daysPerMonth',      'int'],
  ['DefaultStartTime',     'defaultStartTime',  'string'],
  ['DefaultFinishTime',    'defaultFinishTime', 'string'],
  ['CalendarUID',          'calendarUid',       'int'],
  ['DefaultTaskType',      'defaultTaskType',   'int'],
  ['WeekStartDay',         'weekStartDay',      'int'],
  ['NewTasksEstimated',    'newTasksEstimated', 'bool'],
];

// Field tuple format:
//   [mspdiName, outputKey, type, required?]
//   `required: true` means: always emit on serialize, even when the value
//   equals the natural "default" (0 / false / ""). Critical for fields where
//   0 is meaningful (UID 0 = project summary; OutlineLevel 0 = root).

const TASK_FIELDS = [
  ['UID',                  'uid',               'int',     true],
  ['ID',                   'id',                'int',     true],
  ['Name',                 'name',              'string',  true],
  ['Type',                 'type',              'int'],
  ['IsNull',               'isNull',            'bool',     true],
  ['CreateDate',           'createdAt',         'date'],
  ['Contact',              'contact',           'string'],
  ['WBS',                  'wbs',               'string'],
  ['OutlineNumber',        'outlineNumber',     'string'],
  ['OutlineLevel',         'outlineLevel',      'int',     true],
  ['Priority',             'priority',          'int'],
  ['Start',                'start',             'date'],
  ['Finish',               'finish',            'date'],
  ['Duration',             'duration',          'duration', true],
  ['DurationFormat',       'durationFormat',    'int'],
  ['Work',                 'work',              'duration'],
  ['Stop',                 'stopDate',          'date'],
  ['Resume',               'resumeDate',        'date'],
  ['EffortDriven',         'effortDriven',      'bool',     true],
  ['Recurring',            'recurring',         'bool'],
  ['OverAllocated',        'overAllocated',     'bool'],
  ['Estimated',            'estimated',         'bool'],
  ['Milestone',            'milestone',         'bool',     true],
  ['Summary',              'summary',           'bool',     true],
  ['Critical',             'critical',          'bool',     true],
  ['IsSubproject',         'isSubproject',      'bool'],
  ['ExternalTask',         'externalTask',      'bool'],
  ['EarlyStart',           'earlyStart',        'date'],
  ['EarlyFinish',          'earlyFinish',       'date'],
  ['LateStart',            'lateStart',         'date'],
  ['LateFinish',           'lateFinish',        'date'],
  ['StartVariance',        'startVariance',     'int'],
  ['FinishVariance',       'finishVariance',    'int'],
  ['WorkVariance',         'workVariance',      'float'],
  ['FreeSlack',            'freeSlack',         'int'],
  ['TotalSlack',           'totalSlack',        'int'],
  ['FixedCost',            'fixedCost',         'float'],
  ['FixedCostAccrual',     'fixedCostAccrual',  'int'],
  ['PercentComplete',      'percentComplete',   'int',     true],
  ['PercentWorkComplete',  'percentWorkComplete','int',    true],
  ['Cost',                 'cost',              'float'],
  ['ActualCost',           'actualCost',        'float'],
  ['RemainingCost',        'remainingCost',     'float'],
  ['ActualDuration',       'actualDuration',    'duration'],
  ['RemainingDuration',    'remainingDuration', 'duration'],
  ['ActualWork',           'actualWork',        'duration'],
  ['RemainingWork',        'remainingWork',     'duration'],
  ['ConstraintType',       'constraintType',    'int',     true],
  ['ConstraintDate',       'constraintDate',    'date'],
  ['Deadline',             'deadline',          'date'],
  ['CalendarUID',          'calendarUid',       'int'],
  ['Notes',                'notes',             'string'],
  ['HideBar',              'hideBar',           'bool'],
  ['Rollup',               'rollup',            'bool'],
  ['BCWS',                 'bcws',              'float'],
  ['BCWP',                 'bcwp',              'float'],
];

const RESOURCE_FIELDS = [
  ['UID',                  'uid',               'int',     true],
  ['ID',                   'id',                'int',     true],
  ['Name',                 'name',              'string',  true],
  ['Type',                 'type',              'int',     true],
  ['IsNull',               'isNull',            'bool'],
  ['Initials',             'initials',          'string'],
  ['Phonetics',            'phonetics',         'string'],
  ['NTAccount',            'ntAccount',         'string'],
  ['MaterialLabel',        'materialLabel',     'string'],
  ['Code',                 'code',              'string'],
  ['Group',                'group',             'string'],
  ['WorkGroup',            'workGroup',         'int'],
  ['EmailAddress',         'emailAddress',      'string'],
  ['MaxUnits',             'maxUnits',          'float'],
  ['PeakUnits',            'peakUnits',         'float'],
  ['OverAllocated',        'overAllocated',     'bool'],
  ['CanLevel',             'canLevel',          'bool'],
  ['AccrueAt',             'accrueAt',          'int'],
  ['Work',                 'work',              'duration'],
  ['ActualWork',           'actualWork',        'duration'],
  ['RemainingWork',        'remainingWork',     'duration'],
  ['StandardRate',         'standardRate',      'float'],
  ['OvertimeRate',         'overtimeRate',      'float'],
  ['CostPerUse',           'costPerUse',        'float'],
  ['Cost',                 'cost',              'float'],
  ['ActualCost',           'actualCost',        'float'],
  ['RemainingCost',        'remainingCost',     'float'],
  ['CalendarUID',          'calendarUid',       'int'],
  ['IsGeneric',            'isGeneric',         'bool'],
  ['IsCostResource',       'isCostResource',    'bool'],
  ['IsInactive',           'isInactive',        'bool'],
  ['Notes',                'notes',             'string'],
];

const CALENDAR_FIELDS = [
  ['UID',                  'uid',                'int',    true],
  ['Name',                 'name',               'string', true],
  ['IsBaseCalendar',       'isBaseCalendar',     'bool',   true],
  ['IsBaselineCalendar',   'isBaselineCalendar', 'bool'],
  ['BaseCalendarUID',      'baseCalendarUid',    'int',    true],
];

const EXCEPTION_FIELDS = [
  ['Name',                 'name',               'string'],
  ['Type',                 'type',               'int'],
  ['EnteredStartDate',     'startDate',          'date'],
  ['EnteredFinishDate',    'finishDate',         'date'],
  ['DayWorking',           'dayWorking',         'bool'],
  ['Occurrences',          'occurrences',        'int'],
];

const WEEKDAY_FIELDS = [
  ['DayType',              'dayType',            'int'],
  ['DayWorking',           'dayWorking',         'bool'],
];

const EXTATTR_DEF_FIELDS = [
  ['FieldID',              'fieldId',            'string'],
  ['FieldName',            'fieldName',          'string'],
  ['Alias',                'alias',              'string'],
  ['PhoneticAlias',        'phoneticAlias',      'string'],
];

const EXTATTR_VALUE_FIELDS = [
  ['FieldID',              'fieldId',            'string'],
  ['Value',                'value',              'string'],
  ['ValueID',              'valueId',            'string'],
  ['UID',                  'rowUid',             'int'],
];

const BASELINE_FIELDS = [
  ['Number',               'number',             'int'],
  ['Start',                'start',              'date'],
  ['Finish',               'finish',             'date'],
  ['Duration',             'duration',           'duration'],
  ['Work',                 'work',               'duration'],
  ['Cost',                 'cost',               'float'],
];

const ASSIGNMENT_FIELDS = [
  ['UID',                  'uid',               'int',     true],
  ['TaskUID',              'taskUid',           'int',     true],
  ['ResourceUID',          'resourceUid',       'int',     true],
  ['PercentWorkComplete',  'percentWorkComplete','int'],
  ['Units',                'units',             'float'],
  ['Work',                 'work',              'duration'],
  ['ActualWork',           'actualWork',        'duration'],
  ['RemainingWork',        'remainingWork',     'duration'],
  ['Cost',                 'cost',              'float'],
  ['ActualCost',           'actualCost',        'float'],
  ['RemainingCost',        'remainingCost',     'float'],
  ['Start',                'start',             'date'],
  ['Finish',               'finish',            'date'],
  ['Delay',                'delay',             'int'],
  ['LevelingDelay',        'levelingDelay',     'int'],
  ['CostRateTable',        'costRateTable',     'int'],
  ['Confirmed',            'confirmed',         'bool'],
  ['Notes',                'notes',             'string'],
  ['HasFixedRateUnits',    'hasFixedRateUnits', 'bool'],
  ['FixedMaterial',        'fixedMaterial',     'bool'],
];

var _fieldsExports = {
  PROJECT_FIELDS: PROJECT_FIELDS,
  TASK_FIELDS: TASK_FIELDS,
  RESOURCE_FIELDS: RESOURCE_FIELDS,
  ASSIGNMENT_FIELDS: ASSIGNMENT_FIELDS,
  CALENDAR_FIELDS: CALENDAR_FIELDS,
  EXCEPTION_FIELDS: EXCEPTION_FIELDS,
  WEEKDAY_FIELDS: WEEKDAY_FIELDS,
  EXTATTR_DEF_FIELDS: EXTATTR_DEF_FIELDS,
  EXTATTR_VALUE_FIELDS: EXTATTR_VALUE_FIELDS,
  BASELINE_FIELDS: BASELINE_FIELDS,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _fieldsExports;
}
if (typeof window !== 'undefined') {
  window.DProjectFields = _fieldsExports;
}
