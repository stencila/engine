import { test } from 'substance-test'
import { isExpression, parseValue } from '../src/engineHelpers'

test('engineHelpers: isExpression()', t => {
  t.ok(isExpression('= foo()'), 'a cell with leading "=" is considered an expression')
  t.ok(isExpression('x = 1'), 'a cell with output declaration and an expression, too')
  t.end()
})

test('engineHelpers: valueFromText', t => {
  t.equal(parseValue('false'), false)
  t.equal(parseValue('true'), true)
  t.equal(parseValue('1'), 1)
  t.equal(parseValue('1.2'), 1.2)
  t.end()
})
