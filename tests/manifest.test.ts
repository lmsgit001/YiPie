import { describe, expect, it } from 'vitest';

import config from '../wxt.config';

/**
 * The permission surface is a product promise, not a build detail: installing
 * the extension must grant access to nothing, and Chrome only lets
 * `permissions.request()` ask for an origin the manifest already mentions
 * (`optional_host_permissions`). Both halves are asserted here because getting
 * either wrong is invisible until a real browser refuses the request.
 */
/**
 * WXT types `manifest` as an object, a promise or a function; ours is a plain
 * object literal, so narrow to the fields this test is about.
 */
type PermissionFields = {
  permissions?: string[];
  host_permissions?: unknown;
  optional_host_permissions?: string[];
};

describe('manifest permissions', () => {
  const manifest = (config.manifest ?? {}) as PermissionFields;

  it('grants nothing at install time', () => {
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it('declares, but does not grant, the origins a model endpoint may need', () => {
    const optionalHosts = manifest.optional_host_permissions ?? [];

    expect(optionalHosts).toContain('https://*/*');
    expect(optionalHosts).toContain('http://*/*');
  });
});
