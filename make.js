const b = require('substance-bundler')
const path = require('path')

const DIST = 'dist/'

b.task('default', ['lib:browser'])

b.task('clean', () => {
  b.rm('tmp')
  b.rm('dist')
})

b.task('lib:browser', () => {
  b.js('index.js', {
    output: [{
      file: DIST + 'stencila-engine.js',
      format: 'umd',
      name: 'stencilaEngine',
      globals: { 'stencila-js': 'stencilaJs' }
    }],
    external: ['stencila-js'],
    commonjs: {
      namedExports: { 'acorn/dist/walk.js': [ 'simple', 'base' ] }
    },
    alias: {
      'stencila-js/src/types.js': require.resolve('stencila-js/src/types.js')
    },
    json: true
  })
})

b.task('lib:node', () => {
  b.js('index.js', {
    output: [{
      file: DIST + 'stencila-engine.cjs.js',
      format: 'cjs'
    }],
    external: ['stencila-js'],
    commonjs: {
      namedExports: { 'acorn/dist/walk.js': [ 'simple', 'base' ] }
    },
    json: true
  })
})

b.task('test:browser', ['lib:browser'], () => {
  const INDEX_JS = path.join(__dirname, 'index.js')
  let globals = {
    'tape': 'substanceTest.test',
    'stencila-libcore': 'stencilaLibcore',
    'stencila-mini': 'stencilaMini',
    'stencila-js': 'stencilaJs',
    'substance': 'substance',
    'substance-test': 'substanceTest'
  }
  globals[INDEX_JS] = 'stencilaEngine'
  b.js('test/**/*.test.js', {
    output: [{
      file: 'tmp/tests.js',
      format: 'umd',
      name: 'stencilaEngineTests',
      globals
    }],
    external: [
      'tape', 'stencila-libcore', 'stencila-mini', 'stencila-js',
      'substance', 'substance-test', INDEX_JS
    ],
    commonjs: {
      namedExports: { 'acorn/dist/walk.js': [ 'simple', 'base' ] }
    },
    alias: {
      'stencila-js/src/types.js': require.resolve('stencila-js/src/types.js')
    },
    json: true
  })
})
