import { testAsync } from 'substance-test'
import { UNKNOWN } from '../src/CellStates'
import { RuntimeError } from '../src/CellErrors'
import { BROKEN_REF } from '../src/engineHelpers'
import {
  setupEngine, getValue, getValues, getSources, getStates, getErrors, queryCells
} from './testHelpers'

testAsync('Engine: simple sheet', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    // default lang
    lang: 'mini',
    cells: [
      ['1', '= A1 * 2'],
      ['2', '= A2 * 2']
    ]
  })
  await engine.runOnce()
  let cells = queryCells(sheet.cells, 'B1:B2')
  t.deepEqual(getStates(cells), ['ok', 'ok'], 'cells should be ok')
  t.deepEqual(getValues(cells), [2, 4], 'values should have been computed')
  t.end()
})

testAsync('Engine: simple doc', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      'x = 2',
      'y = 3',
      'z = x + y'
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.deepEqual(getStates(cells), ['ok', 'ok', 'ok'], 'cells should be ok')
  t.deepEqual(getValues(cells), [2, 3, 5], 'values should have been computed')
  t.end()
})

testAsync('Engine: single cell', async t => {
  let { engine, graph } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      '1+2'
    ]
  })
  let cells = doc.getCells()
  const cell = cells[0]
  const id = cell.id
  let a, nextActions

  await engine.cycle()

  nextActions = engine.getNextActions()
  a = nextActions.get(id)
  t.equal(nextActions.size, 1, 'There should be one next action')
  t.equal(a.type, 'register', '.. which should be a registration action')
  t.equal(cell.status, UNKNOWN, 'cell state should be UNKNOWN')

  await engine.cycle()

  nextActions = engine.getNextActions()
  a = nextActions.get(id)
  t.ok(graph.hasCell(id), 'The cell should now be registered')
  t.equal(a.type, 'evaluate', 'next action should be evaluate')

  await engine.cycle()

  nextActions = engine.getNextActions()
  a = nextActions.get(id)
  t.equal(a.type, 'update', 'next action should be update')

  await engine.cycle()

  nextActions = engine.getNextActions()
  t.equal(nextActions.size, 0, 'There should be no pending actions')
  t.notOk(cell.hasErrors(), 'the cell should have no error')
  t.equal(getValue(cell), 3, 'the value should have been computed correctly')

  t.end()
})

testAsync('Engine: sheet', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    // default lang
    lang: 'mini',
    cells: [
      ['1', '= A1 * 2'],
      ['2', '= A2 * 2']
    ]
  })
  let [ [, cell2], [, cell4] ] = sheet.getCells()
  await engine.cycle()
  _checkActions(t, engine, [cell2, cell4], ['register', 'register'])
  await engine.cycle()
  _checkActions(t, engine, [cell2, cell4], ['evaluate', 'evaluate'])
  await engine.cycle()
  _checkActions(t, engine, [cell2, cell4], ['update', 'update'])
  await engine.cycle()
  t.deepEqual(getValues([cell2, cell4]), [2, 4], 'values should have been computed')
  t.end()
})

testAsync('Engine: range expression', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2', '= A1:B1'],
      ['3', '4', '= B2:B2'],
      ['= A1:A2', '6', '= A1:B2']
    ]
  })
  let [ [,, cell1], [,, cell2], [cell3,, cell4] ] = sheet.getCells()
  let cells = [cell1, cell2, cell3, cell4]
  await engine.cycle()
  _checkActions(t, engine, cells, ['register', 'register', 'register', 'register'])
  await engine.cycle()
  _checkActions(t, engine, cells, ['evaluate', 'evaluate', 'evaluate', 'evaluate'])
  await engine.cycle()
  _checkActions(t, engine, cells, ['update', 'update', 'update', 'update'])
  await engine.cycle()
  t.deepEqual(
    getValues(cells),
    [[1, 2], 4, [1, 3], {'type': 'table', 'data': {'A': [1, 3], 'B': [2, 4]}, 'columns': 2, 'rows': 2}],
    'values should have been computed'
  )
  t.end()
})

/*
  Scenario:
  1. create a doc with two cells 'x = 1' and 'x = 2'
    -> now there should be an error because of the name collision
  2. update both cells (not resolving the issue)
    -> both should still have the same error
*/
testAsync('Engine: graph errors should not be cleared without resolving', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 1' },
      { id: 'cell2', source: 'x = 2' }
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [['collision'], ['collision']], 'Both cells should have a collision error.')
  doc.updateCell('cell1', { source: 'x =  1' })
  doc.updateCell('cell2', { source: 'x = 3' })
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [['collision'], ['collision']], 'still both cells should have a collision error.')
  t.end()
})

testAsync('Engine: runtime errors should be wiped when inputs are updated', async t => {
  let { engine, graph } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 1' },
      { id: 'cell2', source: 'y = x' }
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.equal(getValue(cells[1]), 1, 'y should be computed.')
  graph.addError(cells[1].id, new RuntimeError('Ooops'))
  await engine.runOnce()
  doc.updateCell('cell1', { source: 'x = 2' })
  await engine.runOnce()
  t.equal(getValue(cells[1]), 2, 'y should be updated.')
  t.end()
})

testAsync('Engine (Document): inserting a cell', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 2' },
      { id: 'cell2', source: 'z = 3*x' }
    ]
  })
  await engine.runOnce()
  doc.insertCellAt(1, { id: 'cell3', source: 'y = x + 1' })
  await engine.runOnce()
  doc.updateCell('cell1', { source: 'x = 2' })
  await engine.runOnce()
  t.deepEqual(getValues(doc.getCells()), [2, 3, 6], 'values should have been computed')
  t.end()
})

testAsync('Engine (Document): removing a cell', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 2' },
      { id: 'cell2', source: 'y = 3*x' },
      { id: 'cell3', source: 'z = 2*y' }
    ]
  })
  await engine.runOnce()
  doc.removeCell('cell2')
  await engine.runOnce()
  t.deepEqual(getErrors(doc.getCells()), [[], ['unresolved']], 'cell3 should be broken now')
  t.end()
})

testAsync('Engine (Document): updating a cell', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 2' }
    ]
  })
  await engine.runOnce()
  doc.updateCell('cell1', 'x = 21')
  await engine.runOnce()
  t.deepEqual(getValues(doc.getCells()), [21], 'cell should have been updated')
  t.end()
})

testAsync('Engine (Sheet): column names', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    columns: [
      { name: 'x' },
      { name: 'y' }
    ],
    cells: [
      [ '1', '2' ],
      [ '3', '4' ]
    ]
  })
  t.equal(sheet.getColumnName(0), 'x', 'first column name should be correct')
  t.equal(sheet.getColumnName(1), 'y', 'second column name should be correct')
  t.end()
})

testAsync('Engine (Sheet): cell expressions', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['= A1 + 1', '= B1 + 1']
    ]
  })
  let cells = sheet.getCells()
  await engine.runOnce()
  t.deepEqual(getValues(cells[1]), [2, 3], 'values should have been computed')
  // TODO: still the difference between qualified vs unqualified id
  // is sometimes confusing
  // Note: Document and Sheet API uses unqualified ids (local to the resource, like 'A1')
  // while the engine and the graph uses qualified ids (globally unique, like 'sheet1!A1').
  sheet.updateCell(cells[0][0].unqualifiedId, '3')
  sheet.updateCell(cells[0][1].unqualifiedId, '4')
  await engine.runOnce()
  t.deepEqual(getValues(cells[1]), [4, 5], 'values should have been computed')
  t.end()
})

testAsync('Engine: changing a range expression', async t => {
  // Note: internally we instantiate a proxy cell
  // which should be pruned automatically if it is not needed anymore
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [['1'], ['2'], ['3'], ['= A1:A2']]
  })
  let [,,, [cell4]] = sheet.getCells()
  await engine.runOnce()
  t.deepEqual(getValue(cell4), [1, 2], 'range expression should be evaluated')
  sheet.updateCell(cell4.unqualifiedId, '= A1:A3')
  await engine.runOnce()
  t.deepEqual(getValue(cell4), [1, 2, 3], 'range expression should be updated')
  t.end()
})

testAsync('Engine: inverse range expression are normalized', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['= A2:A1', '= B1:A1']
    ]
  })
  let cells = sheet.getCells()
  await engine.runOnce()
  t.deepEqual(getValues(cells[2]), [[1, 3], [1, 2]], 'values should be in normal order')
  t.end()
})

testAsync('Engine: no context for lang', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'foo',
    cells: [
      'x = 2'
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [['context']], 'there should an error about missing context')
  t.end()
})

testAsync('Engine: lost context', async t => {
  let { engine, context } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      'x = 2'
    ]
  })
  let cells = doc.getCells()
  await engine.cycle()
  await engine.cycle()
  // now the cell should be scheduled for evaluation
  _checkActions(t, engine, cells, ['evaluate'])
  // and there we pretend a lost connection
  context._disable(true)
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [['context']], 'there should an error about missing context')
  t.end()
})

testAsync('Engine: transclusion', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      'x = sheet1!A3',
      'x * 2'
    ]
  })
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['= A1 + A2', '= B1 + B2']
    ]
  })
  let docCells = doc.getCells()
  let sheetCells = sheet.getCells()
  await engine.runOnce()
  t.deepEqual(getValues(docCells), [4, 8], 'document cells should have been computed')
  sheet.updateCell(sheetCells[0][0].unqualifiedId, '5')
  await engine.runOnce()
  t.deepEqual(getValues(docCells), [8, 16], 'document cells should have been computed')
  t.end()
})

testAsync('Engine: manual execution', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      'x = 2',
      'x * 3'
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.deepEqual(getStates(cells), ['ready', 'waiting'], 'cell states should be correct')
  engine._allowRunningCell(cells[0].id)
  await engine.runOnce()
  t.deepEqual(getStates(cells), ['ok', 'ready'], 'cell states should be correct')
  engine._allowRunningCell(cells[1].id)
  await engine.runOnce()
  t.deepEqual(getValues(cells), [2, 6], 'cells should have been computed')
  t.end()
})

testAsync('Engine: manual execution of a single cell (#688)', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      'x = 2'
    ]
  })
  let cells = doc.getCells()
  let cell = cells[0]
  await engine.runOnce()
  t.deepEqual(getStates(cells), ['ready'], 'cell state should be correct')
  engine._allowRunningCell(cell.id)
  await engine.runOnce()
  t.deepEqual(getStates(cells), ['ok'], 'cell state should be correct')
  t.equal(getValue(cell), 2, 'the value should have been computed correctly')
  doc.updateCell(cell.unqualifiedId, { source: 'x = 3' })
  await engine.runOnce()
  engine._allowRunningCell(cell.id)
  await engine.runOnce()
  t.equal(getValue(cell), 3, 'the value should have been computed correctly')
  t.end()
})

testAsync('Engine: manually run cell and predecessors', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      'x = 2',
      'y = x * 3',
      'z = y + 2'
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  engine._allowRunningCellAndPredecessors(cells[2].id)
  await engine.runOnce()
  t.deepEqual(getValues(cells), [2, 6, 8], 'cells should have been computed')
  t.end()
})

testAsync('Engine: run all cells in manual execution mode', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      'x = 2',
      'y = x * 3',
      'z = y + 2'
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  engine._allowRunningAllCellsOfDocument('doc1')
  await engine.runOnce()
  t.deepEqual(getValues(cells), [2, 6, 8], 'cells should have been computed')
  t.end()
})

testAsync('Engine: cells with errors should not be scheduled (manual mode)', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      '6 * 2'
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  engine._allowRunningAllCellsOfDocument('doc1')
  await engine.runOnce()
  t.deepEqual(getValues(cells), [12], 'cells should have been computed')
  doc.updateCell(cells[0].unqualifiedId, { source: '6 * 2 +' })
  await engine.runOnce()
  t.deepEqual(getStates(cells), ['broken'], 'cell should be broken')
  doc.updateCell(cells[0].unqualifiedId, { source: '6 * 2 + 1' })
  await engine.runOnce()
  t.deepEqual(getStates(cells), ['ready'], 'cell should be ready')
  t.end()
})

testAsync('Engine: insert rows', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4']
    ]
  })
  await engine.runOnce()
  sheet.insertRows(1, [['5', '6'], ['7', '8']])
  await engine.runOnce()
  t.deepEqual(getValues(queryCells(sheet.cells, 'A2:B3')), [[5, 6], [7, 8]], 'cells should have been inserted')
  t.end()
})

testAsync('Engine: append rows', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4']
    ]
  })
  await engine.runOnce()
  sheet.insertRows(2, [['5', '6'], ['7', '8'], ['9', '10']])
  await engine.runOnce()
  t.deepEqual(getValues(queryCells(sheet.cells, 'A3:B5')), [[5, 6], [7, 8], [9, 10]], 'cells should have been inserted')
  t.end()
})

testAsync('Engine: delete rows', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8']
    ]
  })
  await engine.runOnce()
  sheet.deleteRows(0, 2)
  await engine.runOnce()
  t.deepEqual(getValues(sheet.getCells()), [[5, 6], [7, 8]], 'rows should have been removed')
  t.end()
})

testAsync('Engine: insert cols', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      [{id: 'c1', source: '1'}, {id: 'c2', source: '2'}],
      [{id: 'c3', source: '3'}, {id: 'c4', source: '4'}]
    ]
  })
  await engine.runOnce()
  sheet.insertCols(1, [[{id: 'c5', source: '5'}], [{id: 'c6', source: '6'}]])
  await engine.runOnce()
  t.deepEqual(getValues(queryCells(sheet.cells, 'A1:C2')), [[1, 5, 2], [3, 6, 4]], 'cells should have been inserted')
  t.end()
})

testAsync('Engine: append cols', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4']
    ]
  })
  await engine.runOnce()
  sheet.insertCols(2, [['5', '6', '7'], ['8', '9', '10']])
  await engine.runOnce()
  t.deepEqual(getValues(queryCells(sheet.cells, 'C1:E2')), [[5, 6, 7], [8, 9, 10]], 'cells should have been inserted')
  t.end()
})

testAsync('Engine: delete cols', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
      ['9', '10', '11', '12']
    ]
  })
  await engine.runOnce()
  sheet.deleteCols(1, 2)
  await engine.runOnce()
  t.deepEqual(getValues(sheet.getCells()), [[1, 4], [5, 8], [9, 12]], 'cols should have been removed')
  t.end()
})

testAsync('Engine: insert a row', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8'],
      ['=sum(A1:A4)', '=sum(B1:B4)']
    ]
  })
  let cells = sheet.cells[4]
  await engine.runOnce()
  t.deepEqual(getValues(cells), [16, 20], 'cells should have correct values')
  sheet.insertRows(1, [['2', '3']])
  t.deepEqual(getSources(cells), ['=sum(A1:A5)', '=sum(B1:B5)'], 'sources should have been updated')
  await engine.runOnce()
  t.deepEqual(getValues(cells), [18, 23], 'cells should have correct values')
  t.end()
})

testAsync('Engine: insert multiple rows', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8'],
      ['=sum(A1:A4)', '=sum(B1:B4)']
    ]
  })
  let cells = sheet.cells[4]
  await engine.runOnce()
  sheet.insertRows(1, [['2', '3'], ['4', '5']])
  t.deepEqual(getSources(cells), ['=sum(A1:A6)', '=sum(B1:B6)'], 'sources should have been updated')
  await engine.runOnce()
  t.deepEqual(getValues(cells), [22, 28], 'cells should have correct values')
  t.end()
})

testAsync('Engine: delete a row', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8'],
      ['=sum(A1:A4)', '=sum(B1:B4)']
    ]
  })
  let cells = sheet.cells[4]
  await engine.runOnce()
  t.deepEqual(getValues(cells), [16, 20], 'cells should have correct values')
  sheet.deleteRows(2, 1)
  t.deepEqual(getSources(cells), ['=sum(A1:A3)', '=sum(B1:B3)'], 'sources should have been updated')
  await engine.runOnce()
  t.deepEqual(getValues(cells), [11, 14], 'cells should have correct values')
  t.end()
})

testAsync('Engine: delete last row of a cell range', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8'],
      ['=sum(A1:A4)', '=sum(B1:B4)']
    ]
  })
  let cells = sheet.cells[4]
  await engine.runOnce()
  sheet.deleteRows(3, 1)
  t.deepEqual(getSources(cells), ['=sum(A1:A3)', '=sum(B1:B3)'], 'sources should have been updated')
  await engine.runOnce()
  t.deepEqual(getValues(cells), [9, 12], 'cells should have correct values')
  t.end()
})

testAsync('Engine: delete rows covering an entire cell range', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8'],
      ['=sum(A2:A3)', '=B2+B3']
    ]
  })
  let cells = sheet.cells[4]
  await engine.runOnce()
  sheet.deleteRows(1, 2)
  await engine.runOnce()
  t.deepEqual(getSources(cells), [`=sum(${BROKEN_REF})`, `=${BROKEN_REF}+${BROKEN_REF}`], 'sources should have been updated')
  t.end()
})

testAsync('Engine: insert a column', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8'],
      ['=sum(A1:A4)', '=sum(A1:B4)']
    ]
  })
  let cells = sheet.cells[4]
  await engine.runOnce()
  t.deepEqual(getValues(cells), [16, 36], 'cells should have correct values')
  sheet.insertCols(1, [['2'], ['3'], ['4'], ['5'], ['=sum(B1:B4)']])
  await engine.runOnce()
  cells = queryCells(sheet.cells, 'A5:C5')
  t.deepEqual(getSources(cells), ['=sum(A1:A4)', '=sum(B1:B4)', '=sum(A1:C4)'], 'sources should have been updated')
  t.deepEqual(getValues(cells), [16, 14, 50], 'cells should have correct values')
  t.end()
})

testAsync('Engine: insert multiple columns', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8'],
      ['=sum(A1:A4)', '=sum(A1:B4)']
    ]
  })
  await engine.runOnce()
  sheet.insertCols(1, [['2', '3'], ['4', '5'], ['6', '7'], ['8', '9'], ['=sum(B1:B4)', '=sum(C1:C4)']])
  await engine.runOnce()
  let cells = queryCells(sheet.cells, 'A5:D5')
  t.deepEqual(getSources(cells), ['=sum(A1:A4)', '=sum(B1:B4)', '=sum(C1:C4)', '=sum(A1:D4)'], 'sources should have been updated')
  t.deepEqual(getValues(cells), [16, 20, 24, 80], 'cells should have correct values')
  t.end()
})

testAsync('Engine: delete a column', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2', '3'],
      ['3', '4', '5'],
      ['6', '7', '8'],
      ['9', '10', '11'],
      ['=sum(A1:A4)', '=sum(B1:B4)', '=sum(A1:C4)']
    ]
  })
  await engine.runOnce()
  sheet.deleteCols(1, 1)
  t.deepEqual(getSources(queryCells(sheet.cells, 'A5:B5')), ['=sum(A1:A4)', '=sum(A1:B4)'], 'sources should have been updated')
  await engine.runOnce()
  t.deepEqual(getValues(queryCells(sheet.cells, 'A5:B5')), [19, 46], 'cells should have correct values')
  t.end()
})

testAsync('Engine: delete columns covering an entire cell range', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
      ['=sum(A1:A2)', '=sum(B1:B2)', '=C1+C2', '=A3+B3+C3']
    ]
  })
  await engine.runOnce()
  sheet.deleteCols(1, 2)
  await engine.runOnce()
  let cells = queryCells(sheet.cells, 'A3:B3')
  t.deepEqual(getSources(cells), [`=sum(A1:A2)`, `=A3+${BROKEN_REF}+${BROKEN_REF}`], 'sources should have been updated')
  t.end()
})

testAsync('Engine: delete last column of a cell range', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2', '3'],
      ['3', '4', '5'],
      ['6', '7', '8'],
      ['9', '10', '11'],
      ['=sum(A1:A4)', '=sum(B1:B4)', '=sum(A1:B4)']
    ]
  })
  await engine.runOnce()
  sheet.deleteCols(1, 1)
  t.deepEqual(getSources(queryCells(sheet.cells, 'A5:B5')), ['=sum(A1:A4)', '=sum(A1:A4)'], 'sources should have been updated')
  await engine.runOnce()
  t.deepEqual(getValues(queryCells(sheet.cells, 'A5:B5')), [19, 19], 'cells should have correct values')
  t.end()
})

testAsync('Engine: resolving a cycle', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = y' },
      { id: 'cell2', source: 'y = x' }
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [['cyclic'], ['cyclic']], 'Both cells should have a cyclic dependency error.')
  doc.updateCell('cell2', { source: 'y = 1' })
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [[], []], 'Cyclic dependency error should be resolved.')
  t.end()
})

testAsync('Engine: resolving a cycle when cell gets invalid', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = y' },
      { id: 'cell2', source: 'y = x' }
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [['cyclic'], ['cyclic']], 'Both cells should have a cyclic dependency error.')
  doc.updateCell('cell2', { source: 'y = ' })
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [[], ['syntax']], 'Cyclic dependency error should be resolved.')
  t.end()
})

testAsync('Engine: clear old errors when a cell is changed into a constant', async t => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['= A2', '2'],
      ['= A1', '4']
    ]
  })
  let cells = queryCells(sheet.cells, 'A1:A2')
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [['cyclic'], ['cyclic']], 'cells should have a cyclic dependency error')
  sheet.updateCell(cells[1].unqualifiedId, '3')
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [[], []], 'errors should have been cleared')
  t.end()
})

testAsync('Engine: invalid transclusion syntax should lead to a syntax error (#693)', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      "a'Sheet 1'!A1:B3"
    ]
  })
  let cells = doc.getCells()
  await engine.cycle()
  await engine.cycle()
  t.deepEqual(getErrors(cells), [['syntax']], 'There should be a syntax error.')
  t.end()
})

testAsync('Engine: mini expression with invalid characters should result in syntax error (#676)', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      '1+7äää'
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.deepEqual(getErrors(cells), [['syntax']], 'There should be a syntax error.')
  t.end()
})

testAsync('Engine: sheet cell with output', async (t) => {
  let { engine } = setupEngine()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', 'x = A1 + 3'],
      ['3', '= A2 * x'],
      ['5', '= A3 * B1']
    ]
  })
  let [[, cell2], [, cell4], [, cell6]] = sheet.getCells()
  await engine.runOnce()
  t.deepEqual(getValues([cell2, cell4, cell6]), [4, 12, 20], 'cells should have correct values')
  t.end()
})

function _checkActions (t, engine, cells, expected) {
  let nextActions = engine.getNextActions()
  let actual = []
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const action = nextActions.get(cell.id)
    actual.push(action ? action.type : undefined)
  }
  t.deepEqual(actual, expected, 'next actions should be registered correctly')
}
