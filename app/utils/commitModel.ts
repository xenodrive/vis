import type { ModelInfo, ModelRef } from '@opencode/client';

// Keep these priorities aligned with OpenCode's title model selection.
const FAMILY_PRIORITY = ['gpt-luna', 'gemini-flash-lite', 'gemini-flash', 'claude-haiku'];
const VARIANT_PRIORITY = ['none', 'minimal', 'low'];

export function selectCommitModel(
  models: ModelInfo[],
  primary: ModelRef | undefined,
): ModelRef | undefined {
  if (!primary) return undefined;
  const candidates = models
    .filter(
      (model) =>
        model.providerID === primary.providerID &&
        model.enabled &&
        model.status === 'active' &&
        model.capabilities.input.some((type) => type.startsWith('text')) &&
        model.capabilities.output.some((type) => type.startsWith('text')),
    )
    .toSorted((a, b) => b.time.released - a.time.released);
  for (const family of FAMILY_PRIORITY) {
    const model = candidates.find((model) => model.family === family);
    if (!model) continue;
    const variant = VARIANT_PRIORITY.find((id) =>
      model.variants.some((variant) => variant.id === id),
    );
    return {
      providerID: model.providerID,
      id: model.id,
      ...(variant === undefined ? {} : { variant }),
    };
  }
  return primary;
}
