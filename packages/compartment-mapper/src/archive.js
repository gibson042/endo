/**
 * Provides mechanisms for creating archives (zip files with a
 * `compartmeent-map.json` and a file for every static dependency of an entry
 * module).
 *
 * Uses the conventions of Node.js package managers and the `node_modules`.
 * Archives will contain a copy for every physical copy of a package on disk,
 * such that importing will construct a separate instance for each.
 *
 * These archives will contain pre-compiled ESM and CJS and this module
 * entrains a dependency on the core of Babel.
 *
 * See `archive-lite.js` for a variation that does not depend on Babel
 * for cases like XS native Compartments where pre-compilation is not
 * necessary or where the dependency on Babel can be dererred to runtime.
 *
 * @module
 */

/**
 * @import {
 *   ArchiveOptions,
 *   ReadFn,
 *   ReadPowers,
 *   HashPowers,
 *   WriteFn,
 * } from './types.js'
 */

import { defaultParserForLanguage } from './archive-parsers.js';
import { mapNodeModules } from './node-modules.js';
import {
  makeAndHashArchiveFromMap,
  makeArchiveFromMap,
  mapFromMap,
  hashFromMap,
  writeArchiveFromMap,
} from './archive-lite.js';

const { assign, create, freeze } = Object;

/**
 * Add the default parserForLanguage option.
 * @param {ArchiveOptions} [options]
 * @returns {ArchiveOptions}
 */
const assignParserForLanguage = (options = {}) => {
  const { parserForLanguage: parserForLanguageOption, ...rest } = options;
  const parserForLanguage = freeze(
    assign(create(null), defaultParserForLanguage, parserForLanguageOption),
  );
  const languages = Object.keys(parserForLanguage);
  return { ...rest, parserForLanguage, languages };
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<{bytes: Uint8Array, sha512?: string}>}
 */
export const makeAndHashArchive = async (
  powers,
  moduleLocation,
  options = {},
) => {
  const { parserForLanguage, languages, ...otherOptions } =
    assignParserForLanguage(options);
  const compartmentMap = await mapNodeModules(powers, moduleLocation, {
    languages,
    ...otherOptions,
  });
  return makeAndHashArchiveFromMap(powers, compartmentMap, {
    parserForLanguage,
    ...otherOptions,
  });
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const makeArchive = async (powers, moduleLocation, options = {}) => {
  const {
    dev,
    tags,
    conditions = tags,
    strict = false,
    commonDependencies,
    policy,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    parserForLanguage,
    languages,
    ...otherOptions
  } = assignParserForLanguage(options);
  const compartmentMap = await mapNodeModules(powers, moduleLocation, {
    dev,
    strict,
    conditions,
    commonDependencies,
    policy,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    languages,
  });

  return makeArchiveFromMap(powers, compartmentMap, {
    parserForLanguage,
    policy,
    ...otherOptions,
  });
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const mapLocation = async (powers, moduleLocation, options = {}) => {
  const {
    dev,
    tags,
    conditions = tags,
    strict = false,
    commonDependencies,
    policy,
    parserForLanguage,
    languages,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    ...otherOptions
  } = assignParserForLanguage(options);

  const compartmentMap = await mapNodeModules(powers, moduleLocation, {
    dev,
    strict,
    conditions,
    commonDependencies,
    policy,
    languages,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
  });

  return mapFromMap(powers, compartmentMap, {
    parserForLanguage,
    policy,
    ...otherOptions,
  });
};

/**
 * @param {HashPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<string>}
 */
export const hashLocation = async (powers, moduleLocation, options = {}) => {
  const {
    dev,
    tags,
    conditions = tags,
    strict = false,
    commonDependencies,
    policy,
    parserForLanguage,
    languages,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    ...otherOptions
  } = assignParserForLanguage(options);

  const compartmentMap = await mapNodeModules(powers, moduleLocation, {
    dev,
    strict,
    conditions,
    commonDependencies,
    policy,
    languages,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
  });

  return hashFromMap(powers, compartmentMap, {
    parserForLanguage,
    policy,
    ...otherOptions,
  });
};

/**
 * @param {WriteFn} write
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 */
export const writeArchive = async (
  write,
  readPowers,
  archiveLocation,
  moduleLocation,
  options = {},
) => {
  const {
    dev,
    tags,
    conditions = tags,
    strict = false,
    commonDependencies,
    policy,
    parserForLanguage,
    languages,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    ...otherOptions
  } = assignParserForLanguage(options);
  const compartmentMap = await mapNodeModules(readPowers, moduleLocation, {
    dev,
    strict,
    conditions,
    commonDependencies,
    policy,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    languages,
  });
  return writeArchiveFromMap(
    write,
    readPowers,
    archiveLocation,
    compartmentMap,
    { policy, parserForLanguage, ...otherOptions },
  );
};
