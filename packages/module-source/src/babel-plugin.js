/* eslint max-lines: 0 */

import * as h from './hidden.js';

/*
 * Collects all of the identifiers on the left-hand-side of an exported
 * assignment expression, deeply exploring complex destructuring assignment.
 * In an export assignment, every one of these identifiers is an exported name.
 *
 * ```
 * export const pattern = ...;
 * export let pattern = ...;
 * export var pattern = ...;
 * ```
 */
const collectPatternIdentifiers = (path, pattern) => {
  switch (pattern.type) {
    case 'Identifier':
      return [pattern];
    case 'RestElement':
      return collectPatternIdentifiers(path, pattern.argument);
    case 'ObjectProperty':
      return collectPatternIdentifiers(path, pattern.value);
    case 'ObjectPattern':
      return pattern.properties.flatMap(prop =>
        collectPatternIdentifiers(path, prop),
      );
    case 'ArrayPattern':
      return pattern.elements.flatMap(pat => {
        if (pat === null) return [];
        // Non-elided pattern.
        return collectPatternIdentifiers(path, pat);
      });
    case 'AssignmentPattern':
      return collectPatternIdentifiers(path, pattern.left);
    default:
      throw path.buildCodeFrameError(
        `Pattern type ${pattern.type} is not recognized`,
      );
  }
};

function makeModulePlugins(options) {
  const {
    sourceType,
    exportAlls,
    fixedExportMap,
    imports,
    importDecls,
    importSources,
    reexportMap,
    liveExportMap,
    importMeta,
    dynamicImport,
  } = options;

  if (sourceType !== 'module') {
    throw Error(`Module sourceType must be 'module'`);
  }

  const updaterSources = Object.create(null);
  /**
   * Indicates that a name is declared at the top level and is never
   * reassigned.
   * All of these declarations are discovered in the analysis pass by visiting
   * every function, class, and declaration.
   *
   * @type {Record<string, boolean>}
   */
  const topLevelIsOnce = Object.create(null);
  /**
   * Indicates that a local name is declared at the top level and exported, and
   * lists all of the corresponding exported names that should be updated if it
   * changes.
   * All of these declarations are discovered in the analysis pass by visiting
   * every export declaration.
   *
   * @type {Record<string, Array<string>>}
   */
  const topLevelExported = Object.create(null);

  const rewriteModules =
    pass =>
    ({ types: t }) => {
      const replace = (
        src,
        node = t.expressionStatement(t.identifier('null')),
      ) => {
        node.loc = src.loc;
        node.comments = [...(src.leadingComments || [])];
        t.inheritsComments(node, src);
        return node;
      };

      const allowedHiddens = new WeakSet();
      const rewrittenDecls = new WeakSet();
      const hiddenIdentifier = hi => {
        const ident = t.identifier(hi);
        allowedHiddens.add(ident);
        return ident;
      };
      const hOnceId = hiddenIdentifier(h.HIDDEN_ONCE);
      const hLiveId = hiddenIdentifier(h.HIDDEN_LIVE);
      const soften = id => {
        // Remap the name to $c_name.
        const { name } = id;
        id.name = `${h.HIDDEN_CONST_VAR_PREFIX}${name}`;
        allowedHiddens.add(id);
      };

      /**
       * Adds an exported name to the module static record private metadata,
       * indicating that it is updated live as opposted to a constant
       * or variable that is only initialized once and never reassigned.
       *
       * Any top-level exported `function`, `let`, or `var` declaration is a
       * "live" binding unless it's initialized and never reassigned anywhere
       * in the module.
       * As are any other top-level exported `var` declarations because they
       * require hoisting.
       *
       * This method gets called in the transform phase.
       * The returned hidden variable name may be used to transform
       * a declaration, particularly for an export class statement.
       *
       * @param {string} name - the local name of the exported variable.
       */
      const markLiveExport = name => {
        for (const importTo of topLevelExported[name]) {
          liveExportMap[importTo] = [name, true];
        }
        return hLiveId;
      };

      /**
       * Adds an exported name to the module static record private metadata,
       * indicating that it is updated fixed, either because it is a constant
       * or because it is initialized and never reassigned.
       *
       * This method gets called in the transform phase.
       * The returned hidden variable name may be used to transform
       * a declaration, particularly for an export class statement.
       *
       * @param {string} name - the local name of the exported variable.
       */
      const markFixedExport = name => {
        for (const importTo of topLevelExported[name]) {
          fixedExportMap[importTo] = [name];
        }
        return hOnceId;
      };

      /**
       * Adds an exported name to the module static record private metadata,
       * indicating whether it is fixed or live depending on whether
       * there are any assignments to the bound variable except for
       * its declaration.
       *
       * This function gets called in the cases where whether the export is
       * live or fixed depends only on whether the export gets assigned
       * anywhere outside its declaration: exported function declarations and
       * exported variables initialized to function declarations.
       *
       * This method gets called in the transform phase.
       * The returned hidden variable name may be used to transform
       * a declaration, particularly for an export class statement.
       *
       * @param {string} name - the local name of the exported variable.
       */
      const markExport = name => {
        if (topLevelIsOnce[name]) {
          return markFixedExport(name);
        } else {
          return markLiveExport(name);
        }
      };

      const rewriteVars = (vids, isConst, needsHoisting) => {
        const replacements = [];
        for (const id of vids) {
          const { name } = id;
          if (!isConst && !topLevelIsOnce[name]) {
            if (topLevelExported[name]) {
              // Just add $h_live.name($c_name);
              soften(id);
              replacements.push(
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(hLiveId, t.identifier(name)),
                    [t.identifier(id.name)],
                  ),
                ),
              );
              markLiveExport(name);
            }
          } else if (topLevelExported[name]) {
            if (needsHoisting) {
              // Hoist the declaration and soften.
              if (needsHoisting === 'function') {
                if (!topLevelIsOnce[name]) {
                  soften(id);
                }
                options.hoistedDecls.push([
                  name,
                  topLevelIsOnce[name],
                  id.name,
                ]);
                markExport(name);
              } else {
                // Rewrite to be just name = value.
                soften(id);
                options.hoistedDecls.push([name]);
                replacements.push(
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      t.identifier(name),
                      t.identifier(id.name),
                    ),
                  ),
                );
                markLiveExport(name);
              }
            } else {
              // Just add $h_once.name(name);
              replacements.push(
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(hOnceId, t.identifier(id.name)),
                    [t.identifier(id.name)],
                  ),
                ),
              );
              markFixedExport(name);
            }
          }
        }
        return replacements;
      };

      const rewriteExportDeclaration = path => {
        // Find all the declared identifiers.
        if (rewrittenDecls.has(path.node)) {
          return;
        }
        const decl = path.node;
        const declarations = decl.declarations || [decl];
        const vids = declarations.flatMap(({ id }) =>
          collectPatternIdentifiers(path, id),
        );

        // Create the export calls.
        const isConst = decl.kind === 'const';
        const additions = rewriteVars(
          vids,
          isConst,
          decl.type === 'FunctionDeclaration'
            ? 'function'
            : !isConst && decl.kind !== 'let',
        );

        if (additions.length > 0) {
          if (decl.type === 'VariableDeclaration') {
            rewrittenDecls.add(decl);
          }
          path.insertAfter(additions);
        }
      };

      const visitor = {
        Identifier(path) {
          if (options.allowHidden || allowedHiddens.has(path.node)) {
            return;
          }
          // Ensure the parse doesn't already include our required hidden identifiers.
          // console.log(`have identifier`, path.node);
          const i = h.HIDDEN_IDENTIFIERS.indexOf(path.node.name);
          if (i >= 0) {
            throw path.buildCodeFrameError(
              `The ${h.HIDDEN_IDENTIFIERS[i]} identifier is reserved`,
            );
          }
          if (path.node.name.startsWith(h.HIDDEN_CONST_VAR_PREFIX)) {
            throw path.buildCodeFrameError(
              `The ${path.node.name} constant variable is reserved`,
            );
          }
        },
        CallExpression(path) {
          // import(FOO) -> $h_import(FOO)
          if (path.node.callee.type === 'Import') {
            dynamicImport.present = true;
            path.node.callee = hiddenIdentifier(h.HIDDEN_IMPORT);
          }
        },
      };

      const importMetaVisitor = {
        MetaProperty(path) {
          if (
            path.node.meta &&
            path.node.meta.name === 'import' &&
            path.node.property.name === 'meta'
          ) {
            importMeta.present = true;
            path.replaceWithMultiple([
              replace(path.node, hiddenIdentifier(h.HIDDEN_META)),
            ]);
          }
        },
      };

      const moduleVisitor = (doAnalyze, doTransform) => ({
        // We handle all the import and export productions.
        ImportDeclaration(path) {
          if (doAnalyze) {
            const specs = path.node.specifiers;
            const specifier = path.node.source.value;
            let myImportSources = importSources[specifier];
            if (!myImportSources) {
              myImportSources = Object.create(null);
              importSources[specifier] = myImportSources;
            }
            /** @type {Array} */
            let myImports = imports[specifier];
            if (!myImports) {
              myImports = [];
              imports[specifier] = myImports;
            }
            if (!specs) {
              return;
            }
            for (const spec of specs) {
              const importTo = spec.local.name;
              importDecls.push(importTo);
              let importFrom;
              switch (spec.type) {
                // import importTo from 'module';
                case 'ImportDefaultSpecifier':
                  importFrom = 'default';
                  break;
                // import * as importTo from 'module';
                case 'ImportNamespaceSpecifier':
                  importFrom = '*';
                  break;
                // import { importFrom as importTo } from 'module';
                case 'ImportSpecifier':
                  importFrom = spec.imported.name;
                  break;
                default:
                  throw path.buildCodeFrameError(
                    `Unrecognized import specifier type ${spec.type}`,
                  );
              }
              if (myImports && myImports.indexOf(importFrom) < 0) {
                myImports.push(importFrom);
              }

              if (myImportSources) {
                let myUpdaterSources = myImportSources[importFrom];
                if (!myUpdaterSources) {
                  myUpdaterSources = [];
                  myImportSources[importFrom] = myUpdaterSources;
                }

                myUpdaterSources.push(
                  `${h.HIDDEN_A} => (${importTo} = ${h.HIDDEN_A})`,
                );
                updaterSources[importTo] = myUpdaterSources;
              }
            }
          }
          if (doTransform) {
            // Nullify the import declaration.
            path.replaceWithMultiple([]);
          }
        },
        ExportDefaultDeclaration(path) {
          // export default FOO -> $h_once.default(FOO)
          if (doAnalyze) {
            fixedExportMap.default = ['default'];
          }
          if (doTransform) {
            const id = t.identifier('default');
            const cid = t.identifier('default');
            soften(cid);
            const callee = t.memberExpression(
              hiddenIdentifier(h.HIDDEN_ONCE),
              id,
            );
            let expr = path.node.declaration;
            const decl = path.node.declaration;
            if (expr.type === 'ClassDeclaration') {
              expr = t.classExpression(expr.id, expr.superClass, expr.body);
            } else if (expr.type === 'FunctionDeclaration') {
              expr = t.functionExpression(
                expr.id,
                expr.params,
                expr.body,
                expr.generator,
                expr.async,
              );
            }

            if (decl.id) {
              // Just keep the same declaration and mark it as the default.
              path.replaceWithMultiple([
                replace(path.node, decl),
                t.expressionStatement(t.callExpression(callee, [decl.id])),
              ]);
              return;
            }

            // const {default: $c_default} = {default: (XXX)}; $h_once.default($c_default);
            path.replaceWithMultiple([
              replace(
                path.node,
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.objectPattern([t.objectProperty(id, cid)]),
                    t.objectExpression([t.objectProperty(id, expr)]),
                  ),
                ]),
              ),
              t.expressionStatement(t.callExpression(callee, [cid])),
            ]);
          }
        },
        ClassDeclaration(path) {
          const ptype = path.parent.type;
          if (ptype !== 'Program' && ptype !== 'ExportNamedDeclaration') {
            return;
          }

          const { name } = path.node.id;
          if (doAnalyze) {
            topLevelIsOnce[name] = path.scope.getBinding(name).constant;
          }
          if (doTransform) {
            if (topLevelExported[name]) {
              const callee = t.memberExpression(markExport(name), path.node.id);
              path.replaceWithMultiple([
                path.node,
                t.expressionStatement(t.callExpression(callee, [path.node.id])),
              ]);
            }
          }
        },
        FunctionDeclaration(path) {
          const ptype = path.parent.type;
          if (ptype !== 'Program' && ptype !== 'ExportNamedDeclaration') {
            return;
          }

          const { name } = path.node.id;
          if (doAnalyze) {
            topLevelIsOnce[name] = path.scope.getBinding(name).constant;
            // console.error('have function', name, 'is', topLevelIsOnce[name]);
          }
          if (doTransform) {
            if (topLevelExported[name]) {
              rewriteExportDeclaration(path);
              markExport(name);
            }
          }
        },
        VariableDeclaration(path) {
          const ptype = path.parent.type;
          if (ptype !== 'Program' && ptype !== 'ExportNamedDeclaration') {
            return;
          }

          // We may need to rewrite this topLevelDecl later.
          const vids = path.node.declarations.flatMap(({ id }) =>
            collectPatternIdentifiers(path, id),
          );
          if (doAnalyze) {
            for (const { name } of vids) {
              topLevelIsOnce[name] = path.scope.getBinding(name).constant;
            }
          }
          if (doTransform) {
            for (const { name } of vids) {
              if (topLevelExported[name]) {
                rewriteExportDeclaration(path);
                break;
              }
            }
          }
        },
        ExportAllDeclaration(path) {
          const { source } = path.node;
          if (doAnalyze) {
            const specifier = source.value;
            let myImportSources = importSources[specifier];
            if (!myImportSources) {
              myImportSources = Object.create(null);
              importSources[specifier] = myImportSources;
            }
            let myImports = imports[specifier];
            if (!myImports) {
              // Ensure that the specifier is imported.
              myImports = [];
              imports[specifier] = myImports;
            }
            exportAlls.push(specifier);
          }
          if (doTransform) {
            path.replaceWithMultiple([]);
          }
        },
        ExportNamedDeclaration(path) {
          const { declaration: decl, specifiers: specs, source } = path.node;

          if (doAnalyze) {
            let myImportSources;
            let myImports;
            if (source) {
              const specifier = source.value;
              myImportSources = importSources[specifier];
              if (!myImportSources) {
                myImportSources = Object.create(null);
                importSources[specifier] = myImportSources;
              }
              myImports = imports[specifier];
              if (!myImports) {
                myImports = [];
                imports[specifier] = myImports;
              }
            }

            if (decl) {
              const declarations = decl.declarations || [decl];
              const vids = declarations.flatMap(({ id }) =>
                collectPatternIdentifiers(path, id),
              );
              for (const { name } of vids) {
                let tle = topLevelExported[name];
                if (!tle) {
                  tle = [];
                  topLevelExported[name] = tle;
                }
                tle.push(name);
              }
            }

            for (const spec of specs) {
              const { local, exported } = spec;
              const importFrom =
                spec.type === 'ExportNamespaceSpecifier' ? '*' : local.name;
              let myUpdaterSources;
              // If local.name is reexported we omit it.
              const importTo = exported.name;

              if (source) {
                // If source is defined, it's a reexport from a different module.
                // In this case we want to collect the local and reexported name
                // If there's no `as newName`, the ExportNamedDeclaration will have the `exported` field anyway,
                // representing the same identifier as `local`

                if (!reexportMap[source.value]) {
                  reexportMap[source.value] = [];
                }
                reexportMap[source.value].push([local.name, exported.name]);
                // Don't populate importSources here, so the live binding won't get
                // generated by the transform
              } else {
                myUpdaterSources = updaterSources[importFrom];
                if (myImportSources) {
                  myUpdaterSources = myImportSources[importFrom];
                  if (!myUpdaterSources) {
                    myUpdaterSources = [];
                    myImportSources[importFrom] = myUpdaterSources;
                  }
                  updaterSources[importTo] = myUpdaterSources;
                  myImports.push(importFrom);
                }
              }

              if (myUpdaterSources) {
                // If there are updaters, we must have a local
                // name, so update it with this export.
                const ident = topLevelIsOnce[importFrom]
                  ? h.HIDDEN_ONCE
                  : h.HIDDEN_LIVE;
                myUpdaterSources.push(
                  `${ident}[${JSON.stringify(importFrom)}]`,
                );

                liveExportMap[importTo] = [importFrom, false];
              }

              if (!(source || myUpdaterSources)) {
                let tle = topLevelExported[importFrom];
                if (!tle) {
                  tle = [];
                  topLevelExported[importFrom] = tle;
                }
                tle.push(importTo);
              }
            }
          }
          if (doTransform) {
            path.replaceWithMultiple(decl ? [replace(path.node, decl)] : []);
          }
        },
      });

      // Add the module visitor.
      switch (pass) {
        case 0:
          return {
            visitor: {
              ...visitor,
              ...moduleVisitor(true, false),
            },
          };
        case 1:
          return {
            visitor: {
              ...moduleVisitor(false, true),
              ...importMetaVisitor,
            },
          };
        default:
          throw TypeError(`Unrecognized module pass ${pass}`);
      }
    };

  return {
    analyzePlugin: rewriteModules(0),
    transformPlugin: rewriteModules(1),
  };
}

export default makeModulePlugins;
