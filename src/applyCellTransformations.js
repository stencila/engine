import { tableHelpers } from 'substance'
import { BROKEN_REF } from './engineConstants'

// TODO: need to rethink if it is possible to get rid
// of the redundancy, or have a cleaner way to derive everything after update
export default function applyCellTransformations (cell) {
  let symbols = cell.symbols
  let source = cell._source
  let oldSource = source.original
  let newSource = oldSource
  // ATTENTION: iterating symbols backwards so that code transformation does
  // not invalidate character indexes in symbols
  // For that symbols must be sorted by pos, which they are
  for (let i = symbols.length - 1; i >= 0; i--) {
    let s = symbols[i]
    let update = s._update
    if (!update) continue
    delete s._update
    // compute derived content according to parameters
    let oldName = s.name
    let oldScope = s.scope
    let oldOrigStr = s.origStr
    let newOrigStr = oldOrigStr
    switch (update.type) {
      case 'insertRows':
      case 'deleteRows': {
        s.startRow = update.start
        s.endRow = update.end
        let newName = getCellSymbolName(s)
        newOrigStr = oldOrigStr.replace(oldName, newName)
        break
      }
      case 'insertCols':
      case 'deleteCols': {
        s.startCol = update.start
        s.endCol = update.end
        let newName = getCellSymbolName(s)
        newOrigStr = oldOrigStr.replace(oldName, newName)
        break
      }
      case 'broken': {
        s.type = 'var'
        s.startRow = s.startCol = s.endRow = s.endCol = null
        newOrigStr = BROKEN_REF
        break
      }
      case 'rename': {
        if (oldScope) {
          let newScope = update.scope
          newOrigStr = oldOrigStr.replace(oldScope, newScope)
        }
        break
      }
      default:
        throw new Error('Illegal state')
    }
    newSource = newSource.slice(0, s.startPos) + newOrigStr + newSource.slice(s.endPos)
  }
  if (newSource !== oldSource) {
    cell.source = newSource
  }
}

function getCellSymbolName (s) {
  let newName = tableHelpers.getCellLabel(s.startRow, s.startCol)
  if (s.type === 'range') {
    newName += ':' + tableHelpers.getCellLabel(s.endRow, s.endCol)
  }
  return newName
}
