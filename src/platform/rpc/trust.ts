import { browser } from 'wxt/browser';

/**
 * Only this extension may talk to the background.
 *
 * The manifest declares no `externally_connectable`, so nothing outside the
 * extension should be able to reach these handlers at all. This check is the
 * second layer, not the only one: it stays correct if that manifest field is
 * ever added, and it costs one comparison.
 */
export function isTrustedSender(sender: unknown): boolean {
  if (typeof sender !== 'object' || sender === null) return false;
  const id = (sender as { id?: unknown }).id;
  return typeof id === 'string' && id === browser.runtime.id;
}

export function assertTrustedSender(sender: unknown): void {
  if (!isTrustedSender(sender)) {
    throw new Error('Rejected a message from an untrusted sender');
  }
}
