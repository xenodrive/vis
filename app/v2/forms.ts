import type { FormAnswer, FormField, FormInfo } from '@opencode-ai/client';

export function initialAnswer(form: FormInfo): FormAnswer {
  const answer: FormAnswer = {};
  for (const field of form.fields) {
    if ('default' in field && field.default !== undefined) {
      answer[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
    } else if (field.type === 'boolean') answer[field.key] = false;
    else if (field.type === 'multiselect') answer[field.key] = [];
  }
  return answer;
}

export function isVisible(field: FormField, answer: FormAnswer) {
  if (!('when' in field) || !field.when) return true;
  return field.when.every((condition) =>
    condition.op === 'eq'
      ? answer[condition.key] === condition.value
      : answer[condition.key] !== condition.value,
  );
}

export function formAnswer(form: FormInfo, values: FormAnswer): FormAnswer {
  const answer: FormAnswer = {};
  for (const field of form.fields) {
    if (field.type === 'external' || !isVisible(field, values)) continue;
    const value = values[field.key];
    const label = field.title ?? field.key;
    if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
      if (field.required) throw new Error(`${label} is required.`);
      continue;
    }
    if (field.type === 'number' || field.type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(`${label} must be a finite number.`);
      if (field.type === 'integer' && !Number.isInteger(value))
        throw new Error(`${label} must be an integer.`);
      if (typeof field.minimum === 'number' && value < field.minimum)
        throw new Error(`${label} must be at least ${field.minimum}.`);
      if (typeof field.maximum === 'number' && value > field.maximum)
        throw new Error(`${label} must be at most ${field.maximum}.`);
    }
    if (field.type === 'multiselect' && Array.isArray(value)) {
      if (field.minItems !== undefined && value.length < field.minItems)
        throw new Error(`${label}: select at least ${field.minItems} options.`);
      if (field.maxItems !== undefined && value.length > field.maxItems)
        throw new Error(`${label}: select at most ${field.maxItems} options.`);
    }
    answer[field.key] = value;
  }
  return answer;
}

export function externalUrl(raw: string) {
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
