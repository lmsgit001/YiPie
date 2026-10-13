/**
 * The `{{variable}}` subset decided in OQ-4: a placeholder is replaced, and
 * nothing else is interpreted. No sections, no partials, no lambdas — a template
 * that can run logic is a script, and this one is user data that arrives from an
 * imported file as often as from the editor.
 *
 * Rendering lives in the pipeline that owns the values (stage 3); what belongs
 * here is what the contract has to validate at save time: which variables a
 * template uses, and whether this build can fill them.
 */

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** Names used by the template, deduplicated and sorted. Pure text, no parsing of values. */
export function extractPromptVariables(template: string): string[] {
  const found = new Set<string>();

  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (name) found.add(name);
  }

  return [...found].sort();
}

/**
 * Names the template uses that this build cannot fill.
 *
 * Deliberately a *check*, not a schema constraint: making an unknown variable
 * unparseable would turn "a row from a newer build" into "an unrecognised row",
 * and the row would then disappear from the UI while still sitting in storage.
 * The editor rejects the typo; storage stays permissive.
 */
export function findUnknownPromptVariables(
  template: string,
  provided: readonly string[],
): string[] {
  const known = new Set(provided);
  return extractPromptVariables(template).filter((name) => !known.has(name));
}
