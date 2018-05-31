const b = require('substance-bundler')

const DIST = 'dist/'

b.task('default', ['lib:browser'])

b.task('clean', () => {
  b.rm('tmp')
  b.rm('dist')
})

b.task('lib:browser', () => {
  b.js('index.es.js', {
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
  b.js('index.es.js', {
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
  b.js('test/**/*.test.js', {
    output: [{
      file: 'tmp/tests.js',
      format: 'umd',
      name: 'tests',
      globals: {
        'tape': 'substanceTest.test',
        'stencila-mini': 'window.stencilaMini',
        'stencila-js': 'window.stencilaJs',
        'stencila-libcore': 'window.stencilaLibcore'
      }
    }],
    external: ['tape', 'stencila-mini', 'stencila-js', 'stencila-libcore'],
    commonjs: {
      namedExports: { 'acorn/dist/walk.js': [ 'simple', 'base' ] }
    },
    alias: {
      'stencila-js/src/types.js': require.resolve('stencila-js/src/types.js')
    },
    json: true
  })
})
