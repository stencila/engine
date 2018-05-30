import test from 'tape'
import { map } from 'substance'
import { JavascriptContext } from 'stencila-js'
import MiniContext from '../src/MiniContext'
import setupHost from '../src/setupHost'
import { libtest } from './libtest'
import { testAsync } from './testHelpers'

test('MiniContext: compile(x=5)', t => {
  let mini = new MiniContext()
  let code = 'x=5'
  let actual = mini._compile({ code })
  let expected = {
    inputs: [],
    outputs: [{ name: 'x' }],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

test('MiniContext: compile(foo(x,y,z))', t => {
  let mini = new MiniContext()
  let code = 'foo(x,y,z)'
  let actual = mini._compile({ code })
  let expected = {
    inputs: [{name: 'x'}, {name: 'y'}, {name: 'z'}, {name: 'foo'}],
    outputs: [],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

testAsync('MiniContext: execute(x=5)', async t => {
  let mini = new MiniContext()
  let code = 'x=5'
  let cell = mini._compile({ code })
  let actual = await mini.execute(cell)
  let expected = {
    inputs: [],
    outputs: [{name: 'x', value: {type: 'number', data: 5}}],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

testAsync('MiniContext: execute(1+2+3)', async t => {
  let { mini } = await _setupHost()
  let code = '1+2+3'
  let cell = mini._compile({ code })
  _provideLibFunction(cell, 'add')
  let actual = await mini.execute(cell)
  let expected = {
    outputs: [{value: {type: 'number', data: 6}}],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

testAsync('MiniContext: execute(noParams())', async t => {
  let { mini } = await _setupHost()
  let code = 'noParams()'
  let cell = mini._compile({ code })
  _provideLibFunction(cell, 'noParams')
  let actual = await mini.execute(cell)
  let expected = {
    outputs: [{value: {type: 'number', data: 5}}],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

testAsync('MiniContext: execute(noParams() + 1)', async t => {
  let { mini } = await _setupHost()
  let code = 'noParams() + 1'
  let cell = mini._compile({ code })
  _provideLibFunction(cell, 'noParams')
  _provideLibFunction(cell, 'add')
  let actual = await mini.execute(cell)
  let expected = {
    outputs: [{value: {type: 'number', data: 6}}],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

testAsync('MiniContext: execute(oneParam(2))', async t => {
  let { mini } = await _setupHost()
  let code = 'oneParam(2)'
  let cell = mini._compile({ code })
  _provideLibFunction(cell, 'oneParam')
  let actual = await mini.execute(cell)
  let expected = {
    outputs: [{value: {type: 'number', data: 2.2}}],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

testAsync('MiniContext: execute(oneParamWithDefault("Howdy!"))', async t => {
  let { mini } = await _setupHost()
  let code = 'oneParamWithDefault("Howdy!")'
  let cell = mini._compile({ code })
  _provideLibFunction(cell, 'oneParamWithDefault')
  let actual = await mini.execute(cell)
  let expected = {
    outputs: [{value: {type: 'string', data: 'Howdy!'}}],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

testAsync('MiniContext: execute(oneParamWithDefault())', async t => {
  let { mini } = await _setupHost()
  let code = 'oneParamWithDefault()'
  let cell = mini._compile({ code })
  _provideLibFunction(cell, 'oneParamWithDefault')
  let actual = await mini.execute(cell)
  let expected = {
    outputs: [{value: {type: 'string', data: 'Hello!'}}],
    messages: []
  }
  _isFulfilled(t, actual, expected)
  t.end()
})

async function _setupHost () {
  let host = await setupHost({
    contexts: [
      { id: 'mini', lang: 'mini', client: MiniContext },
      { id: 'js', lang: 'js', client: JavascriptContext }
    ],
    libraries: [{
      lang: 'js',
      lib: libtest
    }]
  })
  let mini = host.getContext('mini')
  let js = host.getContext('js')
  return { host, mini, js }
}

function _isFulfilled (t, cell, expected) {
  let actual = {}
  Object.keys(expected).forEach(n => {
    switch (n) {
      case 'inputs': {
        actual[n] = map(cell[n])
        break
      }
      default:
        actual[n] = cell[n]
    }
  })
  t.deepEqual(actual, expected)
}

function _setInput (cell, name, data) {
  let input = cell.inputs.get(name)
  Object.assign(input, data)
}

function _provideLibFunction (cell, name) {
  // EXPERIMENTAL: trying a
  _setInput(cell, name, {
    value: {
      type: 'function',
      data: {
        name: name,
        context: 'js',
        library: 'test'
      }
    }
  })
}
