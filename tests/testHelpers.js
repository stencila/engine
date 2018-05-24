import { isArray } from 'substance'
import Engine from '../src/Engine'
import SimpleHost from '../src/SimpleHost'
import MiniContext from '../src/MiniContext'
import JsContext from '../src/JsContext'
import { libtest } from './libtest'
import { toString as cellStatusToString } from '../src/CellStates'
import {
  parseSymbol, getIndexesFromRange, getRangeFromMatrix, getRowCol
} from '../src/engineHelpers'

export function setupEngine () {
  let host = new TestHost()
  host.configure({
    contexts: [
      { lang: 'mini', client: MiniContext },
      { lang: 'js', client: JsContext }
    ]
  })
  let jsContext = host.getContext('js')
  jsContext.importLibrary(libtest)
  // TODO: the functionManager will be removed once we treat functions as values
  let functionManager = host._functionManager
  functionManager.importLibrary(jsContext, libtest)

  let engine = new Engine({ host })
  let graph = engine._graph
  // don't let the engine be run forever in tests
  engine.run = () => {}
  return { host, engine, graph }
}

class TestHost extends SimpleHost {
  constructor () {
    super()

    this._disabled = false
  }

  _disable (val) {
    this._disabled = val
  }

  getContext (name) {
    if (this._disabled) {
      return undefined
    } else {
      return super.getContext(name)
    }
  }
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
    return cellStatusToString(cell.status)
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
  let actions = engine.cycle()
  return Promise.all(actions)
}

/*
  Triggers a cycle as long as next actions are coming in.
*/
export function play (engine) {
  return new Promise((resolve) => {
    function step () {
      if (_needsUpdate(engine)) {
        cycle(engine).then(step)
      } else {
        resolve()
      }
    }
    step()
  })
}

function _needsUpdate (engine) {
  const graph = engine._graph
  if (graph.needsUpdate()) return true
  const nextActions = engine._nextActions
  if (nextActions.size === 0) return false
  // update is required if there is an action that has not been suspended
  for (let [, a] of nextActions) {
    if (!a.suspended) return true
  }
  return false
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
