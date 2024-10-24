/**
 * This module provides {@link captureFromMap}, which only "captures" the
 * compartment map descriptors and sources from a partially completed
 * compartment map--_without_ creating an archive. The resulting compartment map
 * represents a well-formed dependency graph, laden with useful metadata. This,
 * for example, could be used for automatic policy generation.
 *
 * The resulting data structure ({@link CaptureResult}) contains a
 * mapping of filepaths to compartment map names.
 *
 * These functions do not have a bias for any particular mapping, so you will
 * need to use `mapNodeModules` from `@endo/compartment-map/node-modules.js` or
 * a similar device to construct one. The default `parserForLanguage` mapping is
 * empty. You will need to provide the `defaultParserForLanguage` from
 * `@endo/compartment-mapper/import-parsers.js` or
 * `@endo/compartment-mapper/archive-parsers.js`.
 *
 * If you use `@endo/compartment-mapper/archive-parsers.js`, the archive will
 * contain pre-compiled ESM and CJS modules wrapped in a JSON envelope, suitable
 * for use with the SES shim in any environment including a web page, without a
 * client-side dependency on Babel.
 *
 * If you use `@endo/compartment-mapper/import-parsers.js`, the archive will
 * contain original sources, so to import the archive with
 * `src/import-archive-lite.js`, you will need to provide the archive parsers
 * and entrain a runtime dependency on Babel.
 *
 * @module
 */

// @ts-check
/* eslint no-shadow: 0 */

/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {CompartmentMapDescriptor} from './types.js' */
/** @import {CaptureOptions} from './types.js' */
/** @import {Sources} from './types.js' */
/** @import {CompartmentDescriptor} from './types.js' */
/** @import {ModuleDescriptor} from './types.js' */
/** @import {CaptureResult} from './types.js' */

import {
  assertCompartmentMap,
  pathCompare,
  stringCompare,
} from './compartment-map.js';
import {
  exitModuleImportHookMaker,
  makeImportHookMaker,
} from './import-hook.js';
import { link } from './link.js';
import { resolve } from './node-module-specifier.js';
import { detectAttenuators } from './policy.js';
import { unpackReadPowers } from './powers.js';

const { freeze, assign, create, fromEntries, entries, keys } = Object;

const defaultCompartment = Compartment;

/**
 * We attempt to produce compartment maps that are consistent regardless of
 * whether the packages were originally laid out on disk for development or
 * production, and other trivia like the fully qualified path of a specific
 * installation.
 *
 * Naming compartments for the self-ascribed name and version of each Node.js
 * package is insufficient because they are not guaranteed to be unique.
 * Dependencies do not necessarilly come from the npm registry and may be
 * for example derived from fully qualified URL's or Github org and project
 * names.
 * Package managers are also not required to fully deduplicate the hard
 * copy of each package even when they are identical resources.
 * Duplication is undesirable, but we elect to defer that problem to solutions
 * in the package managers, as the alternative would be to consistently hash
 * the original sources of the packages themselves, which may not even be
 * available much less pristine for us.
 *
 * So, instead, we use the lexically least path of dependency names, delimited
 * by hashes.
 * The compartment maps generated by the ./node-modules.js tooling pre-compute
 * these traces for our use here.
 * We sort the compartments lexically on their self-ascribed name and version,
 * and use the lexically least dependency name path as a tie-breaker.
 * The dependency path is logical and orthogonal to the package manager's
 * actual installation location, so should be orthogonal to the vagaries of the
 * package manager's deduplication algorithm.
 *
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @returns {Record<string, string>} map from old to new compartment names.
 */
const renameCompartments = compartments => {
  /** @type {Record<string, string>} */
  const compartmentRenames = create(null);
  let index = 0;
  let prev = '';

  // The sort below combines two comparators to avoid depending on sort
  // stability, which became standard as recently as 2019.
  // If that date seems quaint, please accept my regards from the distant past.
  // We are very proud of you.
  const compartmentsByPath = Object.entries(compartments)
    .map(([name, compartment]) => ({
      name,
      path: compartment.path,
      label: compartment.label,
    }))
    .sort((a, b) => {
      if (a.label === b.label) {
        assert(a.path !== undefined && b.path !== undefined);
        return pathCompare(a.path, b.path);
      }
      return stringCompare(a.label, b.label);
    });

  for (const { name, label } of compartmentsByPath) {
    if (label === prev) {
      compartmentRenames[name] = `${label}-n${index}`;
      index += 1;
    } else {
      compartmentRenames[name] = label;
      prev = label;
      index = 1;
    }
  }
  return compartmentRenames;
};

/**
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {Sources} sources
 * @param {Record<string, string>} compartmentRenames
 */
const translateCompartmentMap = (compartments, sources, compartmentRenames) => {
  const result = create(null);
  for (const compartmentName of keys(compartmentRenames)) {
    const compartment = compartments[compartmentName];
    const { name, label, retained, policy } = compartment;
    if (retained) {
      // rename module compartments
      /** @type {Record<string, ModuleDescriptor>} */
      const modules = create(null);
      const compartmentModules = compartment.modules;
      if (compartment.modules) {
        for (const name of keys(compartmentModules).sort()) {
          const module = compartmentModules[name];
          if (module.compartment !== undefined) {
            modules[name] = {
              ...module,
              compartment: compartmentRenames[module.compartment],
            };
          } else {
            modules[name] = module;
          }
        }
      }

      // integrate sources into modules
      const compartmentSources = sources[compartmentName];
      if (compartmentSources) {
        for (const name of keys(compartmentSources).sort()) {
          const source = compartmentSources[name];
          const { location, parser, exit, sha512, deferredError } = source;
          if (location !== undefined) {
            modules[name] = {
              location,
              parser,
              sha512,
            };
          } else if (exit !== undefined) {
            modules[name] = {
              exit,
            };
          } else if (deferredError !== undefined) {
            modules[name] = {
              deferredError,
            };
          }
        }
      }

      result[compartmentRenames[compartmentName]] = {
        name,
        label,
        location: compartmentRenames[compartmentName],
        modules,
        policy,
        // `scopes`, `types`, and `parsers` are not necessary since every
        // loadable module is captured in `modules`.
      };
    }
  }

  return result;
};

/**
 * @param {Sources} sources
 * @param {Record<string, string>} compartmentRenames
 * @returns {Sources}
 */
const renameSources = (sources, compartmentRenames) => {
  return fromEntries(
    entries(sources).map(([name, compartmentSources]) => [
      compartmentRenames[name],
      compartmentSources,
    ]),
  );
};

/**
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {Sources} sources
 * @returns {CaptureResult}
 */
const captureCompartmentMap = (compartmentMap, sources) => {
  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;

  const compartmentRenames = renameCompartments(compartments);
  const captureCompartments = translateCompartmentMap(
    compartments,
    sources,
    compartmentRenames,
  );
  const captureEntryCompartmentName = compartmentRenames[entryCompartmentName];
  const captureSources = renameSources(sources, compartmentRenames);

  const captureCompartmentMap = {
    // TODO graceful migration from tags to conditions
    // https://github.com/endojs/endo/issues/2388
    tags: [],
    entry: {
      compartment: captureEntryCompartmentName,
      module: entryModuleSpecifier,
    },
    compartments: captureCompartments,
  };

  // Cross-check:
  // We assert that we have constructed a valid compartment map, not because it
  // might not be, but to ensure that the assertCompartmentMap function can
  // accept all valid compartment maps.
  assertCompartmentMap(captureCompartmentMap);

  return {
    captureCompartmentMap,
    captureSources,
    compartmentRenames,
  };
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {CaptureOptions} [options]
 * @returns {Promise<CaptureResult>}
 */
export const captureFromMap = async (powers, compartmentMap, options = {}) => {
  const {
    moduleTransforms,
    modules: exitModules = {},
    searchSuffixes = undefined,
    importHook: exitModuleImportHook = undefined,
    policy = undefined,
    sourceMapHook = undefined,
    parserForLanguage: parserForLanguageOption = {},
    languageForExtension: languageForExtensionOption = {},
    Compartment = defaultCompartment,
  } = options;

  const parserForLanguage = freeze(
    assign(create(null), parserForLanguageOption),
  );
  const languageForExtension = freeze(
    assign(create(null), languageForExtensionOption),
  );

  const { read, computeSha512 } = unpackReadPowers(powers);

  const {
    compartments,
    entry: { module: entryModuleSpecifier, compartment: entryCompartmentName },
  } = compartmentMap;

  /** @type {Sources} */
  const sources = Object.create(null);

  const consolidatedExitModuleImportHook = exitModuleImportHookMaker({
    modules: exitModules,
    exitModuleImportHook,
  });

  const makeImportHook = makeImportHookMaker(read, entryCompartmentName, {
    sources,
    compartmentDescriptors: compartments,
    archiveOnly: true,
    computeSha512,
    searchSuffixes,
    entryCompartmentName,
    entryModuleSpecifier,
    exitModuleImportHook: consolidatedExitModuleImportHook,
    sourceMapHook,
  });
  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment, attenuatorsCompartment } = link(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
    languageForExtension,
    archiveOnly: true,
    Compartment,
  });
  await compartment.load(entryModuleSpecifier);
  if (policy) {
    // retain all attenuators.
    await Promise.all(
      detectAttenuators(policy).map(attenuatorSpecifier =>
        attenuatorsCompartment.load(attenuatorSpecifier),
      ),
    );
  }

  return captureCompartmentMap(compartmentMap, sources);
};
