import {
  FERAL_ERROR,
  TypeError,
  apply,
  construct,
  defineName,
  defineProperties,
  defineProperty,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  isError,
  setPrototypeOf,
} from '../commons.js';
import { NativeErrors } from '../permits.js';
import { tameV8ErrorConstructor } from './tame-v8-error-constructor.js';

// Present on at least FF and XS. Proposed by Error-proposal. The original
// is dangerous, so tameErrorConstructor replaces it with a safe one.
// We grab the original here before it gets replaced.
const feralStackDesc = getOwnPropertyDescriptor(FERAL_ERROR.prototype, 'stack');
const feralStackGetter = feralStackDesc && feralStackDesc.get;

let initialGetStackString = defineName(
  'getStackString',
  typeof feralStackGetter === 'function'
    ? error => apply(feralStackGetter, error, [])
    : // The fallback is to just use the de facto `error.stack` if present
      error => ('stack' in error ? `${error.stack}` : ''),
);

export default function tameErrorConstructor(
  errorTaming = 'safe',
  stackFiltering = 'concise',
) {
  const {
    prototype: ErrorPrototype,
    captureStackTrace: originalCaptureStackTrace,
  } = FERAL_ERROR;
  const platform =
    typeof originalCaptureStackTrace === 'function' ? 'v8' : 'unknown';

  const makeErrorConstructor = (_ = {}) => {
    // eslint-disable-next-line no-shadow
    const ResultError = function Error(...args) {
      const error =
        new.target === undefined
          ? apply(FERAL_ERROR, this, args)
          : construct(FERAL_ERROR, args, new.target);
      if (platform === 'v8') {
        // TODO Likely expensive!
        apply(originalCaptureStackTrace, FERAL_ERROR, [error, ResultError]);
      }
      return error;
    };
    defineProperties(ResultError, {
      length: { value: 1 },
      prototype: {
        value: ErrorPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });
    return ResultError;
  };
  const InitialError = makeErrorConstructor({ powers: 'original' });
  const SharedError = makeErrorConstructor({ powers: 'none' });
  defineProperties(ErrorPrototype, {
    constructor: { value: SharedError },
  });

  for (const NativeError of NativeErrors) {
    setPrototypeOf(NativeError, SharedError);
  }

  // https://v8.dev/docs/stack-trace-api#compatibility advises that
  // programmers can "always" set `Error.stackTraceLimit`
  // even on non-v8 platforms. On non-v8
  // it will have no effect, but this advice only makes sense
  // if the assignment itself does not fail, which it would
  // if `Error` were naively frozen. Hence, we add setters that
  // accept but ignore the assignment on non-v8 platforms.
  defineProperties(InitialError, {
    stackTraceLimit: {
      get() {
        const { stackTraceLimit: limit } = FERAL_ERROR;
        // FERAL_ERROR.stackTraceLimit is only on v8
        return typeof limit === 'number' ? limit : undefined;
      },
      set(newLimit) {
        if (typeof newLimit !== 'number') {
          // silently do nothing. This behavior doesn't precisely
          // emulate v8 edge-case behavior. But given the purpose
          // of this emulation, having edge cases err towards
          // harmless seems the safer option.
          return;
        }
        if (typeof FERAL_ERROR.stackTraceLimit === 'number') {
          // FERAL_ERROR.stackTraceLimit is only on v8
          FERAL_ERROR.stackTraceLimit = newLimit;
          // We place the useless return on the next line to ensure
          // that anything we place after the if in the future only
          // happens if the then-case does not.
          // eslint-disable-next-line no-useless-return
          return;
        }
      },
      // WTF on v8 stackTraceLimit is enumerable
      enumerable: false,
      configurable: true,
    },
  });

  if (errorTaming === 'unsafe-debug' && platform === 'v8') {
    // This case is a kludge to work around
    // https://github.com/endojs/endo/issues/1798
    // https://github.com/endojs/endo/issues/2348
    // https://github.com/Agoric/agoric-sdk/issues/8662
    defineProperties(InitialError, {
      prepareStackTrace: {
        get() {
          return FERAL_ERROR.prepareStackTrace;
        },
        set(newPrepareStackTrace) {
          FERAL_ERROR.prepareStackTrace = newPrepareStackTrace;
        },
        enumerable: false,
        configurable: true,
      },
      captureStackTrace: {
        value: originalCaptureStackTrace,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    });

    const descs = getOwnPropertyDescriptors(InitialError);
    defineProperties(SharedError, {
      stackTraceLimit: descs.stackTraceLimit,
      prepareStackTrace: descs.prepareStackTrace,
      captureStackTrace: descs.captureStackTrace,
    });

    return {
      '%InitialGetStackString%': initialGetStackString,
      '%InitialError%': InitialError,
      '%SharedError%': SharedError,
    };
  }

  // The default SharedError much be completely powerless even on v8,
  // so the lenient `stackTraceLimit` accessor does nothing on all
  // platforms.
  defineProperties(SharedError, {
    stackTraceLimit: {
      get: () => undefined,
      set: _newLimit => {},
      enumerable: false,
      configurable: true,
    },
  });

  if (platform === 'v8') {
    // `SharedError.prepareStackTrace`, if it exists, must also be
    // powerless. However, from what we've heard, depd expects to be able to
    // assign to it without the assignment throwing. It is normally a function
    // that returns a stack string to be magically added to error objects.
    // However, as long as we're adding a lenient standin, we may as well
    // accommodate any who expect to get a function they can call and get
    // a string back. This prepareStackTrace is a fresh-each-time do-nothing
    // function that always returns the empty string.
    defineProperties(SharedError, {
      prepareStackTrace: {
        get: () => () => '',
        set: _newFn => {},
        enumerable: false,
        configurable: true,
      },
      captureStackTrace: {
        value: (errorish, _constructorOpt) => {
          defineProperty(errorish, 'stack', { value: '' });
        },
        writable: false,
        enumerable: false,
        configurable: true,
      },
    });
  }

  if (platform === 'v8') {
    initialGetStackString = tameV8ErrorConstructor(
      FERAL_ERROR,
      InitialError,
      errorTaming,
      stackFiltering,
    );
  } else {
    // Error.prototype.stack property as proposed at
    // https://tc39.es/proposal-error-stacks/ with the fix proposed at
    // https://github.com/tc39/proposal-error-stacks/issues/46 , limited to
    // non-V8 environments because the V8 'stack' own property has too much
    // magic to support coexistence with our accessors. In other environments,
    // this still protects against the override mistake, essentially like
    // enable-property-overrides.js would once this accessor property itself is
    // frozen, as will happen later during lockdown.
    //
    // However, there is here a change from the intent in the current state of
    // the proposal. If experience tells us whether this change is a good idea,
    // we should modify the proposal accordingly. There is much code in the
    // world that assumes `error.stack` is a string. So where the proposal
    // accommodates secure operation by making the property optional, we instead
    // have the property always present but limit the secure form to return a
    // stringified representation of the error without frame information.
    const isUnsafe = errorTaming === 'unsafe' || errorTaming === 'unsafe-debug';
    // We use an object literal to define named functions.
    // We use concise method syntax to be `this`-sensitive but not
    // [[Construct]]ible.
    const stackAccessor = getOwnPropertyDescriptors({
      get stack() {
        if (isUnsafe) return initialGetStackString(this);
        if (this === undefined || this === null) {
          throw TypeError('Cannot convert undefined or null to object');
        }
        // https://github.com/tc39/proposal-error-stacks/issues/46
        // allows this to not add an unpleasant newline. Otherwise
        // we should fix this.
        return isError(this) ? `${this}` : undefined;
      },
      set stack(newValue) {
        const stackDesc = {
          value: newValue,
          writable: true,
          enumerable: true,
          configurable: true,
        };
        defineProperties(this, { stack: stackDesc });
      },
    }).stack;

    defineProperties(ErrorPrototype, {
      stack: {
        ...stackAccessor,
        enumerable: false,
        configurable: true,
      },
    });
  }

  return {
    '%InitialGetStackString%': initialGetStackString,
    '%InitialError%': InitialError,
    '%SharedError%': SharedError,
  };
}
