import test from 'tape'
import { isExpression } from '../src/engineHelpers'

test('engineHelpers: isExpression()', t => {
  t.ok(isExpression('= foo()'), 'a cell with leading "=" is considered an expression')
  t.ok(isExpression('x = 1'), 'a cell with output declaration and an expression, too')
  t.end()
})
