/* eslint-disable no-continue */

import {
  Number,
  String,
  TypeError,
  defineProperty,
  getOwnPropertyNames,
  isPrimitive,
  regexpExec,
  stringifyJson,
} from './commons.js';

export default function tameLocaleMethods(intrinsics, localeTaming = 'safe') {
  if (localeTaming === 'unsafe') {
    return;
  }

  // We use an object literal to define named functions.
  // We use concise method syntax to be `this`-sensitive but not
  // [[Construct]]ible.
  const tamedMethods = {
    // See https://tc39.es/ecma262/#sec-string.prototype.localecompare
    localeCompare(arg) {
      if (this === null || this === undefined) {
        throw TypeError(
          'Cannot localeCompare with null or undefined "this" value',
        );
      }
      const s = `${this}`;
      const that = `${arg}`;
      // eslint-disable-next-line no-nested-ternary
      return s < that ? -1 : s > that ? 1 : 0;
    },

    toString() {
      return `${this}`;
    },
  };

  defineProperty(String.prototype, 'localeCompare', {
    value: tamedMethods.localeCompare,
  });

  const localePattern = /^(\w*[a-z])Locale([A-Z]\w*)$/;
  const q = stringifyJson;

  for (const intrinsicName of getOwnPropertyNames(intrinsics)) {
    const intrinsic = intrinsics[intrinsicName];
    if (isPrimitive(intrinsic)) continue;

    for (const methodName of getOwnPropertyNames(intrinsic)) {
      const match = regexpExec(localePattern, methodName);
      if (!match) continue;

      if (typeof intrinsic[methodName] !== 'function') {
        throw TypeError(`expected ${q(methodName)} to be a function`);
      }
      const nonLocaleMethodName = `${match[1]}${match[2]}`;
      const method = intrinsic[nonLocaleMethodName];
      if (typeof method !== 'function') {
        throw TypeError(`function ${q(nonLocaleMethodName)} not found`);
      }
      defineProperty(intrinsic, methodName, { value: method });
    }
  }

  // Numbers are special because toString accepts a radix instead of ignoring
  // all of the arguments that we would otherwise forward.
  defineProperty(Number.prototype, 'toLocaleString', {
    value: tamedMethods.toString,
  });
}
