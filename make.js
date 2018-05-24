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
      file: DIST + 'engine.js',
      format: 'umd',
      name: 'stencilaEngine'
    }],
    commonjs: {
      namedExports: { 'acorn/dist/walk.js': [ 'simple', 'base' ] }
    },
    json: true
  })
})

b.task('test:browser', () => {
  b.js('tests/**/*.test.js', {
    output: [{
      file: 'tmp/tests.js',
      format: 'umd',
      name: 'tests',
      globals: {
        'tape': 'substanceTest.test',
        'stencila-mini': 'window.stencilaMini',
        'stencila-libcore': 'window.stencilaLibcore'
      }
    }],
    external: ['tape', 'stencila-mini', 'stencila-libcore'],
    commonjs: {
      namedExports: { 'acorn/dist/walk.js': [ 'simple', 'base' ] }
    },
    json: true
  })
})
