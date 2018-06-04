const b = require('substance-bundler')

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
      globals: { 'stencila-js': 'window.stencilaJs' }
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

b.task('test:browser', () => {
  let globals = {
    'tape': 'substanceTest.test',
    'stencila-libcore': 'stencilaLibcore',
    'stencila-mini': 'stencilaMini',
    'stencila-js': 'stencilaJs',
    'substance': 'window.substance',
    'substance-test': 'substanceTest'
  }
  b.js('test/**/*.test.js', {
    output: [{
      file: 'tmp/tests.js',
      format: 'umd',
      name: 'tests',
      globals
    }],
    external: ['tape', 'stencila-libcore', 'stencila-mini', 'stencila-js', 'substance', 'substance-test'],
    commonjs: {
      namedExports: { 'acorn/dist/walk.js': [ 'simple', 'base' ] }
    },
    alias: {
      'stencila-js/src/types.js': require.resolve('stencila-js/src/types.js')
    },
    json: true
  })
})
