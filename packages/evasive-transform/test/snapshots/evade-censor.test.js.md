# Snapshot report for `test/evade-censor.test.js`

The actual snapshot is saved in `evade-censor.test.js.snap`.

Generated by [AVA](https://avajs.dev).

## evadeCensor() - successful source transform

> Snapshot 1

    '\'use strict\';var node_fs = require(\'node:fs\');/** * @returns {IMPORT(\'node:fs\').constants.F_OK} */function bambalam() {  return node_fs.constants.F_OK;}/** * <!=- this should become less evil -=> */function monkey() {  return true;}exports.bambalam = bambalam;exports.monkey = monkey;/*# sourceMappingURL=index.cjs.map*//* @ts-ignore*/return;'

## evadeCensor() - successful source transform w/ source map

> Snapshot 1

    '\'use strict\';var node_fs = require(\'node:fs\');/** * @returns {IMPORT(\'node:fs\').constants.F_OK} */function bambalam() {  return node_fs.constants.F_OK;}/** * <!=- this should become less evil -=> */function monkey() {  return true;}exports.bambalam = bambalam;exports.monkey = monkey;/*# sourceMappingURL=index.cjs.map*//* @ts-ignore*/return;'

## evadeCensor() - successful source transform w/ source map & source URL

> Snapshot 1

    '\'use strict\';var node_fs = require(\'node:fs\');/** * @returns {IMPORT(\'node:fs\').constants.F_OK} */function bambalam() {  return node_fs.constants.F_OK;}/** * <!=- this should become less evil -=> */function monkey() {  return true;}exports.bambalam = bambalam;exports.monkey = monkey;/*# sourceMappingURL=index.cjs.map*//* @ts-ignore*/return;'

> Snapshot 2

    {
      file: undefined,
      ignoreList: [],
      mappings: ';;;;AAEA;AACA;AACA;AACO,SAASA,QAAQA,CAAA,EAAG;AAAA,EACzB,OAAOC,OAAA,CAAAC,SAAS,CAACC,IAAI;AAAC;;ACJxB;AACA;AACA;AACO,SAASC,MAAMA,CAAA,EAAG;AAAA,EACvB,OAAO,IAAI;AAAC',
      names: [
        'bambalam',
        'node_fs',
        'constants',
        'F_OK',
        'monkey',
      ],
      sourceRoot: undefined,
      sources: [
        '../src/not-index.js',
        '../src/index.js',
      ],
      sourcesContent: [
        `import { constants } from 'node:fs';␊
        ␊
        /**␊
         * @returns {import('node:fs').constants.F_OK}␊
         */␊
        export function bambalam() {␊
          return constants.F_OK;␊
        }␊
        `,
        `export * from './not-index.js';␊
        ␊
        /**␊
         * <!-- this should become less evil -->␊
         */␊
        export function monkey() {␊
          return true;␊
        }␊
        `,
      ],
      version: 3,
    }

## evadeCensor() - successful source transform w/ source URL

> Snapshot 1

    '\'use strict\';var node_fs = require(\'node:fs\');/** * @returns {IMPORT(\'node:fs\').constants.F_OK} */function bambalam() {  return node_fs.constants.F_OK;}/** * <!=- this should become less evil -=> */function monkey() {  return true;}exports.bambalam = bambalam;exports.monkey = monkey;/*# sourceMappingURL=index.cjs.map*//* @ts-ignore*/return;'

> Snapshot 2

    {
      file: undefined,
      ignoreList: [],
      mappings: 'AAAA,YAAY;;AAEZ,IAAIA,OAAO,GAAGC,OAAO,CAAC,SAAS,CAAC;;AAEhC;AACA;AACA;AACA,SAASC,QAAQA,CAAA,EAAG;AAAA,EAClB,OAAOF,OAAO,CAACG,SAAS,CAACC,IAAI;AAAC;;AAGhC;AACA;AACA;AACA,SAASC,MAAMA,CAAA,EAAG;AAAA,EAChB,OAAO,IAAI;AAAC;;AAGdC,OAAO,CAACJ,QAAQ,GAAGA,QAAQ;AAC3BI,OAAO,CAACD,MAAM,GAAGA,MAAM;AACvB;;AAEA;AACA',
      names: [
        'node_fs',
        'require',
        'bambalam',
        'constants',
        'F_OK',
        'monkey',
        'exports',
      ],
      sourceRoot: undefined,
      sources: [
        'index.cjs',
      ],
      sourcesContent: [
        `'use strict';␊
        ␊
        var node_fs = require('node:fs');␊
        ␊
        /**␊
         * @returns {import('node:fs').constants.F_OK}␊
         */␊
        function bambalam() {␊
          return node_fs.constants.F_OK;␊
        }␊
        ␊
        /**␊
         * <!-- this should become less evil -->␊
         */␊
        function monkey() {␊
          return true;␊
        }␊
        ␊
        exports.bambalam = bambalam;␊
        exports.monkey = monkey;␊
        //# sourceMappingURL=index.cjs.map␊
        ␊
        // @ts-ignore␊
        return;␊
        `,
      ],
      version: 3,
    }

## evadeCensor() - successful source transform w/ source map & unmapping

> Snapshot 1

    '\'use strict\';var node_fs = require(\'node:fs\');/** * @returns {IMPORT(\'node:fs\').constants.F_OK} */function bambalam() {  return node_fs.constants.F_OK;}/** * <!=- this should become less evil -=> */function monkey() {  return true;}exports.bambalam = bambalam;exports.monkey = monkey;/*# sourceMappingURL=index.cjs.map*//* @ts-ignore*/return;'

## evadeCensor() - successful source transform w/ source map, source URL & unmapping

> Snapshot 1

    '\'use strict\';var node_fs = require(\'node:fs\');/** * @returns {IMPORT(\'node:fs\').constants.F_OK} */function bambalam() {  return node_fs.constants.F_OK;}/** * <!=- this should become less evil -=> */function monkey() {  return true;}exports.bambalam = bambalam;exports.monkey = monkey;/*# sourceMappingURL=index.cjs.map*//* @ts-ignore*/return;'

> Snapshot 2

    {
      file: undefined,
      ignoreList: [],
      mappings: ';;;;AAEA;AACA;AACA;AACO,SAASA,QAAQA,CAAA,EAAG;AAAA,EACzB,OAAOC,OAAA,CAAAC,SAAS,CAACC,IAAI;AAAC;;ACJxB;AACA;AACA;AACO,SAASC,MAAMA,CAAA,EAAG;AAAA,EACvB,OAAO,IAAI;AAAC',
      names: [
        'bambalam',
        'node_fs',
        'constants',
        'F_OK',
        'monkey',
      ],
      sourceRoot: undefined,
      sources: [
        '../src/not-index.js',
        '../src/index.js',
      ],
      sourcesContent: [
        `import { constants } from 'node:fs';␊
        ␊
        /**␊
         * @returns {import('node:fs').constants.F_OK}␊
         */␊
        export function bambalam() {␊
          return constants.F_OK;␊
        }␊
        `,
        `export * from './not-index.js';␊
        ␊
        /**␊
         * <!-- this should become less evil -->␊
         */␊
        export function monkey() {␊
          return true;␊
        }␊
        `,
      ],
      version: 3,
    }
