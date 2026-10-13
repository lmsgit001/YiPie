import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOriginAccess, type PermissionsApi } from '@/platform/model/policy';

function fakePermissions(overrides: Partial<PermissionsApi> = {}): PermissionsApi {
  return {
    contains: vi.fn().mockResolvedValue(false),
    request: vi.fn().mockResolvedValue(false),
    remove: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('origin access', () => {
  let permissions: PermissionsApi;

  beforeEach(() => {
    permissions = fakePermissions();
  });

  it('asks about the origin of the base URL, not the whole URL', async () => {
    const access = createOriginAccess(permissions);

    await access.request('https://api.example.com/v1');

    expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://api.example.com/*'] });
  });

  it('reports granted and denied without throwing', async () => {
    const granted = createOriginAccess(
      fakePermissions({ request: vi.fn().mockResolvedValue(true) }),
    );
    expect(await granted.request('https://api.example.com/v1')).toBe('granted');

    const denied = createOriginAccess(
      fakePermissions({ request: vi.fn().mockResolvedValue(false) }),
    );
    expect(await denied.request('https://api.example.com/v1')).toBe('denied');
  });

  it('turns a refused dialog into "denied" rather than an exception', async () => {
    // This is the shape of the user-gesture error Chrome throws when the call
    // comes from a context without one.
    const access = createOriginAccess(
      fakePermissions({
        request: vi
          .fn()
          .mockRejectedValue(new Error('This function must be called during a user gesture')),
      }),
    );

    expect(await access.request('https://api.example.com/v1')).toBe('denied');
  });

  it('checks without ever asking', async () => {
    const access = createOriginAccess(
      fakePermissions({ contains: vi.fn().mockResolvedValue(true) }),
    );

    expect(await access.has('https://api.example.com/v1')).toBe(true);
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it('releases the pattern it granted, and survives a failure to', async () => {
    const access = createOriginAccess(permissions);
    await access.release('https://api.example.com/v1');
    expect(permissions.remove).toHaveBeenCalledWith({ origins: ['https://api.example.com/*'] });

    const failing = createOriginAccess(
      fakePermissions({ remove: vi.fn().mockRejectedValue(new Error('nope')) }),
    );
    await expect(failing.release('https://api.example.com/v1')).resolves.toBeUndefined();
  });

  it('degrades to unsupported when there is no permissions API at all', async () => {
    const access = createOriginAccess(null);

    expect(await access.request('https://api.example.com/v1')).toBe('unsupported');
    expect(await access.has('https://api.example.com/v1')).toBe(false);
    await expect(access.release('https://api.example.com/v1')).resolves.toBeUndefined();
  });

  it('degrades the same way for a base URL it cannot parse', async () => {
    const access = createOriginAccess(permissions);

    expect(await access.request('not a url')).toBe('unsupported');
    expect(await access.has('not a url')).toBe(false);
    expect(permissions.request).not.toHaveBeenCalled();
  });
});
