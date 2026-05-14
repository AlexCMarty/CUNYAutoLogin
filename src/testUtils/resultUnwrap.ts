/**
 * Shared helpers for unwrapping `neverthrow` Results in unit tests.
 *
 * Preferred over `_unsafeUnwrap()` / `_unsafeUnwrapErr()` because a failed
 * assertion includes the actual error / value in the thrown message, which
 * makes the regression obvious in Vitest output.
 */

import type { Result } from "neverthrow";

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw new Error(`Expected Ok, got err(${JSON.stringify(result.error)})`);
  }
  return result.value;
}

export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (result.isOk()) {
    throw new Error(`Expected Err, got ok(${JSON.stringify(result.value)})`);
  }
  return result.error;
}
