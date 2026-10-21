import { act } from '@testing-library/react';
import { vi } from 'vitest';

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** A promise the test settles itself, so the order of asynchronous answers never depends on timing. */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A response the test releases when it chooses. Return `promise` from a route handler, then
 * `await answer(body)`: it resolves only after the app has read the body and rendered the result,
 * so an assertion that follows sees the outcome and "was ignored" can be told from "has not arrived".
 */
export function deferredResponse() {
  const gate = deferred<Response>();
  const read = deferred<void>();
  return {
    promise: gate.promise,
    async answer(body: unknown, status = 200) {
      const response = Response.json(body, { status });
      const json = response.json.bind(response);
      response.json = async () => {
        const value: unknown = await json();
        read.resolve();
        return value;
      };
      await act(async () => {
        gate.resolve(response);
        await read.promise;
        // Query results are handed to components on a zero-delay timer, which a fake clock holds back.
        if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}
