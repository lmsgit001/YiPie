/**
 * The one write queue.
 *
 * Every persisted shape here is stored as a whole object, so a read-modify-write
 * that interleaves with another one silently loses an update. The old project
 * solved this twice, with two hand-rolled queues in two background modules, and
 * still had writers that bypassed both. There is exactly one queue now, and
 * repository writes go through it; nothing else is allowed to call the storage
 * adapter's `setItem`.
 *
 * One rule for callers: do not call an enqueued write from *inside* a task.
 * The inner task waits for the queue, the queue waits for the outer task, and
 * the outer task waits for the inner one. Compose enqueued operations from
 * outside the queue (assembly, or a plain sequence), never from within.
 */
let tail: Promise<unknown> = Promise.resolve();

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  // `then(task, task)` so a rejected predecessor does not skip this task.
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}
