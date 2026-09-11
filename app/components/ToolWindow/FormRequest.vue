<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { FormAnswer, FormInfo } from '@opencode-ai/client';
import { externalUrl, formAnswer, initialAnswer, isVisible } from '../../utils/forms';

const props = defineProps<{ form: FormInfo; disabled: boolean; serverError?: string }>();
const emit = defineEmits<{ reply: [answer: FormAnswer]; cancel: [] }>();
const answer = reactive(initialAnswer(props.form));
const custom = reactive<Record<string, string>>({});
const error = ref('');

function submit() {
  error.value = '';
  try {
    emit('reply', formAnswer(props.form, answer));
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
function toggle(key: string, value: string, checked: boolean) {
  const current = answer[key];
  if (!Array.isArray(current)) throw new Error('Invalid multiselect state.');
  answer[key] = checked
    ? [...new Set([...current, value])]
    : current.filter((item) => item !== value);
}
function addCustom(key: string) {
  const value = custom[key]?.trim();
  if (!value) return;
  toggle(key, value, true);
  custom[key] = '';
}
</script>

<template>
  <form class="form-request" @submit.prevent="submit">
    <h3>{{ form.title }}</h3>
    <small>Session {{ form.sessionID }}</small>
    <fieldset :disabled="disabled">
      <template v-for="field in form.fields" :key="field.key">
        <div v-if="isVisible(field, answer)" class="form-field">
          <template v-if="field.type === 'external'">
            <a
              v-if="externalUrl(field.url)"
              :href="externalUrl(field.url)"
              target="_blank"
              rel="noopener noreferrer"
              >{{ field.title ?? 'Open external form' }} ↗</a
            >
            <p v-else class="form-error">Unsupported external URL: {{ field.url }}</p>
          </template>
          <template v-else>
            <label :for="`${form.id}-${field.key}`"
              >{{ field.title ?? field.key }}{{ field.required ? ' *' : '' }}</label
            >
            <p v-if="field.description" class="form-muted">{{ field.description }}</p>
            <input
              v-if="field.type === 'boolean'"
              :id="`${form.id}-${field.key}`"
              type="checkbox"
              :checked="answer[field.key] === true"
              @change="answer[field.key] = ($event.target as HTMLInputElement).checked"
            />
            <input
              v-else-if="field.type === 'number' || field.type === 'integer'"
              :id="`${form.id}-${field.key}`"
              type="number"
              :value="answer[field.key]"
              :step="field.type === 'integer' ? 1 : 'any'"
              :required="field.required"
              :min="typeof field.minimum === 'number' ? field.minimum : undefined"
              :max="typeof field.maximum === 'number' ? field.maximum : undefined"
              @input="
                answer[field.key] =
                  ($event.target as HTMLInputElement).value === ''
                    ? ''
                    : ($event.target as HTMLInputElement).valueAsNumber
              "
            />
            <template v-else-if="field.type === 'string'">
              <select
                v-if="field.options && !field.custom"
                :id="`${form.id}-${field.key}`"
                v-model="answer[field.key]"
                :required="field.required"
              >
                <option value="">Select an option</option>
                <option v-for="option in field.options" :key="option.value" :value="option.value">
                  {{ option.label }}{{ option.description ? ` — ${option.description}` : '' }}
                </option>
              </select>
              <template v-else>
                <input
                  :id="`${form.id}-${field.key}`"
                  v-model="answer[field.key]"
                  :type="
                    field.format === 'email' ? 'email' : field.format === 'uri' ? 'url' : 'text'
                  "
                  :required="field.required"
                  :placeholder="field.placeholder ?? field.format"
                  :minlength="field.minLength"
                  :maxlength="field.maxLength"
                  :pattern="field.pattern"
                  :list="field.options ? `${form.id}-${field.key}-options` : undefined"
                />
                <datalist v-if="field.options" :id="`${form.id}-${field.key}-options`">
                  <option v-for="option in field.options" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </datalist>
              </template>
            </template>
            <div v-else-if="field.type === 'multiselect'" :id="`${form.id}-${field.key}`">
              <label v-for="option in field.options" :key="option.value" class="form-check"
                ><input
                  type="checkbox"
                  :checked="(answer[field.key] as string[]).includes(option.value)"
                  @change="
                    toggle(field.key, option.value, ($event.target as HTMLInputElement).checked)
                  "
                />{{ option.label
                }}<small v-if="option.description">{{ option.description }}</small></label
              >
              <template v-if="field.custom">
                <label
                  v-for="value in (answer[field.key] as string[]).filter(
                    (value) => !field.options.some((option) => option.value === value),
                  )"
                  :key="value"
                  class="form-check"
                  ><input type="checkbox" checked @change="toggle(field.key, value, false)" />{{
                    value
                  }}</label
                >
                <div class="form-row">
                  <input
                    v-model="custom[field.key]"
                    placeholder="Custom option"
                    @keydown.enter.prevent="addCustom(field.key)"
                  /><button type="button" @click="addCustom(field.key)">Add</button>
                </div>
              </template>
            </div>
          </template>
        </div>
      </template>
      <p v-if="error || serverError" class="form-error" role="alert">{{ error || serverError }}</p>
      <div class="form-row">
        <button class="form-primary" type="submit">Submit answer</button
        ><button type="button" @click="emit('cancel')">Cancel request</button>
      </div>
    </fieldset>
  </form>
</template>

<style scoped>
.form-request {
  color: #e2e8f0;
  font-size: 12px;
  padding: 8px;
  min-height: 100%;
}
h3 {
  font-weight: 700;
  font-size: 13px;
  margin: 0 0 6px;
}
small,
.form-muted {
  color: #94a3b8;
}
fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
}
.form-field {
  margin: 12px 0;
}
.form-field > label {
  display: block;
  margin-bottom: 4px;
}
input:not([type='checkbox']),
select {
  width: 100%;
  padding: 6px 8px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  color: #e2e8f0;
}
.form-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 5px 0;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.form-error {
  color: #f87171;
  white-space: pre-wrap;
}
button {
  border: 1px solid #475569;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
}
.form-primary {
  background: rgba(30, 64, 175, 0.65);
  border-color: #60a5fa;
}
button:disabled,
fieldset:disabled {
  opacity: 0.5;
}
a {
  color: #93c5fd;
  text-decoration: underline;
}
</style>
