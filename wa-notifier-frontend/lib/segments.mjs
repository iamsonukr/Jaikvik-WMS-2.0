export const segmentOperators = {
  equals: 'Equals', not_equals: 'Does not equal', contains: 'Contains',
  not_contains: 'Does not contain', is_set: 'Has a value', is_not_set: 'Has no value',
  greater_than: 'Greater than', less_than: 'Less than', before: 'Before date', after: 'After date',
};

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const isoDate = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;
function dateValue(value) {
  if (!isoDate.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value.slice(0, 10) ? time : NaN;
}

export function matchesSegment(contact, tags, conditions, matchMode) {
  const results = tags.map(tag => (contact.tags || []).includes(tag));
  for (const condition of conditions) {
    const raw = condition.field.startsWith('customFields.')
      ? contact.customFields?.[condition.field.slice(13)] : contact[condition.field];
    const actual = raw == null || typeof raw === 'object' ? '' : String(raw);
    const expected = condition.value || '';
    switch (condition.operator) {
      case 'greater_than':
      case 'less_than': {
        const valid = decimal.test(actual) && decimal.test(expected) && Number.isFinite(Number(actual)) && Number.isFinite(Number(expected));
        results.push(valid && (condition.operator === 'greater_than' ? Number(actual) > Number(expected) : Number(actual) < Number(expected)));
        break;
      }
      case 'before':
      case 'after': {
        const timestamp = dateValue(actual);
        results.push(Number.isFinite(timestamp) && (condition.operator === 'before' ? timestamp < dateValue(expected) : timestamp > dateValue(expected)));
        break;
      }
      case 'equals': results.push(actual === expected); break;
      case 'not_equals': results.push(actual !== expected); break;
      case 'contains': results.push(actual.toLowerCase().includes(expected.toLowerCase())); break;
      case 'not_contains': results.push(!actual.toLowerCase().includes(expected.toLowerCase())); break;
      case 'is_set': results.push(actual !== ''); break;
      case 'is_not_set': results.push(actual === ''); break;
      default: results.push(false);
    }
  }
  return !results.length || (matchMode === 'all' ? results.every(Boolean) : results.some(Boolean));
}
