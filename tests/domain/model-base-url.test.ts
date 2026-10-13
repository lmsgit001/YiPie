import { describe, expect, it } from 'vitest';

import { BASE_URL_PRESETS, type BaseURLPreset } from '@/contract';
import {
  findBaseURLPreset,
  normalizeBaseURL,
  normalizeOllamaBaseURL,
  originPattern,
  parseBaseURL,
} from '@/domain/model/base-url';

describe('normalizeOllamaBaseURL', () => {
  it('rewrites Ollama’s own /api path to the OpenAI-compatible /v1', () => {
    expect(normalizeOllamaBaseURL('http://localhost:11434/api')).toBe('http://localhost:11434/v1');
    expect(normalizeOllamaBaseURL('http://localhost:11434/api/')).toBe('http://localhost:11434/v1');
    expect(normalizeOllamaBaseURL('HTTP://LOCALHOST:11434/API')).toBe('HTTP://LOCALHOST:11434/v1');
  });

  it('appends /v1 when the path is missing and leaves it alone when present', () => {
    expect(normalizeOllamaBaseURL('http://localhost:11434')).toBe('http://localhost:11434/v1');
    expect(normalizeOllamaBaseURL('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1');
    expect(normalizeOllamaBaseURL('  http://box.local:11434/v1  ')).toBe(
      'http://box.local:11434/v1',
    );
  });

  it('falls back to the local default instead of producing a relative URL', () => {
    expect(normalizeOllamaBaseURL('')).toBe('http://localhost:11434/v1');
    expect(normalizeOllamaBaseURL('   ')).toBe('http://localhost:11434/v1');
  });
});

describe('normalizeBaseURL', () => {
  it('only strips a trailing slash for OpenAI-compatible endpoints', () => {
    expect(normalizeBaseURL('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
    expect(normalizeBaseURL(' https://api.example.com/v1 ')).toBe('https://api.example.com/v1');
    // Deliberately not appended: compatible endpoints do not all use /v1.
    expect(normalizeBaseURL('https://gateway.example.com/openai')).toBe(
      'https://gateway.example.com/openai',
    );
  });

  it('drops a pasted endpoint path, which is never part of a base URL', () => {
    expect(normalizeBaseURL('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1',
    );
    expect(normalizeBaseURL('https://api.example.com/v1/chat/completions/')).toBe(
      'https://api.example.com/v1',
    );
  });

  it('routes to the Ollama rules by provider id', () => {
    expect(normalizeBaseURL('http://localhost:11434/api', 'ollama')).toBe(
      'http://localhost:11434/v1',
    );
  });
});

describe('parseBaseURL', () => {
  it('splits a value into origin, host and path', () => {
    const parts = parseBaseURL('https://Api.Example.com:8443/v1/');
    expect(parts).not.toBeNull();
    expect(parts?.origin).toBe('https://api.example.com:8443');
    expect(parts?.host).toBe('api.example.com:8443');
    expect(parts?.pathname).toBe('/v1');
  });

  it('rejects anything that is not an absolute http(s) URL', () => {
    for (const raw of ['', '   ', 'api.example.com/v1', 'ftp://example.com', 'file:///tmp/x']) {
      expect(parseBaseURL(raw)).toBeNull();
    }
  });

  it('keeps the port, because localhost endpoints differ only by it', () => {
    expect(parseBaseURL('http://localhost:11434/v1')?.host).toBe('localhost:11434');
    expect(parseBaseURL('http://localhost:1234/v1')?.host).toBe('localhost:1234');
  });
});

describe('originPattern', () => {
  it('builds the pattern host permissions are granted for', () => {
    expect(originPattern('https://api.example.com/v1')).toBe('https://api.example.com/*');
    expect(originPattern('http://localhost:11434/api')).toBe('http://localhost:11434/*');
  });

  it('returns null when the value cannot be turned into one', () => {
    expect(originPattern('not a url')).toBeNull();
  });
});

describe('findBaseURLPreset', () => {
  it('matches exactly and ignores protocol, case, trailing slash and /v1', () => {
    expect(findBaseURLPreset('https://api.openai.com/v1')?.preset.id).toBe('openai');

    const deepseek = findBaseURLPreset('https://api.deepseek.com');
    expect(deepseek?.preset.id).toBe('deepseek');
    expect(deepseek?.confidence).toBe('exact');

    const uppercase = findBaseURLPreset('https://API.OPENAI.COM/v1/');
    expect(uppercase?.preset.id).toBe('openai');
    expect(uppercase?.confidence).toBe('exact');
  });

  it('reports a known host with an unexpected path as a host-only match', () => {
    const match = findBaseURLPreset('http://localhost:11434/api');
    expect(match?.preset.id).toBe('ollama-local');
    expect(match?.confidence).toBe('host');
  });

  it('picks the path that matches when one host has several presets', () => {
    const presets: readonly BaseURLPreset[] = [
      {
        id: 'gateway-a',
        label: 'Gateway A',
        providerId: 'openai-compatible',
        baseURL: 'https://gateway.example.com/openai/v1',
      },
      {
        id: 'gateway-b',
        label: 'Gateway B',
        providerId: 'openai-compatible',
        baseURL: 'https://gateway.example.com/azure/v1',
      },
    ];

    expect(findBaseURLPreset('https://gateway.example.com/azure/v1', presets)).toMatchObject({
      confidence: 'exact',
      preset: { id: 'gateway-b' },
    });
    // Unknown path on a known host: the first entry wins, but only as a hint.
    expect(findBaseURLPreset('https://gateway.example.com/other', presets)).toMatchObject({
      confidence: 'host',
      preset: { id: 'gateway-a' },
    });
  });

  it('returns null when nothing is known about the host', () => {
    expect(findBaseURLPreset('https://unknown.example.com/v1')).toBeNull();
    expect(findBaseURLPreset('nonsense')).toBeNull();
  });

  it('ships one preset per provider that exists', () => {
    expect(BASE_URL_PRESETS.some((preset) => preset.providerId === 'ollama')).toBe(true);
    expect(new Set(BASE_URL_PRESETS.map((preset) => preset.id)).size).toBe(BASE_URL_PRESETS.length);
    for (const preset of BASE_URL_PRESETS) {
      expect(parseBaseURL(preset.baseURL, preset.providerId)).not.toBeNull();
    }
  });
});
