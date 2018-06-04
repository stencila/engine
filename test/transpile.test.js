import test from 'tape'
import { transpile } from '../src/engineHelpers'

test('transpile: local variables should not be transpiled', t => {
  let source = 'x + y'
  let { transpiledCode } = transpile(source)
  t.equal(transpiledCode, source, 'source should not have changed')
  t.end()
})

test('transpile: local cells should not be transpiled', t => {
  let source = 'x + A10'
  let { transpiledCode } = transpile(source)
  t.equal(transpiledCode, source, 'source should not have changed')
  t.end()
})

test('transpile: local cell range', t => {
  let source = 'x + A1:B10'
  let { transpiledCode, map } = transpile(source)
  t.equal(transpiledCode, 'x + A1_B10', 'source should have been transpiled correctly')
  t.equal(map['A1_B10'].text, 'A1:B10', 'symbol mapping should have been registered')
  t.equal(transpiledCode.length, source.length, 'transpiled source should have the same length')
  t.end()
})

test('transpile: remote variable', t => {
  let source = 'x + doc1!z'
  let { transpiledCode, map } = transpile(source)
  t.equal(transpiledCode, 'x + doc1_z', 'source should have been transpiled correctly')
  t.equal(map['doc1_z'].text, 'doc1!z', 'symbol mapping should have been registered')
  t.equal(transpiledCode.length, source.length, 'transpiled source should have the same length')
  t.end()
})

test('transpile: remote variable (document name with spaces)', t => {
  let source = "x + 'My Document'!z"
  let { transpiledCode, map } = transpile(source)
  t.equal(transpiledCode, 'x +  My_Document__z', 'source should have been transpiled correctly')
  t.equal(map['My_Document__z'].text, "'My Document'!z", 'symbol mapping should have been registered')
  t.equal(transpiledCode.length, source.length, 'transpiled source should have the same length')
  t.end()
})

test('transpile: remote cell', t => {
  let source = 'x + sheet1!A1'
  let { transpiledCode, map } = transpile(source)
  t.equal(transpiledCode, 'x + sheet1_A1', 'source should have been transpiled correctly')
  t.equal(map['sheet1_A1'].text, 'sheet1!A1', 'symbol mapping should have been registered')
  t.equal(transpiledCode.length, source.length, 'transpiled source should have the same length')
  t.end()
})

test('transpile: remote cell (document name with spaces)', t => {
  let source = "x + 'My Sheet'!A1"
  let { transpiledCode, map } = transpile(source)
  t.equal(transpiledCode, 'x +  My_Sheet__A1', 'source should have been transpiled correctly')
  t.equal(map['My_Sheet__A1'].text, "'My Sheet'!A1", 'symbol mapping should have been registered')
  t.equal(transpiledCode.length, source.length, 'transpiled source should have the same length')
  t.end()
})

test('transpile: remote cell range', t => {
  let source = 'x + sheet1!A1:B10'
  let { transpiledCode, map } = transpile(source)
  t.equal(transpiledCode, 'x + sheet1_A1_B10', 'source should have been transpiled correctly')
  t.equal(map['sheet1_A1_B10'].text, 'sheet1!A1:B10', 'symbol mapping should have been registered')
  t.equal(transpiledCode.length, source.length, 'transpiled source should have the same length')
  t.end()
})

test('transpile: remote cell range (document name with spaces)', t => {
  let source = "x + 'My Sheet'!A1:B10"
  let { transpiledCode, map } = transpile(source)
  t.equal(transpiledCode, 'x +  My_Sheet__A1_B10', 'source should have been transpiled correctly')
  t.equal(map['My_Sheet__A1_B10'].text, "'My Sheet'!A1:B10", 'symbol mapping should have been registered')
  t.equal(transpiledCode.length, source.length, 'transpiled source should have the same length')
  t.end()
})

test('transpile: crazy document name', t => {
  let source = "x + 'My @heet i$ sup4r aw3s0m3!!!'!A1"
  let { transpiledCode, map } = transpile(source)
  t.equal(transpiledCode, 'x +  My__heet_i__sup4r_aw3s0m3_____A1', 'source should have been transpiled correctly')
  t.equal(map['My__heet_i__sup4r_aw3s0m3_____A1'].text, "'My @heet i$ sup4r aw3s0m3!!!'!A1", 'symbol mapping should have been registered')
  t.equal(transpiledCode.length, source.length, 'transpiled source should have the same length')
  t.end()
})
