import { tableHelpers } from 'substance'
import { BROKEN_REF } from './engineConstants'
import qualifiedId from './qualifiedId'
import toIdentifier from './toIdentifier'

export default function applyCellTransformations (cell) {
  let symbols = Array.from(cell.inputs).sort((a, b) => a.startPos - b.startPos)
  let source = cell._source
  let offset = 0
  for (let i = 0; i < symbols.length; i++) {
    let s = symbols[i]
    let update = s._update
    if (!update) continue
    delete s._update
    // compute derived content according to parameters
    let oldName = s.name
    let oldScope = s.scope
    let oldOrigStr = s.origStr
    let oldMangledStr = s.mangledStr
    let newName = oldName
    let newScope = oldScope
    let newOrigStr = oldOrigStr
    let newMangledStr = oldMangledStr
    switch (update.type) {
      case 'insertRows':
      case 'deleteRows': {
        s.startRow = update.start
        s.endRow = update.end
        newName = getCellSymbolName(s)
        newOrigStr = oldOrigStr.replace(oldName, newName)
        newMangledStr = oldMangledStr.replace(toIdentifier(oldName), toIdentifier(newName))
        break
      }
      case 'insertCols':
      case 'deleteCols': {
        s.startCol = update.start
        s.endCol = update.end
        newName = getCellSymbolName(s)
        newOrigStr = oldOrigStr.replace(oldName, newName)
        newMangledStr = oldMangledStr.replace(toIdentifier(oldName), toIdentifier(newName))
        break
      }
      case 'broken': {
        s.type = 'var'
        s.startRow = s.startCol = s.endRow = s.endCol = null
        newName = BROKEN_REF
        newOrigStr = BROKEN_REF
        newMangledStr = BROKEN_REF
        break
      }
      case 'rename': {
        if (oldScope) {
          newOrigStr = oldOrigStr.replace(oldScope, update.scope)
          newMangledStr = oldMangledStr.replace(toIdentifier(oldScope), toIdentifier(update.scope))
        }
        break
      }
      default:
        throw new Error('Illegal state')
    }
    let newStartPos = s.startPos + offset
    let newEndPos = newStartPos + newOrigStr.length
    let newSource = source.original.slice(0, s.startPos + offset) + newOrigStr + source.original.slice(s.endPos + offset)
    let newTranspiled = source.transpiled.slice(0, s.startPos + offset) + newMangledStr + source.transpiled.slice(s.endPos + offset)

    // finally write the updated values
    s.name = newName
    s.id = qualifiedId(s.docId, newName)
    s.scope = newScope
    s.origStr = newOrigStr
    s.mangledStr = newMangledStr
    s.startPos = newStartPos
    s.endPos = newEndPos
    source.original = newSource
    source.transpiled = newTranspiled
    source.symbolMapping[newMangledStr] = s
    delete source.symbolMapping[oldMangledStr]
    // update the offset if the source is getting longer because of this change
    // this has an effect on all subsequent symbols
    offset += newOrigStr.length - oldOrigStr.length
  }
}

function getCellSymbolName (s) {
  let newName = tableHelpers.getCellLabel(s.startRow, s.startCol)
  if (s.type === 'range') {
    newName += ':' + tableHelpers.getCellLabel(s.endRow, s.endCol)
  }
  return newName
}
