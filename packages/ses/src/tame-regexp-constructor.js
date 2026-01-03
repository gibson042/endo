import {
  FERAL_REG_EXP,
  TypeError,
  apply,
  construct,
  defineProperties,
  getOwnPropertyDescriptor,
  speciesSymbol,
} from './commons.js';

export default function tameRegExpConstructor(regExpTaming = 'safe') {
  const RegExpPrototype = FERAL_REG_EXP.prototype;

  const makeRegExpConstructor = (_ = {}) => {
    // RegExp has non-writable static properties we need to omit.
    /**
     * @param  {Parameters<typeof FERAL_REG_EXP>} args
     */
    const ResultRegExp = function RegExp(...args) {
      return new.target === undefined
        ? apply(FERAL_REG_EXP, this, args)
        : construct(FERAL_REG_EXP, args, new.target);
    };

    defineProperties(ResultRegExp, {
      length: { value: 2 },
      prototype: {
        value: RegExpPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });
    // Hermes does not have `Symbol.species`. We should support such platforms.
    if (speciesSymbol) {
      const speciesDesc = getOwnPropertyDescriptor(
        FERAL_REG_EXP,
        speciesSymbol,
      );
      if (!speciesDesc) {
        throw TypeError('no RegExp[Symbol.species] descriptor');
      }
      defineProperties(ResultRegExp, {
        [speciesSymbol]: speciesDesc,
      });
    }
    return ResultRegExp;
  };

  const InitialRegExp = makeRegExpConstructor();
  const SharedRegExp = makeRegExpConstructor();

  if (regExpTaming !== 'unsafe') {
    // @ts-expect-error Deleted properties must be optional
    delete RegExpPrototype.compile;
  }
  defineProperties(RegExpPrototype, {
    constructor: { value: SharedRegExp },
  });

  return {
    '%InitialRegExp%': InitialRegExp,
    '%SharedRegExp%': SharedRegExp,
  };
}
