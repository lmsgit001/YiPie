import { browser } from 'wxt/browser';

import { originPattern } from '@/domain/model/base-url';
import { createLogger } from '@/platform/logger';

const logger = createLogger('model-access');

/**
 * Host permissions for model endpoints, per origin, at runtime.
 *
 * The manifest declares no `host_permissions` at all: installing the extension
 * grants access to nothing, and an origin is only requested when the user adds a
 * model that points at it (plan 4.3 decision 3). Chrome exempts extension
 * requests from CORS checks for origins the extension actually holds, which is
 * why this is the whole mechanism — the previous project papered over the
 * missing permission by injecting CORS headers with `declarativeNetRequest`.
 *
 * **Call `request()` from a click handler.** Chrome documents that permissions
 * must be requested from inside a user gesture ("like a button's click
 * handler"). Its own example does so from a service-worker click listener, but
 * nothing documents that a gesture survives being forwarded through a message —
 * so phase 5 calls this from the page that received the click, which is
 * unambiguous. A refusal degrades to `denied` rather than throwing: a dismissed
 * dialog is a normal outcome, the model is saved anyway and marked as needing
 * access.
 *
 * **Every origin we may ask for is declared in the manifest** as
 * `optional_host_permissions` (`wxt.config.ts`, asserted by
 * `tests/manifest.test.ts`). Without that declaration Chrome rejects the request
 * with "Only permissions specified in the manifest may be requested" — a
 * rejection, not a "no" from the user, which is why that failure is logged
 * rather than folded into the normal refusal path.
 */

/**
 * `this: void` on purpose: these are WebExtension functions, never methods that
 * carry state. Saying so lets the implementation be passed around (and mocked)
 * without the compiler having to assume a receiver.
 */
export interface PermissionsApi {
  contains(this: void, permissions: { origins: string[] }): Promise<boolean>;
  request(this: void, permissions: { origins: string[] }): Promise<boolean>;
  remove(this: void, permissions: { origins: string[] }): Promise<boolean>;
}

export type OriginAccessStatus = 'granted' | 'denied' | 'unsupported';

export interface OriginAccess {
  /** Is this origin already granted? Never asks the user. */
  has(baseURL: string): Promise<boolean>;
  /** Ask the browser to grant it. Needs a user gesture; see above. */
  request(baseURL: string): Promise<OriginAccessStatus>;
  /** Best-effort cleanup when the last config using this origin is deleted. */
  release(baseURL: string): Promise<void>;
}

function defaultPermissions(): PermissionsApi | null {
  const permissions = (browser as { permissions?: PermissionsApi } | undefined)?.permissions;
  return permissions ?? null;
}

export function createOriginAccess(
  permissions: PermissionsApi | null = defaultPermissions(),
): OriginAccess {
  function patternOf(baseURL: string): string | null {
    try {
      return originPattern(baseURL);
    } catch (error) {
      logger.warn('could not derive an origin pattern from a base URL', error);
      return null;
    }
  }

  return {
    async has(baseURL) {
      const pattern = patternOf(baseURL);
      if (!pattern || !permissions) return false;

      try {
        return await permissions.contains({ origins: [pattern] });
      } catch (error) {
        logger.warn('host permission check failed', error);
        return false;
      }
    },

    async request(baseURL) {
      const pattern = patternOf(baseURL);
      if (!pattern || !permissions) return 'unsupported';

      try {
        return (await permissions.request({ origins: [pattern] })) ? 'granted' : 'denied';
      } catch (error) {
        // A missing user gesture lands here, and that is expected when the call
        // comes from the wrong context — log it (it is a bug worth seeing) and
        // report a plain refusal to the caller.
        logger.warn('host permission request failed', error);
        return 'denied';
      }
    },

    async release(baseURL) {
      const pattern = patternOf(baseURL);
      if (!pattern || !permissions) return;

      try {
        await permissions.remove({ origins: [pattern] });
      } catch (error) {
        // Reclaiming a permission is housekeeping; failing it must not fail the
        // deletion that triggered it.
        logger.debug('host permission release failed', error);
      }
    },
  };
}

/** Bound to the real `browser.permissions`; resolved lazily at import time. */
export const originAccess: OriginAccess = createOriginAccess();
