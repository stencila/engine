import { uuid, isString, clone, tableHelpers } from 'substance'
import {
  recordTransformations, applyCellTransformations, qualifiedId as _qualifiedId
} from './engineHelpers'
import SheetCell from './SheetCell'

const { getCellLabel, getColumnLabel } = tableHelpers

/*
  Engine's internal model of a Spreadsheet.
*/
export default class Sheet {
  constructor (engine, data) {
    this.engine = engine
    const docId = data.id
    if (!docId) throw new Error("'id' is required")
    this.id = docId
    this.name = data.name
    // default language
    const defaultLang = data.lang || 'mini'
    this.lang = defaultLang
    if (data.hasOwnProperty('autorun')) {
      this.autorun = data.autorun
    } else {
      // TODO: using auto/ cells automatically by default
      this.autorun = true
    }
    // TODO: we can revise this as we move on
    // for now, data.cells must be present being a sequence of rows of cells.
    // data.columns is optional, but if present every data row have corresponding dimensions
    if (!data.cells) throw new Error("'cells' is mandatory")
    let ncols
    if (data.columns) {
      this.columns = data.columns
    } else {
      ncols = data.cells[0].length
      let columns = []
      for (let i = 0; i < ncols; i++) {
        columns.push({ type: 'auto' })
      }
      this.columns = columns
    }
    ncols = this.columns.length
    this.cells = data.cells.map((rowData) => {
      if (rowData.length !== ncols) throw new Error('Invalid data')
      return rowData.map(cellData => this._createCell(cellData))
    })

    if (data.onCellRegister) this.onCellRegister = data.onCellRegister
  }

  get type () { return 'sheet' }

  setAutorun (val) {
    this.autorun = val
  }

  getColumnName (colIdx) {
    let columnMeta = this.columns[colIdx]
    if (columnMeta && columnMeta.name) {
      return columnMeta.name
    } else {
      return getColumnLabel(colIdx)
    }
  }

  getCells () {
    return this.cells
  }

  updateCell (id, cellData) {
    let qualifiedId = _qualifiedId(this.id, id)
    if (isString(cellData)) {
      cellData = { source: cellData }
    }
    this.engine._updateCell(qualifiedId, cellData)
  }

  insertRows (pos, dataBlock) {
    // TODO: what if all columns and all rows had been removed
    const count = dataBlock.length
    if (count === 0) return
    const ncols = this.columns.length
    let block = dataBlock.map((rowData) => {
      if (rowData.length !== ncols) throw new Error('Invalid data')
      return rowData.map(cellData => this._createCell(cellData))
    })
    let affectedCells = new Set()
    let spans = transformCells(this.engine, this.cells, 0, pos, count, affectedCells)
    // add the spanning symbols to the deps of the new cells
    for (let i = 0; i < block.length; i++) {
      let row = block[i]
      for (let j = 0; j < row.length; j++) {
        let cell = row[j]
        if (spans && spans[j]) cell.deps = new Set(spans[j])
      }
    }
    // update sheet structure
    this.cells.splice(pos, 0, ...block)
    this._registerCells(block)
    this._sendSourceUpdate(affectedCells)
  }

  deleteRows (pos, count) {
    if (count === 0) return
    let affectedCells = new Set()
    let block = this.cells.slice(pos, pos + count)
    transformCells(this.engine, this.cells, 0, pos, -count, affectedCells)
    this.cells.splice(pos, count)
    this._unregisterCells(block)
    this._sendSourceUpdate(affectedCells)
  }

  insertCols (pos, dataBlock) {
    const nrows = this.cells.length
    if (dataBlock.length !== nrows) throw new Error('Invalid dimensions')
    let count = dataBlock[0].length
    if (count === 0) return
    let affectedCells = new Set()
    // transform cells
    let spans = transformCells(this.engine, this.cells, 1, pos, count, affectedCells)
    let block = dataBlock.map((rowData) => {
      if (rowData.length !== count) throw new Error('Invalid data')
      return rowData.map(cellData => this._createCell(cellData))
    })
    let cols = []
    for (let i = 0; i < count; i++) {
      cols.push({ type: 'auto' })
    }
    this.columns.splice(pos, 0, ...cols)
    for (let i = 0; i < nrows; i++) {
      let row = this.cells[i]
      row.splice(pos, 0, ...block[i])
    }
    // add the spanning symbols to the deps of the new cells
    for (let i = 0; i < block.length; i++) {
      let row = block[i]
      for (let j = 0; j < row.length; j++) {
        let cell = row[j]
        if (spans && spans[i]) cell.deps = new Set(spans[i])
      }
    }
    this._registerCells(block)
    this._sendSourceUpdate(affectedCells)
  }

  deleteCols (pos, count) {
    if (count === 0) return
    let affectedCells = new Set()
    transformCells(this.engine, this.cells, 1, pos, -count, affectedCells)
    const N = this.cells.length
    let block = []
    this.columns.splice(pos, count)
    for (var i = 0; i < N; i++) {
      let row = this.cells[i]
      block.push(row.slice(pos, pos + count))
      row.splice(pos, count)
    }
    this._unregisterCells(block)
    this._sendSourceUpdate(affectedCells)
  }

  rename (newName) {
    if (newName === this.name) return
    let cells = this.cells
    let affectedCells = new Set()
    for (let i = 0; i < cells.length; i++) {
      let row = cells[i]
      for (let j = 0; j < row.length; j++) {
        let cell = row[j]
        cell.deps.forEach(s => {
          s._update = { type: 'rename', scope: newName }
          affectedCells.add(s.cell)
        })
      }
    }
    affectedCells.forEach(applyCellTransformations)
    this.name = newName
    this._sendSourceUpdate(affectedCells)
  }

  onCellRegister(cell) { // eslint-disable-line
  }

  dump () {
    let columns = this.columns.map(c => clone(c))
    let cells = this.cells.map(row => row.map(cell => cell.dump()))
    return {
      type: 'sheet',
      id: this.id,
      name: this.name,
      lang: this.lang,
      autorun: this.autorun,
      columns,
      cells
    }
  }

  _getCellSymbol (rowIdx, colIdx) {
    return `${this.id}!${getCellLabel(rowIdx, colIdx)}`
  }

  _createCell (cellData) {
    // simple format: just the expression
    if (isString(cellData)) {
      let source = cellData
      cellData = {
        id: uuid(),
        docId: this.id,
        source
      }
    }
    let cell = new SheetCell(this, cellData)
    return cell
  }

  _registerCell (cell) {
    const engine = this.engine
    engine._registerCell(cell)
    this.onCellRegister(cell)
  }

  _unregisterCell (cell) {
    const engine = this.engine
    engine._unregisterCell(cell)
  }

  _registerCells (block) {
    if (!block) block = this.cells
    block.forEach(row => row.forEach(cell => this._registerCell(cell)))
  }

  _unregisterCells (block) {
    if (!block) block = this.cells
    block.forEach(row => row.forEach(cell => this._unregisterCell(cell)))
  }

  _removeDep (s) {
    const cells = this.cells
    for (let i = s.startRow; i <= s.endRow; i++) {
      let row = cells[i]
      for (let j = s.startCol; j <= s.endCol; j++) {
        let cell = row[j]
        cell.removeDep(s)
      }
    }
  }

  _addDep (s) {
    const cells = this.cells
    for (let i = s.startRow; i <= s.endRow; i++) {
      let row = cells[i]
      for (let j = s.startCol; j <= s.endCol; j++) {
        let cell = row[j]
        cell.addDep(s)
      }
    }
  }

  _sendSourceUpdate (cells) {
    if (cells.size > 0) {
      this.engine._sendUpdate('source', cells)
    }
  }
}

function transformCells (engine, cells, dim, pos, count, affected) {
  if (count === 0) return
  // track updates for symbols and affected cells
  let startRow = 0
  let startCol = 0
  if (dim === 0) {
    startRow = pos
  } else {
    startCol = pos
  }
  let visited = new Set()
  for (let i = startRow; i < cells.length; i++) {
    let row = cells[i]
    for (let j = startCol; j < row.length; j++) {
      let cell = row[j]
      if (cell.deps.size > 0) {
        recordTransformations(cell, dim, pos, count, affected, visited)
      }
    }
  }
  let spans = _computeSpans(cells, dim, pos)
  // update the source for all affected cells
  affected.forEach(applyCellTransformations)
  // reset state of affected cells
  // TODO: let this be done by CellGraph, also making sure the cell state is reset properly
  if (engine) {
    affected.forEach(cell => {
      engine._graph._structureChanged.add(cell.id)
    })
  }
  return spans
}

// some symbols are spanning the insert position, and thus need to
// be added to the deps of inserted cells
function _computeSpans (cells, dim, pos) {
  let spans
  if (pos > 0) {
    if (cells.length === 0 || cells[0].length === 0) return
    let size = [cells.length, cells[0].length]
    if (pos >= size[dim]) return
    // check cells along the other dimension
    let L = dim === 0 ? size[1] : size[0]
    for (let i = 0; i < L; i++) {
      let cell = dim === 0 ? cells[pos][i] : cells[i][pos]
      let deps = Array.from(cell.deps)
      for (let j = 0; j < deps.length; j++) {
        let s = deps[j]
        let update = s._update
        if (update && update.start <= pos) {
          if (!spans) spans = []
          if (!spans[i]) spans[i] = []
          spans[i].push(s)
        }
      }
    }
  }
  return spans
}
