import { BASE_URL_PRESETS, type BaseURLPreset, type ProviderId } from '@/contract';

/**
 * Base URL handling for model endpoints. Pure string and URL work, so all of it
 * is testable in plain node — which matters because these are exactly the rules
 * that decide whether a request goes to the right place.
 *
 * Two different jobs live here and they must not be confused:
 *
 *  - *Normalisation* rewrites what the user typed into what the client needs.
 *    Only `providerId: 'ollama'` needs it: Ollama serves its own API under
 *    `/api` and the OpenAI-compatible one under `/v1`, and users paste both.
 *  - *Matching* answers "which shortcut did the user pick" for the form. It is
 *    deliberately sloppy (protocol, case, trailing slash, `/v1` all ignored)
 *    because its output is a label, never a request destination.
 */

const OLLAMA_API_SUFFIX = '/api';
const CHAT_COMPLETIONS_PATH = /\/chat\/completions$/i;

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * `http://localhost:11434` and `.../api` both become `.../v1`; anything already
 * ending in `/v1` is left alone. An empty value falls back to the documented
 * local default rather than producing a relative URL the client would resolve
 * against the extension origin.
 */
export function normalizeOllamaBaseURL(raw: string): string {
  const trimmed = stripTrailingSlashes(raw.trim());

  if (!trimmed) return 'http://localhost:11434/v1';
  if (trimmed.toLowerCase().endsWith(OLLAMA_API_SUFFIX)) {
    return `${trimmed.slice(0, -OLLAMA_API_SUFFIX.length)}/v1`;
  }
  if (/\/v1$/i.test(trimmed)) return trimmed;

  return `${trimmed}/v1`;
}

/**
 * Normalise for the given provider. This is applied when a client is built, not
 * when a config is read: rewriting the stored value during a read would make a
 * read path write, which is precisely the shape of the data loss this project
 * was rewritten to avoid (see `platform/storage/tx.ts`).
 */
export function normalizeBaseURL(
  raw: string,
  providerId: ProviderId = 'openai-compatible',
): string {
  if (providerId === 'ollama') return normalizeOllamaBaseURL(raw);

  const trimmed = stripTrailingSlashes(raw.trim());
  // Pasting the full endpoint instead of its base is a common mistake that
  // otherwise surfaces as a bare 404. `/chat/completions` is never part of a
  // base URL, so dropping it cannot lose information.
  if (CHAT_COMPLETIONS_PATH.test(trimmed)) {
    const withoutPath = stripTrailingSlashes(trimmed.replace(CHAT_COMPLETIONS_PATH, ''));
    if (withoutPath) return withoutPath;
  }

  return trimmed;
}

export interface BaseURLParts {
  /** The normalised URL the client would use. */
  href: string;
  /** `https://host[:port]` — also the string host permissions are granted for. */
  origin: string;
  /** Host and port, the unit preset matching compares. */
  host: string;
  /** Path without a trailing slash; `''` when the URL has no path. */
  pathname: string;
}

/**
 * Parse a stored value into the pieces the rest of the code needs. Returns null
 * for anything that is not an absolute http(s) URL: callers decide whether that
 * is a validation error (building a client) or simply "no match" (matching a
 * preset against a half-typed field).
 */
export function parseBaseURL(raw: string, providerId?: ProviderId): BaseURLParts | null {
  const normalized = normalizeBaseURL(raw, providerId);
  if (!normalized) return null;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  return {
    href: normalized,
    origin: url.origin,
    host: url.host,
    pathname: stripTrailingSlashes(url.pathname),
  };
}

/**
 * The origin pattern to request host permission for, or null when the value
 * cannot be turned into one. Both halves of this pair (build the pattern here,
 * ask the browser in `platform/model/policy.ts`) stay separate so the string
 * rule is unit-testable.
 */
export function originPattern(raw: string): string | null {
  const parts = parseBaseURL(raw);
  return parts ? `${parts.origin}/*` : null;
}

export type BaseURLPresetMatch = {
  preset: BaseURLPreset;
  /** `exact` means host *and* path matched; `host` means only the host did. */
  confidence: 'exact' | 'host';
};

/** Comparison form of a path: case-insensitive, no trailing slash, no `/v1`. */
function comparisonPath(pathname: string): string {
  return stripTrailingSlashes(pathname.toLowerCase()).replace(/\/v1$/, '');
}

/**
 * Find the preset a URL belongs to. Host decides first — a URL on a known host
 * is reported even when its path differs, because the useful output is a label
 * for the form and the host is what identifies the service.
 *
 * `presets` is injectable so the "same host, several paths" case can be pinned
 * without inventing duplicates in the shipped table.
 */
export function findBaseURLPreset(
  raw: string,
  presets: readonly BaseURLPreset[] = BASE_URL_PRESETS,
): BaseURLPresetMatch | null {
  const target = parseBaseURL(raw);
  if (!target) return null;

  let hostMatch: BaseURLPreset | null = null;

  for (const preset of presets) {
    const candidate = parseBaseURL(preset.baseURL);
    if (!candidate || candidate.host !== target.host) continue;

    if (comparisonPath(candidate.pathname) === comparisonPath(target.pathname)) {
      return { preset, confidence: 'exact' };
    }

    hostMatch ??= preset;
  }

  return hostMatch ? { preset: hostMatch, confidence: 'host' } : null;
}
