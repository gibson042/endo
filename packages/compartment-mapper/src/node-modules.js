/**
 * @module Provides functions for constructing a compartment map that has a
 * compartment descriptor corresponding to every reachable package from an
 * entry module and how to create links between them.
 * The resulting compartment map does not describe individual modules but does
 * capture every usable route between packages including those generalized by
 * wildcard expansion.
 * See {@link link} to expand a compartment map to capture module descriptors
 * for transitive dependencies.
 */

/* eslint no-shadow: 0 */

/**
 * @import {
 *   CanonicalFn,
 *   CompartmentDescriptor,
 *   CompartmentMapDescriptor,
 *   CompartmentMapForNodeModulesOptions,
 *   Language,
 *   LanguageForExtension,
 *   MapNodeModulesOptions,
 *   MaybeReadFn,
 *   MaybeReadPowers,
 *   ModuleDescriptor,
 *   ReadFn,
 *   ReadPowers,
 *   ScopeDescriptor,
 *   SomePackagePolicy,
 *   SomePolicy,
 * } from './types.js'
 */

/**
 * The graph is an intermediate object model that the functions of this module
 * build by exploring the `node_modules` tree dropped by tools like npm and
 * consumed by tools like Node.js.
 * This gets translated finally into a compartment map.
 *
 * @typedef {Record<string, Node>} Graph
 */

/**
 * @typedef {object} Node
 * @property {string} label
 * @property {string} name
 * @property {Array<string>} path
 * @property {Array<string>} logicalPath
 * @property {boolean} explicitExports
 * @property {Record<string, string>} internalAliases
 * @property {Record<string, string>} externalAliases
 * @property {Record<string, string>} dependencyLocations - from module name to
 * location in storage.
 * @property {LanguageForExtension} parsers - the parser for
 * modules based on their extension.
 * @property {Record<string, Language>} types - the parser for specific
 * modules.
 */

/**
 * @typedef {object} LanguageOptions
 * @property {LanguageForExtension} commonjsLanguageForExtension
 * @property {LanguageForExtension} moduleLanguageForExtension
 * @property {LanguageForExtension} workspaceCommonjsLanguageForExtension
 * @property {LanguageForExtension} workspaceModuleLanguageForExtension
 * @property {Set<string>} languages
 */

/**
 * @typedef {Record<string, {spec: string, alias: string}>} CommonDependencyDescriptors
 */

import { pathCompare } from './compartment-map.js';
import { inferExportsAndAliases } from './infer-exports.js';
import { parseLocatedJson } from './json.js';
import { join } from './node-module-specifier.js';
import { assertPolicy } from './policy-format.js';
import {
  ATTENUATORS_COMPARTMENT,
  dependencyAllowedByPolicy,
  getPolicyForPackage,
} from './policy.js';
import { unpackReadPowers } from './powers.js';
import { search, searchDescriptor } from './search.js';

const { assign, create, keys, values } = Object;

const decoder = new TextDecoder();

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => {
  return new URL(rel, abs).toString();
};

/**
 * @param {string} location
 * @returns {string}
 */
const basename = location => {
  const { pathname } = new URL(location);
  const index = pathname.lastIndexOf('/');
  if (index < 0) {
    return pathname;
  }
  return pathname.slice(index + 1);
};

/**
 * @param {MaybeReadFn} maybeRead
 * @param {string} packageLocation
 * @returns {Promise<object>}
 */
const readDescriptor = async (maybeRead, packageLocation) => {
  const descriptorLocation = resolveLocation('package.json', packageLocation);
  const descriptorBytes = await maybeRead(descriptorLocation);
  if (descriptorBytes === undefined) {
    return undefined;
  }
  const descriptorText = decoder.decode(descriptorBytes);
  const descriptor = parseLocatedJson(descriptorText, descriptorLocation);
  return descriptor;
};

/**
 * @param {Record<string, object>} memo
 * @param {MaybeReadFn} maybeRead
 * @param {string} packageLocation
 * @returns {Promise<object>}
 */
const readDescriptorWithMemo = async (memo, maybeRead, packageLocation) => {
  let promise = memo[packageLocation];
  if (promise !== undefined) {
    return promise;
  }
  promise = readDescriptor(maybeRead, packageLocation);
  memo[packageLocation] = promise;
  return promise;
};

/**
 * @callback ReadDescriptorFn
 * @param {string} packageLocation
 * @returns {Promise<object>}
 */

/**
 * findPackage behaves as Node.js to find third-party modules by searching
 * parent to ancestor directories for a `node_modules` directory that contains
 * the name.
 * Node.js does not actually require these to be packages, but in practice,
 * these are the locations that pakcage managers drop a package so Node.js can
 * find it efficiently.
 *
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {string} directory
 * @param {string} name
 * @returns {Promise<{
 *   packageLocation: string,
 *   packageDescriptor: object,
 * } | undefined>}
 */
const findPackage = async (readDescriptor, canonical, directory, name) => {
  await null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const packageLocation = await canonical(
      resolveLocation(`node_modules/${name}/`, directory),
    );

    // eslint-disable-next-line no-await-in-loop
    const packageDescriptor = await readDescriptor(packageLocation);
    if (packageDescriptor !== undefined) {
      return { packageLocation, packageDescriptor };
    }

    const parent = resolveLocation('../', directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;

    const base = basename(directory);
    if (base === 'node_modules') {
      directory = resolveLocation('../', directory);
      if (parent === directory) {
        return undefined;
      }
      directory = parent;
    }
  }
};

const defaultLanguageForExtension = /** @type {const} */ ({
  mjs: 'mjs',
  cjs: 'cjs',
  json: 'json',
  text: 'text',
  bytes: 'bytes',
});
const defaultCommonjsLanguageForExtension = /** @type {const} */ ({
  js: 'cjs',
});
const defaultModuleLanguageForExtension = /** @type {const} */ ({
  js: 'mjs',
});

/**
 * @param {object} descriptor
 * @param {string} location
 * @param {LanguageOptions} languageOptions
 * @returns {Record<string, string>}
 */
const inferParsers = (descriptor, location, languageOptions) => {
  let { moduleLanguageForExtension, commonjsLanguageForExtension } =
    languageOptions;
  const {
    languages,
    workspaceModuleLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
  } = languageOptions;

  // Select languageForExtension options based on whether they are physically
  // under node_modules, indicating that they have not been built for npm,
  // so any languages that compile to JavaScript may need additional parsers.
  if (!location.includes('/node_modules/')) {
    moduleLanguageForExtension = workspaceModuleLanguageForExtension;
    commonjsLanguageForExtension = workspaceCommonjsLanguageForExtension;
  }

  const {
    type,
    module,
    parsers: packageLanguageForExtension = {},
  } = descriptor;

  // Validate package-local "parsers"
  if (
    typeof packageLanguageForExtension !== 'object' ||
    packageLanguageForExtension === null
  ) {
    throw Error(
      `Cannot interpret parser map ${JSON.stringify(
        packageLanguageForExtension,
      )} of package at ${location}, must be an object mapping file extensions to corresponding languages (for example, mjs for ECMAScript modules, cjs for CommonJS modules, or json for JSON modules`,
    );
  }
  const invalidLanguages = values(packageLanguageForExtension).filter(
    language => !languages.has(language),
  );
  if (invalidLanguages.length > 0) {
    throw Error(
      `Cannot interpret parser map language values ${JSON.stringify(
        invalidLanguages,
      )} of package at ${location}, must be an object mapping file extensions to corresponding languages (for example, mjs for ECMAScript modules, cjs for CommonJS modules, or json for JSON modules`,
    );
  }

  if (type === 'module' || module !== undefined) {
    return { ...moduleLanguageForExtension, ...packageLanguageForExtension };
  }
  if (type === 'commonjs') {
    return { ...commonjsLanguageForExtension, ...packageLanguageForExtension };
  }
  if (type !== undefined) {
    throw Error(
      `Cannot infer parser map for package of type ${type} at ${location}`,
    );
  }
  return { ...commonjsLanguageForExtension, ...packageLanguageForExtension };
};

/**
 * graphPackage and gatherDependency are mutually recursive functions that
 * gather the metadata for a package and its transitive dependencies.
 * The keys of the graph are the locations of the package descriptors.
 * The metadata include a label (which is informative and not necessarily
 * unique), the location of each shallow dependency, and names of the modules
 * that the package exports.
 *
 * @param {string} name
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {Graph} graph
 * @param {object} packageDetails
 * @param {string} packageDetails.packageLocation
 * @param {object} packageDetails.packageDescriptor
 * @param {Set<string>} conditions
 * @param {boolean | undefined} dev
 * @param {CommonDependencyDescriptors} commonDependencyDescriptors
 * @param {LanguageOptions} languageOptions
 * @param {boolean} strict
 * @param {Map<string, Array<string>>} preferredPackageLogicalPathMap
 * @param {Array<string>} logicalPath
 * @returns {Promise<undefined>}
 */
const graphPackage = async (
  name,
  readDescriptor,
  canonical,
  graph,
  { packageLocation, packageDescriptor },
  conditions,
  dev,
  commonDependencyDescriptors,
  languageOptions,
  strict,
  preferredPackageLogicalPathMap = new Map(),
  logicalPath = [],
) => {
  if (graph[packageLocation] !== undefined) {
    // Returning the promise here would create a causal cycle and stall recursion.
    return undefined;
  }

  if (packageDescriptor.name !== name) {
    console.warn(
      `Package named ${q(
        name,
      )} does not match location ${packageLocation} got (${q(
        packageDescriptor.name,
      )})`,
    );
  }

  const result = {};
  graph[packageLocation] = /** @type {Node} */ (result);

  /** @type {Record<string, string>} */
  const dependencyLocations = {};
  const children = [];
  const optionals = new Set();
  const {
    dependencies = {},
    peerDependencies = {},
    peerDependenciesMeta = {},
    bundleDependencies = {},
    optionalDependencies = {},
    devDependencies = {},
  } = packageDescriptor;
  const allDependencies = {};
  for (const [name, descriptor] of Object.entries(
    commonDependencyDescriptors,
  )) {
    if (Object(descriptor) === descriptor) {
      const { spec } = descriptor;
      allDependencies[name] = spec;
    }
  }
  assign(allDependencies, dependencies);
  assign(allDependencies, peerDependencies);
  for (const [name, meta] of Object.entries(peerDependenciesMeta)) {
    if (Object(meta) === meta && meta.optional) {
      optionals.add(name);
    }
  }
  assign(allDependencies, bundleDependencies);
  assign(allDependencies, optionalDependencies);
  for (const name of Object.keys(optionalDependencies)) {
    optionals.add(name);
  }
  if (dev) {
    assign(allDependencies, devDependencies);
  }

  for (const name of keys(allDependencies).sort()) {
    const optional = optionals.has(name);
    const childLogicalPath = [...logicalPath, name];
    children.push(
      // Mutual recursion ahead:
      // eslint-disable-next-line no-use-before-define
      gatherDependency(
        readDescriptor,
        canonical,
        graph,
        dependencyLocations,
        packageLocation,
        name,
        conditions,
        preferredPackageLogicalPathMap,
        languageOptions,
        strict,
        childLogicalPath,
        optional,
        commonDependencyDescriptors,
      ),
    );
  }

  const { version = '', exports: exportsDescriptor } = packageDescriptor;
  /** @type {Record<string, Language>} */
  const types = {};

  const readDescriptorUpwards = async path => {
    const location = resolveLocation(path, packageLocation);
    // readDescriptor coming from above is memoized, so this is not awfully slow
    const { data } = await searchDescriptor(location, readDescriptor);
    return data;
  };

  /** @type {Record<string, string>} */
  const externalAliases = {};
  /** @type {Record<string, string>} */
  const internalAliases = {};

  inferExportsAndAliases(
    packageDescriptor,
    externalAliases,
    internalAliases,
    conditions,
    types,
  );

  const parsers = inferParsers(
    packageDescriptor,
    packageLocation,
    languageOptions,
  );

  Object.assign(result, {
    name,
    path: logicalPath,
    label: `${name}${version ? `-v${version}` : ''}`,
    explicitExports: exportsDescriptor !== undefined,
    externalAliases,
    internalAliases,
    dependencyLocations,
    types,
    parsers,
  });

  await Promise.all(
    values(result.externalAliases).map(async item => {
      const descriptor = await readDescriptorUpwards(item);
      if (descriptor && descriptor.type === 'module') {
        types[item] = 'mjs';
      }
    }),
  );

  await Promise.all(children);

  // handle commonDependencyDescriptors package aliases
  for (const [name, { alias }] of Object.entries(commonDependencyDescriptors)) {
    // update the dependencyLocations to point to the common dependency
    const targetLocation = dependencyLocations[name];
    if (targetLocation === undefined) {
      throw Error(
        `Cannot find common dependency ${name} for ${packageLocation}`,
      );
    }
    dependencyLocations[alias] = targetLocation;
  }
  // handle internalAliases package aliases
  for (const specifier of keys(internalAliases).sort()) {
    const target = internalAliases[specifier];
    // ignore all internalAliases where the specifier or target is relative
    const specifierIsRelative = specifier.startsWith('./') || specifier === '.';
    // eslint-disable-next-line no-continue
    if (specifierIsRelative) continue;
    const targetIsRelative = target.startsWith('./') || target === '.';
    // eslint-disable-next-line no-continue
    if (targetIsRelative) continue;
    const targetLocation = dependencyLocations[target];
    if (targetLocation === undefined) {
      throw Error(`Cannot find dependency ${target} for ${packageLocation}`);
    }
    dependencyLocations[specifier] = targetLocation;
  }

  return undefined;
};

/**
 * @param {ReadDescriptorFn} readDescriptor
 * @param {CanonicalFn} canonical
 * @param {Graph} graph - the partially build graph.
 * @param {Record<string, string>} dependencyLocations
 * @param {string} packageLocation - location of the package of interest.
 * @param {string} name - name of the package of interest.
 * @param {Set<string>} conditions
 * @param {Map<string, Array<string>>} preferredPackageLogicalPathMap
 * @param {LanguageOptions} languageOptions
 * @param {boolean} strict
 * @param {Array<string>} [childLogicalPath]
 * @param {boolean} [optional] - whether the dependency is optional
 * @param {object} [commonDependencyDescriptors] - dependencies to be added to all packages
 */
const gatherDependency = async (
  readDescriptor,
  canonical,
  graph,
  dependencyLocations,
  packageLocation,
  name,
  conditions,
  preferredPackageLogicalPathMap,
  languageOptions,
  strict,
  childLogicalPath = [],
  optional = false,
  commonDependencyDescriptors = undefined,
) => {
  const dependency = await findPackage(
    readDescriptor,
    canonical,
    packageLocation,
    name,
  );
  if (dependency === undefined) {
    // allow the dependency to be missing if optional
    if (optional || !strict) {
      return;
    }
    throw Error(`Cannot find dependency ${name} for ${packageLocation}`);
  }
  dependencyLocations[name] = dependency.packageLocation;
  const theCurrentBest = preferredPackageLogicalPathMap.get(
    dependency.packageLocation,
  );
  if (pathCompare(childLogicalPath, theCurrentBest) < 0) {
    preferredPackageLogicalPathMap.set(
      dependency.packageLocation,
      childLogicalPath,
    );
  }
  await graphPackage(
    name,
    readDescriptor,
    canonical,
    graph,
    dependency,
    conditions,
    false,
    commonDependencyDescriptors,
    languageOptions,
    strict,
    preferredPackageLogicalPathMap,
    childLogicalPath,
  );
};

/**
 * graphPackages returns a graph whose keys are nominally URLs, one per
 * package, with values that are label: (an informative Compartment name, built
 * as ${name}@${version}), dependencies: (a list of URLs), and exports: (an
 * object whose keys are the thing being imported, and the values are the names
 * of the matching module, relative to the containing package's root, that is,
 * the URL that was used as the key of graph).
 * The URLs in dependencies will all exist as other keys of graph.
 *
 * @param {MaybeReadFn} maybeRead
 * @param {CanonicalFn} canonical
 * @param {string} packageLocation - location of the main package.
 * @param {Set<string>} conditions
 * @param {object} mainPackageDescriptor - the parsed contents of the main
 * package.json, which was already read when searching for the package.json.
 * @param {boolean|undefined} dev - whether to use devDependencies from this package (and
 * only this package).
 * @param {Record<string,string>} commonDependencies - dependencies to be added to all packages
 * @param {LanguageOptions} languageOptions
 * @param {boolean} strict
 */
const graphPackages = async (
  maybeRead,
  canonical,
  packageLocation,
  conditions,
  mainPackageDescriptor,
  dev,
  commonDependencies,
  languageOptions,
  strict,
) => {
  const memo = create(null);
  /**
   * @param {string} packageLocation
   * @returns {Promise<object>}
   */
  const readDescriptor = packageLocation =>
    readDescriptorWithMemo(memo, maybeRead, packageLocation);

  if (mainPackageDescriptor !== undefined) {
    memo[packageLocation] = Promise.resolve(mainPackageDescriptor);
  }

  const packageDescriptor = await readDescriptor(packageLocation);

  conditions = new Set(conditions || []);
  conditions.add('import');
  conditions.add('default');
  conditions.add('endo');

  if (packageDescriptor === undefined) {
    throw Error(
      `Cannot find package.json for application at ${packageLocation}`,
    );
  }

  // Resolve common dependencies.
  /** @type {CommonDependencyDescriptors} */
  const commonDependencyDescriptors = {};
  const packageDescriptorDependencies = packageDescriptor.dependencies || {};
  for (const [alias, dependencyName] of Object.entries(commonDependencies)) {
    const spec = packageDescriptorDependencies[dependencyName];
    if (spec === undefined) {
      throw Error(
        `Cannot find dependency ${dependencyName} for ${packageLocation} from common dependencies`,
      );
    }
    commonDependencyDescriptors[dependencyName] = {
      spec,
      alias,
    };
  }

  const graph = create(null);
  await graphPackage(
    packageDescriptor.name,
    readDescriptor,
    canonical,
    graph,
    {
      packageLocation,
      packageDescriptor,
    },
    conditions,
    dev,
    commonDependencyDescriptors,
    languageOptions,
    strict,
  );
  return graph;
};

/**
 * translateGraph converts the graph returned by graph packages (above) into a
 * compartment map.
 *
 * @param {string} entryPackageLocation
 * @param {string} entryModuleSpecifier
 * @param {Graph} graph
 * @param {Set<string>} conditions - build conditions about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @param {SomePolicy} [policy]
 * @returns {CompartmentMapDescriptor}
 */
const translateGraph = (
  entryPackageLocation,
  entryModuleSpecifier,
  graph,
  conditions,
  policy,
) => {
  /** @type {Record<string, CompartmentDescriptor>} */
  const compartments = Object.create(null);

  // For each package, build a map of all the external modules the package can
  // import from other packages.
  // The keys of this map are the full specifiers of those modules from the
  // perspective of the importing package.
  // The values are records that name the exporting compartment and the full
  // specifier of the module from the exporting package.
  // The full map includes every exported module from every dependencey
  // package and is a complete list of every external module that the
  // corresponding compartment can import.
  for (const dependeeLocation of keys(graph).sort()) {
    const {
      name,
      path,
      label,
      dependencyLocations,
      internalAliases,
      parsers,
      types,
    } = graph[dependeeLocation];
    /** @type {Record<string, ModuleDescriptor>} */
    const moduleDescriptors = Object.create(null);
    /** @type {Record<string, ScopeDescriptor>} */
    const scopes = Object.create(null);

    /**
     * List of all the compartments (by name) that this compartment can import from.
     *
     * @type {Set<string>}
     */
    const compartmentNames = new Set();
    const packagePolicy = getPolicyForPackage(
      {
        isEntry: dependeeLocation === entryPackageLocation,
        name,
        path,
      },
      policy,
    );

    /* c8 ignore next */
    if (policy && !packagePolicy) {
      // this should never happen
      throw new TypeError('Unexpectedly falsy package policy');
    }

    /**
     * @param {string} dependencyName
     * @param {string} packageLocation
     */
    const digestExternalAliases = (dependencyName, packageLocation) => {
      const { externalAliases, explicitExports, name, path } =
        graph[packageLocation];
      for (const exportPath of keys(externalAliases).sort()) {
        const targetPath = externalAliases[exportPath];
        // dependency name may be different from package's name,
        // as in the case of browser field dependency replacements
        const localPath = join(dependencyName, exportPath);
        if (
          !policy ||
          (packagePolicy &&
            dependencyAllowedByPolicy(
              {
                name,
                path,
              },
              packagePolicy,
            ))
        ) {
          moduleDescriptors[localPath] = {
            compartment: packageLocation,
            module: targetPath,
          };
        }
      }
      // if the exports field is not present, then all modules must be accessible
      if (!explicitExports) {
        scopes[dependencyName] = {
          compartment: packageLocation,
        };
      }
    };
    // Support reflexive package aliases
    digestExternalAliases(name, dependeeLocation);
    // Support external package aliases
    for (const dependencyName of keys(dependencyLocations).sort()) {
      const dependencyLocation = dependencyLocations[dependencyName];
      digestExternalAliases(dependencyName, dependencyLocation);
      compartmentNames.add(dependencyLocation);
    }
    // digest own internal aliases
    for (const modulePath of keys(internalAliases).sort()) {
      const facetTarget = internalAliases[modulePath];
      const targetIsRelative =
        facetTarget.startsWith('./') || facetTarget === '.';
      if (targetIsRelative) {
        // add target to moduleDescriptors
        moduleDescriptors[modulePath] = {
          compartment: dependeeLocation,
          module: facetTarget,
        };
      }
    }

    compartments[dependeeLocation] = {
      label,
      name,
      path,
      location: dependeeLocation,
      modules: moduleDescriptors,
      scopes,
      parsers,
      types,
      policy: /** @type {SomePackagePolicy} */ (packagePolicy),
      compartments: compartmentNames,
    };
  }

  return {
    // TODO graceful migration from tags to conditions
    // https://github.com/endojs/endo/issues/2388
    tags: [...conditions],
    entry: {
      compartment: entryPackageLocation,
      module: entryModuleSpecifier,
    },
    compartments,
  };
};

/**
 * @param {Pick<MapNodeModulesOptions,
 *   'languageForExtension' |
 *   'moduleLanguageForExtension' |
 *   'commonjsLanguageForExtension' |
 *   'workspaceLanguageForExtension' |
 *   'workspaceModuleLanguageForExtension' |
 *   'workspaceCommonjsLanguageForExtension' |
 *   'languages'
 * >} options
 */
const makeLanguageOptions = ({
  languageForExtension: additionalLanguageForExtension = {},
  moduleLanguageForExtension: additionalModuleLanguageForExtension = {},
  commonjsLanguageForExtension: additionalCommonjsLanguageForExtension = {},
  workspaceLanguageForExtension: additionalWorkspaceLanguageForExtension = {},
  workspaceModuleLanguageForExtension:
    additionalWorkspaceModuleLanguageForExtension = {},
  workspaceCommonjsLanguageForExtension:
    additionalWorkspaceCommonjsLanguageForExtension = {},
  languages: additionalLanguages = [],
}) => {
  const commonjsLanguageForExtension = {
    ...defaultLanguageForExtension,
    ...additionalLanguageForExtension,
    ...defaultCommonjsLanguageForExtension,
    ...additionalCommonjsLanguageForExtension,
  };
  const moduleLanguageForExtension = {
    ...defaultLanguageForExtension,
    ...additionalLanguageForExtension,
    ...defaultModuleLanguageForExtension,
    ...additionalModuleLanguageForExtension,
  };
  const workspaceCommonjsLanguageForExtension = {
    ...defaultLanguageForExtension,
    ...additionalLanguageForExtension,
    ...defaultCommonjsLanguageForExtension,
    ...additionalCommonjsLanguageForExtension,
    ...additionalWorkspaceLanguageForExtension,
    ...additionalWorkspaceCommonjsLanguageForExtension,
  };
  const workspaceModuleLanguageForExtension = {
    ...defaultLanguageForExtension,
    ...additionalLanguageForExtension,
    ...defaultModuleLanguageForExtension,
    ...additionalModuleLanguageForExtension,
    ...additionalWorkspaceLanguageForExtension,
    ...additionalWorkspaceModuleLanguageForExtension,
  };

  const languages = new Set([
    ...Object.values(moduleLanguageForExtension),
    ...Object.values(commonjsLanguageForExtension),
    ...Object.values(workspaceModuleLanguageForExtension),
    ...Object.values(workspaceCommonjsLanguageForExtension),
    ...additionalLanguages,
  ]);

  return {
    languages,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
  };
};

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} packageLocation
 * @param {Set<string>} conditionsOption
 * @param {object} packageDescriptor
 * @param {string} moduleSpecifier
 * @param {CompartmentMapForNodeModulesOptions} [options]
 * @returns {Promise<CompartmentMapDescriptor>}
 */
export const compartmentMapForNodeModules = async (
  readPowers,
  packageLocation,
  conditionsOption,
  packageDescriptor,
  moduleSpecifier,
  options = {},
) => {
  const {
    dev = false,
    commonDependencies = {},
    policy,
    strict = false,
  } = options;
  const { maybeRead, canonical } = unpackReadPowers(readPowers);
  const languageOptions = makeLanguageOptions(options);

  const conditions = new Set(conditionsOption || []);

  // dev is only set for the entry package, and implied by the development
  // condition.
  // The dev option is deprecated in favor of using conditions, since that
  // covers more intentional behaviors of the development mode.

  const graph = await graphPackages(
    maybeRead,
    canonical,
    packageLocation,
    conditions,
    packageDescriptor,
    dev || (conditions && conditions.has('development')),
    commonDependencies,
    languageOptions,
    strict,
  );

  if (policy) {
    assertPolicy(policy);

    assert(
      graph[ATTENUATORS_COMPARTMENT] === undefined,
      `${q(ATTENUATORS_COMPARTMENT)} is a reserved compartment name`,
    );

    graph[ATTENUATORS_COMPARTMENT] = {
      ...graph[packageLocation],
      externalAliases: {},
      label: ATTENUATORS_COMPARTMENT,
      name: ATTENUATORS_COMPARTMENT,
    };
  }

  const compartmentMap = translateGraph(
    packageLocation,
    moduleSpecifier,
    graph,
    conditions,
    policy,
  );

  return compartmentMap;
};

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {MapNodeModulesOptions} [options]
 * @returns {Promise<CompartmentMapDescriptor>}
 */
export const mapNodeModules = async (
  readPowers,
  moduleLocation,
  options = {},
) => {
  const { tags = new Set(), conditions = tags, ...otherOptions } = options;

  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(readPowers, moduleLocation);

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );

  return compartmentMapForNodeModules(
    readPowers,
    packageLocation,
    conditions,
    packageDescriptor,
    moduleSpecifier,
    otherOptions,
  );
};
