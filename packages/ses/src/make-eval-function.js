import { defineName } from './commons.js';

/**
 * makeEvalFunction()
 * A safe version of the native eval function which relies on
 * the safety of `safe-eval` for confinement, unless `no-eval`
 * is specified (then a TypeError is thrown on use).
 *
 * @param {Function} evaluator
 */
export const makeEvalFunction = evaluator => {
  // We use concise function syntax (`=>`) to create an eval without
  // [[Construct]] behavior (such that `new eval()` throws
  // an "eval is not a constructor" TypeError).
  return defineName('eval', source => {
    if (typeof source !== 'string') {
      // As per the runtime semantic of PerformEval [ECMAScript 18.2.1.1]:
      // If Type(source) is not String, return source.
      // TODO Recent proposals from Mike Samuel may change this non-string
      // rule. Track.
      return source;
    }
    return evaluator(source);
  });
};
