import { defineProperty, apply, freeze, weaksetAdd } from './commons.js';

const nativeSuffix = ') { [native code] }';

// Note: Top level mutable state. Does not make anything worse, since the
// patching of `Function.prototype.toString` is also globally stateful. We
// use this top level state so that multiple calls to `tameFunctionToString` are
// idempotent, rather than creating redundant indirections.
let markVirtualizedNativeFunction;

/**
 * Replace `Function.prototype.toString` with one that recognizes
 * shimmed functions as honorary native functions.
 */
export const tameFunctionToString = () => {
  if (markVirtualizedNativeFunction === undefined) {
    const virtualizedNativeFunctions = new WeakSet();

    const originalFunctionToString = Function.prototype.toString;

    const tamingMethods = {
      toString() {
        const str = apply(originalFunctionToString, this, []);
        if (
          str.endsWith(nativeSuffix) ||
          !virtualizedNativeFunctions.has(this)
        ) {
          return str;
        }
        return `function ${this.name}() { [native code] }`;
      },
    };

    defineProperty(Function.prototype, 'toString', {
      value: tamingMethods.toString,
    });

    markVirtualizedNativeFunction = freeze(func =>
      weaksetAdd(virtualizedNativeFunctions, func),
    );
  }
  return markVirtualizedNativeFunction;
};
