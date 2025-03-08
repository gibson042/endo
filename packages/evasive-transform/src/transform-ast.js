/**
 * Provides {@link transformAst}
 *
 * @module
 */

import babelTraverse from '@babel/traverse';
import { evadeComment, elideComment } from './transform-comment.js';

// TODO The following is sufficient on Node.js, but for compatibility with
// `node -r esm`, we must use the pattern below.
// Restore after https://github.com/Agoric/agoric-sdk/issues/8671.
// OR, upgrading to Babel 8 probably addresses this defect.
// const { default: traverse } = /** @type {any} */ (babelTraverse);
const traverse = /** @type {typeof import('@babel/traverse')['default']} */ (
  babelTraverse.default || babelTraverse
);

/**
 * Options for {@link transformAst}
 *
 * @internal
 * @typedef {TransformAstOptionsWithoutSourceMap} TransformAstOptions
 */

/**
 * Options for {@link transformAst}
 *
 * @internal
 * @typedef TransformAstOptionsWithoutSourceMap
 * @property {boolean} [elideComments]
 */

/**
 * Performs transformations on the given AST
 *
 * This function mutates `ast`.
 *
 * @internal
 * @param {import('@babel/types').File} ast - AST, as generated by Babel
 * @param {TransformAstOptions} [opts]
 * @returns {void}
 */
export function transformAst(ast, { elideComments = false } = {}) {
  const transformComment = elideComments ? elideComment : evadeComment;
  traverse(ast, {
    enter(p) {
      const { leadingComments, innerComments, trailingComments, type } = p.node;
      // discriminated union
      if ('comments' in p.node) {
        (p.node.comments || []).forEach(node => transformComment(node));
      }
      // Rewrite all comments.
      (leadingComments || []).forEach(node => transformComment(node));
      // XXX: there is no such Node having type matching /^Comment.+/ in
      // @babel/types
      if (type.startsWith('Comment')) {
        // @ts-expect-error - see above XXX
        transformComment(p.node);
      }
      (innerComments || []).forEach(node => transformComment(node));
      (trailingComments || []).forEach(node => transformComment(node));
    },
  });
}
