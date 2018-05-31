import test from 'tape'
import { isArray, tableHelpers } from 'substance'
import { JavascriptContext } from 'stencila-js'
import Engine from '../src/Engine'
import { cellStateToString } from '../src/CellStates'
import MiniContext from '../src/MiniContext'
import { parseSymbol } from '../src/engineHelpers'
import { libtest } from './libtest'
import TestContext from './TestContext'

const { getRowCol, getIndexesFromRange, getRangeFromMatrix } = tableHelpers

export function testAsync (name, func) {
  test(name, async assert => {
    let success = false
    try {
      await func(assert)
      success = true
    } finally {
      if (!success) {
        assert.fail('Test failed with an uncaught exception.')
        assert.end()
      }
    }
  })
}

export function setupEngine () {
  let context = new TestContext()
  context.configure({
    contexts: [
      { id: 'mickey', lang: 'mini', client: MiniContext },
      { id: 'goofy', lang: 'js', client: JavascriptContext }
    ]
  })
  let jsContext = context.getLanguageContext('js')
  jsContext.importLibrary(libtest)

  let engine = new Engine(context)
  // EXPERIMENTAL: register all library content as globals
  let names = Object.keys(libtest.funcs)
  names.forEach(name => {
    // TODO: do we want that extra level here?
    // need to discuss if the function type could
    // be simplified
    engine._addGlobal(name, {
      type: 'function',
      value: {
        type: 'function',
        data: {
          name,
          library: libtest.name,
          context: jsContext.id
        }
      }
    })
  })

  let graph = engine._graph
  return { engine, context, graph }
}

export function getValue (cell) {
  if (cell.value) {
    return cell.value.data
  }
}

export function getValues (cells) {
  return cells.map(rowOrCell => {
    if (isArray(rowOrCell)) {
      return rowOrCell.map(getValue)
    } else {
      return getValue(rowOrCell)
    }
  })
}

export function getSource (cell) {
  return cell.source
}

export function getSources (cells) {
  return cells.map(rowOrCell => {
    if (isArray(rowOrCell)) {
      return rowOrCell.map(getSource)
    } else {
      return getSource(rowOrCell)
    }
  })
}

export function getErrors (cells) {
  return cells.map(cell => {
    return cell.errors.map(err => {
      return err.name || 'unknown'
    })
  })
}

export function getStates (cells) {
  return cells.map(cell => {
    return cellStateToString(cell.status)
  })
}

export function queryValues (engine, expr) {
  let symbol = parseSymbol(expr)
  if (!symbol.scope) throw new Error('query must use fully qualified identifiers')
  let docId = engine._lookupDocumentId(symbol.scope)
  if (!docId) throw new Error('Unknown resource:', symbol.scope)
  switch (symbol.type) {
    case 'var': {
      return engine._graph.getValue(expr)
    }
    case 'cell': {
      let sheet = engine._docs[docId]
      let [row, col] = getRowCol(symbol.name)
      return getValue(sheet.cells[row][col])
    }
    case 'range': {
      let sheet = engine._docs[docId]
      const { startRow, startCol, endRow, endCol } = getIndexesFromRange(symbol.anchor, symbol.focus)
      let cells = getRangeFromMatrix(sheet.getCells(), startRow, startCol, endRow, endCol)
      return getValues(cells)
    }
    default:
      //
  }
}

/*
  Waits for all actions to be finished.
  This is the slowest kind of scheduling, as every cycle
  takes as long as the longest evaluation.
  In a real environment, the Engine should be triggered as often as possible,
  but still with a little delay, so that all 'simultanous' actions can be
  done at once.
*/
export function cycle (engine) {
  return engine._runCycle()
}

/*
  Triggers a cycle as long as next actions are coming in.
*/
export function play (engine) {
  return new Promise((resolve) => {
    function step () {
      if (engine._needsUpdate()) {
        engine._runCycle().then(step)
      } else {
        resolve()
      }
    }
    step()
  })
}

export function setSheetSelection (sheetSession, expr) {
  let { anchorRow, anchorCol, focusRow, focusCol } = _getCoordinatesFromExpr(expr)
  let selData = {
    type: 'range',
    anchorRow,
    anchorCol,
    focusRow,
    focusCol
  }
  sheetSession.setSelection({
    type: 'custom',
    customType: 'sheet',
    data: selData
  })
}

export function checkSelection (t, sel, expr) {
  let expectedSelData = _getCoordinatesFromExpr(expr)
  expectedSelData.type = 'range'
  t.deepEqual(sel.data, expectedSelData, 'selection should be correct')
}

function _getCoordinatesFromExpr (expr) {
  let [start, end] = expr.split(':')
  let [anchorRow, anchorCol] = getRowCol(start)
  let focusRow, focusCol
  if (end) {
    ([focusRow, focusCol] = getRowCol(end))
  } else {
    ([focusRow, focusCol] = [anchorRow, anchorCol])
  }
  return { anchorRow, anchorCol, focusRow, focusCol }
}

// This is useful for writing tests, to use queries such as 'A1:A10'
export function queryCells (cells, query) {
  let symbol = parseSymbol(query)
  switch (symbol.type) {
    case 'cell': {
      const [row, col] = getRowCol(symbol.name)
      return cells[row][col]
    }
    case 'range': {
      const { startRow, startCol, endRow, endCol } = getIndexesFromRange(symbol.anchor, symbol.focus)
      return getRangeFromMatrix(cells, startRow, startCol, endRow, endCol)
    }
    default:
      throw new Error('Unsupported query')
  }
}
