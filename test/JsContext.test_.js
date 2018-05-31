import JsContext from '../../src/contexts/JsContext'

import test from 'tape'

test('JsContext.executeCode no value', t => {
  let c = new JsContext()
  t.plan(2)

  c._executeCode('\n').then(result => {
    t.deepEqual(result.value, null, 'nothing returned when empty')
  })

  c._executeCode('if(true){\n  let x = 4\n}\n').then(result => {
    t.deepEqual(result, {
      inputs: [],
      output: null,
      value: null,
      messages: [],
      streams: null
    })
  })
})

test('JsContext.executeCode with no inputs, no output, no errors', t => {
  let c = new JsContext()
  t.plan(3)

  c._executeCode('1.1 * 2').then(result => {
    t.deepEqual(result, {
      inputs: [],
      output: null,
      value: { type: 'number', data: 2.2 },
      messages: [],
      streams: null
    })
  })

  c._executeCode('let x = 3\nMath.sqrt(x*3)').then(result => {
    t.deepEqual(result, {
      inputs: [],
      output: null,
      value: { type: 'integer', data: 3 },
      messages: [],
      streams: null
    })
  })

  c._executeCode('// Multiple lines and comments\nlet x = {}\nObject.assign(x, {a:1})\n').then(result => {
    t.deepEqual(result, {
      inputs: [],
      output: null,
      value: { type: 'object', data: { a: 1 } },
      messages: [],
      streams: null
    })
  })
})

test('JsContext.executeCode with inputs, outputs, no errors', t => {
  let c = new JsContext()
  t.plan(2)

  c._executeCode('let b = a*6', {
    a: {type: 'integer', data: 6}
  }).then(result => {
    t.deepEqual(result, {
      inputs: ['a'],
      output: 'b',
      value: { type: 'integer', data: 36 },
      messages: [],
      streams: null
    })
  })

  c._executeCode('let c = a*b[1]\nc', {
    a: {type: 'integer', data: 6},
    b: {type: 'array[number]', data: [1, 2, 3]}
  }).then(result => {
    t.deepEqual(result, {
      inputs: ['a', 'b'],
      output: 'c',
      value: { type: 'integer', data: 12 },
      messages: [],
      streams: null
    })
  })
})

test('JsContext.executeCode value is multiline', t => {
  let c = new JsContext()
  t.plan(1)

  c._executeCode(`let x = {
    a: 1,
    b: "foo"
  }`).then(result => {
    t.deepEqual(result, {
      inputs: [],
      output: 'x',
      value: { type: 'object', data: { a: 1, b: 'foo'} },
      messages: [],
      streams: null
    })
  })
})

test('JsContext.executeCode with errors', t => {
  let c = new JsContext()
  t.plan(3)

  c._executeCode('foo').then(result => {
    t.deepEqual(result.messages, [
      { line: 0, column: 0, type: 'warn', message: 'Input variable "foo" is not managed' },
      { line: 1, column: 1, type: 'error', message: 'ReferenceError: foo is not defined' }
    ])
  })
  c._executeCode('1\n2\n foo\n4').then(result => {
    t.deepEqual(result.messages, [
      { line: 0, column: 0, type: 'warn', message: 'Input variable "foo" is not managed' },
      { line: 3, column: 2, type: 'error', message: 'ReferenceError: foo is not defined' }
    ])
  })
  c._executeCode(' <>').then(result => {
    t.deepEqual(result.messages, [
      { line: 1, column: 1, type: 'error', message: 'SyntaxError: Unexpected token (1:1)' }
    ])
  })
})

test('JsContext.executeCode with global variables', t => {
  let c = new JsContext()
  t.plan(3)

  c._executeCode('foo = "bar"')

  c._executeCode('foo').then(result => {
    t.deepEqual(result.value, {type: 'string', data: 'bar'}, 'can get global variable')
  })

  c._executeCode('foo + "t_simpson"').then(result => {
    t.deepEqual(result.value, {type: 'string', data: 'bart_simpson'}, 'can get global variable expression')
  })

  c._executeCode('foo = 42')

  c._executeCode('foo').then(result => {
    t.deepEqual(result.value, {type: 'integer', data: 42}, 'can change global variable')
  })
})

test('JsContext.executeCode with console output', t => {
  let c = new JsContext()
  t.plan(3)

  c._executeCode('console.log("Hello!")').then(result => {
    t.equal(result.streams.stdout, "Hello!")
  })

  c._executeCode('console.warn("Warning")').then(result => {
    t.equal(result.streams.stdout, "Warning")
  })

  c._executeCode('console.error("Errrrr!")').then(result => {
    t.equal(result.streams.stderr, "Errrrr!")
  })
})

test('JsContext.hasFunction', t => {
  let c = new JsContext()
  t.plan(2)

  c.hasFunction('core', 'type').then(result => {
    t.equal(result, true)
  })

  c.hasFunction('foo', 'this_is_not_a_registered_function').then(result => {
    t.equal(result, false)
  })
})

test('JsContext.callFunction', t => {
  let c = new JsContext()
  t.plan(3)

  t.throws(() => {
    c.callFunction()
  })

  c.callFunction('core', 'type', [{type: 'integer', data: 42}]).then(result => {
    t.deepEqual(result.value, {type: 'string', data: 'integer'})
  })

  c._libs['foo'] = {
    funcs: {
      bar: {
        body: function () {
          throw new Error('nope')
        }
      }
    }
  }
  c.callFunction('foo', 'bar').then(result => {
    t.deepEqual(result.messages, [ { column: 0, line: 0, type: 'error', message: 'Error: nope' } ])
  })
})
