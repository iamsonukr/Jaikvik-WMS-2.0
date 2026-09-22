import { BadRequestException } from '@nestjs/common';

export interface SegmentCondition {
  field: string;
  operator: string;
  value?: string;
}

const operators = ['equals', 'not_equals', 'contains', 'not_contains', 'is_set', 'is_not_set', 'greater_than', 'less_than', 'before', 'after'];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const isoDate = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;

export function validateSegmentConditions(conditions: SegmentCondition[]) {
  if (!Array.isArray(conditions) || conditions.length > 30) throw new BadRequestException('Use at most 30 field conditions');
  for (const condition of conditions) {
    if (!condition || typeof condition.field !== 'string'
      || !/^(name|phone|customFields\.[a-zA-Z0-9_]+)$/.test(condition.field)
      || !operators.includes(condition.operator)) throw new BadRequestException('Invalid segment condition');
    if (!['is_set', 'is_not_set'].includes(condition.operator)
      && (typeof condition.value !== 'string' || !condition.value.trim() || condition.value.length > 500)) {
      throw new BadRequestException('Enter a value for every field condition (maximum 500 characters)');
    }
    if (['greater_than', 'less_than'].includes(condition.operator) && (!decimal.test(condition.value) || !Number.isFinite(Number(condition.value)))) {
      throw new BadRequestException('Enter a valid number for numeric comparisons');
    }
    if (['before', 'after'].includes(condition.operator) && (!isoDate.test(condition.value) || !Number.isFinite(Date.parse(condition.value))
      || new Date(condition.value).toISOString().slice(0, 10) !== condition.value.slice(0, 10))) {
      throw new BadRequestException('Enter a valid date for date comparisons');
    }
  }
}

/** Tags and field conditions participate in the same AND/OR expression. */
export function buildSegmentQuery(segment: { tags?: string[]; conditions?: SegmentCondition[]; matchMode?: string }) {
  const clauses: any[] = (segment.tags || []).map(tag => ({ tags: tag }));
  for (const condition of segment.conditions || []) {
    const input = { $convert: { input: `$${condition.field}`, to: 'string', onError: '', onNull: '' } };
    const value = condition.value || '';
    let expression: any;
    switch (condition.operator) {
      case 'greater_than':
      case 'less_than':
      case 'before':
      case 'after': {
        const isDate = ['before', 'after'].includes(condition.operator);
        const converted = { $cond: [
          { $regexMatch: { input, regex: (isDate ? isoDate : decimal).source } },
          { $convert: { input, to: isDate ? 'date' : 'double', onError: null, onNull: null } },
          null,
        ] };
        const comparison = ['greater_than', 'after'].includes(condition.operator) ? '$gt' : '$lt';
        expression = { $and: [{ $ne: [converted, null] }, { [comparison]: [converted, isDate ? new Date(value) : Number(value)] }] };
        break;
      }
      case 'equals': expression = { $eq: [input, { $literal: value }] }; break;
      case 'not_equals': expression = { $ne: [input, { $literal: value }] }; break;
      case 'contains':
      case 'not_contains':
        expression = { $regexMatch: { input, regex: escapeRegex(value), options: 'i' } };
        if (condition.operator === 'not_contains') expression = { $not: [expression] };
        break;
      case 'is_set': expression = { $ne: [input, ''] }; break;
      case 'is_not_set': expression = { $eq: [input, ''] }; break;
      default: throw new BadRequestException('Invalid segment operator');
    }
    clauses.push({ $expr: expression });
  }
  // A segment whose last tag was removed must never expand to every contact.
  return clauses.length ? { [segment.matchMode === 'all' ? '$and' : '$or']: clauses } : { _id: { $in: [] } };
}
