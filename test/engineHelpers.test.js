import test from 'tape'
import { isExpression, valueFromText } from '../src/engineHelpers'

test('engineHelpers: isExpression()', t => {
  t.ok(isExpression('= foo()'), 'a cell with leading "=" is considered an expression')
  t.ok(isExpression('x = 1'), 'a cell with output declaration and an expression, too')
  t.end()
})

test('engineHelpers: valueFromText', t => {
  // TODO: add more of thi
  t.deepEqual(valueFromText('false'), { type: 'boolean', data: false }, 'valueFromText should provide a correct unpacked value')
  t.deepEqual(valueFromText('true'), { type: 'boolean', data: true }, 'valueFromText should provide a correct unpacked value')
  t.deepEqual(valueFromText('1'), { type: 'integer', data: 1 }, 'valueFromText should provide a correct unpacked value')
  t.deepEqual(valueFromText('1.2'), { type: 'number', data: 1.2 }, 'valueFromText should provide a correct unpacked value')
  t.end()
})
