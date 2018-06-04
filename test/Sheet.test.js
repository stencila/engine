import { testAsync } from 'substance-test'
import { setupEngine } from './testHelpers'

testAsync('Sheet: tracking dependencies', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    // default lang
    lang: 'mini',
    cells: [
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
      ['=sum(A1:A2)', '=sum(B1:B2)', '=C1+C2', '=A3+B3+C3']
    ]
  })
  let graph = engine._graph

  await engine.runOnce()
  let inCount = sheet.cells.map(row => row.map(cell => (graph._sheetCellIns[cell.id] || new Set()).size))
  let expectedInCount = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [2, 2, 2, 3]
  ]
  t.deepEqual(inCount, expectedInCount, 'internal structure for tracking input dependencies')
  let outCount = sheet.cells.map(row => row.map(cell => (graph._sheetCellOuts[cell.id] || new Set()).size))
  let expectedOutCount = [
    [1, 1, 1, 0],
    [1, 1, 1, 0],
    [1, 1, 1, 0]
  ]
  t.deepEqual(outCount, expectedOutCount, 'internal structure for tracking output dependencies')
  t.end()
})
