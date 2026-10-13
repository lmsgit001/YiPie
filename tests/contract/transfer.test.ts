import { describe, expect, it } from 'vitest';

import {
  buildTransferFile,
  createDefaultSelection,
  findDroppedHeaderNames,
  findDuplicateIds,
  ModelConfig,
  parseTransferFile,
  previewTransfer,
  PromptConfig,
  TRANSFER_FILE_TYPE,
  TRANSFER_FILE_VERSION,
} from '@/contract';

import type { TransferFile } from '@/contract';

const model = (id: string, overrides: Record<string, unknown> = {}) =>
  ModelConfig.parse({
    id,
    name: id,
    baseURL: 'https://api.example.com/v1',
    modelId: 'gpt-4o-mini',
    ...overrides,
  });

const prompt = (id = 'p1') => PromptConfig.parse({ id, name: id, userTemplate: '{{textContent}}' });

const input = (overrides: Record<string, unknown> = {}) => ({
  models: [model('a', { apiKey: 'sk-secret', headers: { 'x-key': 'v' }, extraBody: { t: 1 } })],
  prompts: [prompt()],
  selection: { ...createDefaultSelection(), defaultModelId: 'a' },
  exportedAt: '2026-10-13T00:00:00.000Z',
  ...overrides,
});

describe('buildTransferFile', () => {
  it('strips credentials unless they were explicitly asked for', () => {
    const file = buildTransferFile(input());

    expect(file.models[0]).toMatchObject({ apiKey: '', headers: {}, extraBody: {} });
    expect(file.type).toBe(TRANSFER_FILE_TYPE);
    expect(file.version).toBe(TRANSFER_FILE_VERSION);
  });

  it('keeps credentials when asked, and only then', () => {
    const file = buildTransferFile(input(), { includeSecrets: true });

    expect(file.models[0]).toMatchObject({
      apiKey: 'sk-secret',
      headers: { 'x-key': 'v' },
      extraBody: { t: 1 },
    });
  });

  it('only adds appVersion when there is one', () => {
    expect(buildTransferFile(input())).not.toHaveProperty('appVersion');
    expect(buildTransferFile(input({ appVersion: '0.1.0' })).appVersion).toBe('0.1.0');
  });

  it('produces something the parser accepts', () => {
    expect(parseTransferFile(buildTransferFile(input())).ok).toBe(true);
  });
});

describe('parseTransferFile', () => {
  it('names what it expected for a foreign file', () => {
    const result = parseTransferFile({ type: 'kuai-kan-models', version: 1 });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain(TRANSFER_FILE_TYPE);
  });

  it('refuses a file from a newer build instead of importing part of it', () => {
    const result = parseTransferFile({
      ...buildTransferFile(input()),
      version: TRANSFER_FILE_VERSION + 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('newer version');
  });

  it('rejects something that is not an object', () => {
    expect(parseTransferFile(null).ok).toBe(false);
    expect(parseTransferFile([]).ok).toBe(false);
    expect(parseTransferFile('{"type":"yipie-config"}').ok).toBe(false);
  });

  it('reports the offending path for a damaged file', () => {
    // `{ theme: 'dark' }` would NOT be damaged: every Selection field has a
    // default and unknown keys are stripped, so it parses as an empty selection.
    const result = parseTransferFile({
      ...buildTransferFile(input()),
      selection: { defaultModelId: 42 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('selection');
  });
});

describe('previewTransfer', () => {
  it('counts what would be imported and what would be skipped', () => {
    const file = buildTransferFile(input({ models: [model('a'), { foo: 1 }], prompts: [] }));

    expect(previewTransfer(file)).toMatchObject({
      models: { importable: 1, skipped: 1 },
      prompts: { importable: 0, skipped: 0 },
    });
  });

  it('reports row-level damage without discarding the row', () => {
    // Built by hand: this is a row as it arrives in a file, which the strict
    // `ModelConfig` schema rejects outright.
    const file: TransferFile = {
      ...buildTransferFile(input()),
      models: [
        {
          id: 'a',
          name: 'a',
          baseURL: 'https://api.example.com/v1',
          modelId: 'gpt-4o-mini',
          headers: { ok: 'x', bad: 3 },
        },
      ],
    };

    expect(previewTransfer(file)).toMatchObject({
      models: { importable: 1, skipped: 0 },
      notices: [
        { code: 'header-values-dropped', names: ['bad'] },
        { code: 'credentials-included', count: 1 },
      ],
    });
  });

  it('mentions credentials travelling in the file', () => {
    const file = buildTransferFile(input(), { includeSecrets: true });

    expect(previewTransfer(file).notices).toEqual([{ code: 'credentials-included', count: 1 }]);
  });
});

describe('file-level helpers', () => {
  it('finds header values that are not strings', () => {
    expect(findDroppedHeaderNames({ headers: { a: 'x', b: 2, c: null } })).toEqual(['b', 'c']);
    expect(findDroppedHeaderNames({})).toEqual([]);
    expect(findDroppedHeaderNames('nope')).toEqual([]);
  });

  it('finds duplicated ids, which would make later edits ambiguous', () => {
    expect(findDuplicateIds([{ id: 'a' }, { id: 'b' }, { id: 'a' }])).toEqual(['a']);
    expect(findDuplicateIds([{ id: 'a' }, { id: 'b' }])).toEqual([]);
  });
});
