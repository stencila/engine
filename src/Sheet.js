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
    const graph = this.engine._graph
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
        if (spans[j]) {
          graph._addDependencies(cell, spans[j])
        }
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
    const graph = this.engine._graph
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
        if (spans[i]) {
          graph._addDependencies(cell, spans[i])
        }
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
    const graph = this.engine._graph
    let cells = this.cells
    let affectedCells = new Set()
    for (let i = 0; i < cells.length; i++) {
      let row = cells[i]
      for (let j = 0; j < row.length; j++) {
        let cell = row[j]
        let deps = graph._sheetCellOuts[cell.id]
        deps.forEach(dep => {
          // update all symbols that point to this document
          dep.symbols.forEach(s => {
            if (s.scope === this.name) {
              s._update = { type: 'rename', scope: newName }
            }
          })
          affectedCells.add(dep)
        })
      }
    }
    affectedCells.forEach(cell => {
      applyCellTransformations(cell)
      this.engine._resetCell(cell)
    })
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

  _getCellsForRange (s) {
    const cells = this.cells
    let result = new Set()
    for (let i = s.startRow; i <= s.endRow; i++) {
      let row = cells[i]
      for (let j = s.startCol; j <= s.endCol; j++) {
        let cell = row[j]
        if (!cell) {
          console.error('FIXME: SOMETHING IS BROKEN HERE')
        } else {
          result.add(cell)
        }
      }
    }
    return result
  }

  _sendSourceUpdate (cells) {
    if (cells.size > 0) {
      this.engine._sendUpdate('source', cells)
    }
  }
}

/*
  Records symbol updates and applies to cells.
  Additionally determines cells that have a symbol that is spanning
  over the insertion position.
*/
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
  const graph = engine._graph
  let visited = new Set()
  for (let i = startRow; i < cells.length; i++) {
    let row = cells[i]
    for (let j = startCol; j < row.length; j++) {
      let cell = row[j]
      let deps = graph._sheetCellOuts[cell.id]
      if (deps) {
        recordTransformations(deps, dim, pos, count, affected, visited)
      }
    }
  }
  // NOTE: this seems a bit weird, but this needs to be done before the cell
  // symbols are changed.
  let spans = _getCellsWithSpanningSymbols(cells, dim, pos)
  // update the source for all affected cells
  affected.forEach(cell => {
    applyCellTransformations(cell)
    if (engine) {
      engine._resetCell(cell)
    }
  })
  return spans
}

/*
* Some symbols are spanning the insert position. The cells with these
* symbols need to be added the the dependencies for the inserted cells.
* This method is only used after symbol updates have been recorded, i.e.
* stored into `s._update`
*/
function _getCellsWithSpanningSymbols (graph, cells, dim, pos) {
  // Note: it is enough to walk along the row/col where cells are inserted
  // and investigate their symbols
  let spans = []
  if (pos > 0) {
    if (cells.length === 0 || cells[0].length === 0) return
    let size = [cells.length, cells[0].length]
    if (pos >= size[dim]) return
    // check cells along the other dimension
    let L = dim === 0 ? size[1] : size[0]
    for (let i = 0; i < L; i++) {
      let cell = dim === 0 ? cells[pos][i] : cells[i][pos]
      let deps = graph._sheetCellIns[cell.id]
      if (deps) {
        for (let dep of deps) {
          for (let s of dep.symbols) {
            let update = s._update
            if (update && update.start <= pos) {
              if (!spans[i]) spans[i] = new Set()
              spans[i].add(dep)
            }
          }
        }
      }
    }
  }
  return spans
}
