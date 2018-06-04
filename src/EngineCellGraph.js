import { flatten, tableHelpers } from 'substance'
import CellGraph from './CellGraph'

export default class EngineCellGraph extends CellGraph {
  constructor (engine) {
    super()

    this._engine = engine
    // forward dependencies / impact
    // for a every sheet cell all other cells that depend on it via cell or range ref
    // id -> Set
    this._sheetCellOuts = {}
    // id -> Set
    this._sheetCellIns = {}
  }

  _getDoc (s) {
    return this._engine._docs[s.docId]
  }

  // Note: this is overridden to register and deregister
  // cell dependencies expressed by cell or range references
  _setInputs (cell, newInputs) {
    super._setInputs(cell, newInputs)

    // first remove the cell from all the cells it has depended on first
    let oldDeps = this._sheetCellIns[cell.id]
    if (oldDeps) {
      oldDeps.forEach(dep => {
        let _deps = this._sheetCellOuts[dep.id]
        if (_deps) {
          _deps.delete(cell)
        }
      })
    }

    newInputs.forEach(s => {
      if (s.type !== 'var') {
        let sheet = this._getDoc(s)
        if (sheet) {
          let deps = sheet._getCellsForRange(s)
          this._addDependencies(cell, deps)
        }
      }
    })
  }

  _addDependencies (cell, deps) {
    let ins = this._sheetCellIns[cell.id]
    if (!ins) {
      ins = this._sheetCellIns[cell.id] = new Set()
    }
    deps.forEach(dep => {
      let outs = this._sheetCellOuts[dep.id]
      if (!outs) {
        outs = this._sheetCellOuts[dep.id] = new Set()
      }
      outs.add(cell)
      ins.add(dep)
    })
  }

  _resolve (s) {
    switch (s.type) {
      case 'cell': {
        let sheet = this._getDoc(s)
        if (sheet) {
          let row = sheet.cells[s.startRow]
          if (row) {
            let cell = row[s.startCol]
            if (cell) return cell.id
          }
        }
        break
      }
      case 'range': {
        let sheet = this._getDoc(s)
        if (sheet) {
          let cells = tableHelpers.getRangeFromMatrix(sheet.cells, s.startRow, s.startRow, s.endRow, s.endCol)
          return flatten(cells).map(c => c.id)
        }
        break
      }
      default:
        return super._resolve(s)
    }
  }

  _getAffected (cell) {
    let affected = super._getAffected(cell)
    // Note: in addition to explicit dependencies of sheet cells
    // we add all cells that depend on this cell via a cell or range expression
    if (cell.isSheetCell()) {
      let cells = this._sheetCellOuts[cell.id]
      if (cells) cells.forEach(cell => affected.push(cell.id))
    }
    return affected
  }
}
