import { makeIterator } from './make-iterator.js';

/**
 * A `harden`ing analog of Array.prototype[Symbol.iterator].
 *
 * @template [T=unknown]
 * @param {Array<T>} arr
 * @returns {IterableIterator<T>}
 */
export const makeArrayIterator = arr => {
  const { length } = arr;
  let i = 0;
  return makeIterator(() => {
    if (i < length) {
      const value = arr[i];
      i += 1;
      return harden({ done: false, value });
    }
    return harden({ done: true, value: /** @type {T} */ (undefined) });
  });
};
harden(makeArrayIterator);
