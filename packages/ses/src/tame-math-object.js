import {
  Math,
  TypeError,
  create,
  getOwnPropertyDescriptors,
  objectPrototype,
} from './commons.js';

export default function tameMathObject() {
  const originalMath = Math;
  const initialMath = originalMath; // to follow the naming pattern

  const { random: _, ...otherDescriptors } =
    getOwnPropertyDescriptors(originalMath);

  // We use an object literal to define named functions.
  // We use concise method syntax to be `this`-sensitive but not
  // [[Construct]]ible.
  const tamedMethods = {
    /**
     * `%SharedMath%.random()` throws a TypeError starting with "secure mode".
     * See https://github.com/endojs/endo/issues/910#issuecomment-1581855420
     */
    random: () => {
      throw TypeError('secure mode %SharedMath%.random() throws');
    },
  };

  const sharedMath = create(objectPrototype, {
    ...otherDescriptors,
    random: {
      value: tamedMethods.random,
      writable: true,
      enumerable: false,
      configurable: true,
    },
  });

  return {
    '%InitialMath%': initialMath,
    '%SharedMath%': sharedMath,
  };
}
