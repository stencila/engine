import { flatten, tableHelpers } from 'substance'
import CellGraph from './CellGraph'

export default class EngineCellGraph extends CellGraph {
  constructor (engine) {
    super()

    this._engine = engine
  }

  _getDoc (s) {
    return this._engine._docs[s.docId]
  }

  _setInputs (cell, newInputs) {
    let oldInputs = cell.inputs
    super._setInputs(cell, newInputs)
    oldInputs.forEach(s => {
      if (s.type !== 'var') {
        let sheet = this._getDoc(s)
        if (sheet) {
          sheet._removeDep(s)
        }
      }
    })
    newInputs.forEach(s => {
      if (s.type !== 'var') {
        let sheet = this._getDoc(s)
        if (sheet) {
          sheet._addDep(s)
        }
      }
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
      cell.deps.forEach(s => affected.push(s.cell.id))
    }
    return affected
  }
}
