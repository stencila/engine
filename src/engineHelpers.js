import { isNumber, isString, tableHelpers } from 'substance'
import { type, gather } from './value'

export const BROKEN_REF = '#BROKEN_REF'

/*
  Matchers for transclusions and cell references

  Examples:
  - A1
  - A1:B10
  - Foo!A1
  - doc1!x
  - 'My Sheet'!A1:B10
  - 'My Doc'.x
*/
const ID = '([_A-Za-z][_A-Za-z0-9]*)'
const NAME = "[']([^']+)[']"
const CELL_ID = '([A-Z]+[1-9][0-9]*)'
// These characters will be replaced. Add more if needed.
const INVALID_ID_CHARACTERS = '[^A-Za-z0-9]'
const EXPRESSION_CELL = '^\\s*' + ID + '?\\s*='

/*
  A reference can point to a variable, a cell, or a range inside the same document
  or another one. To avoid matches inside of other symbols, '\b' (word boundary) is used in the expression.
  `[']` can not be used in combination with '\b'.get

  ```
   ( ( \b ID | ['].+['] )[!] | \b)( CELL_ID([:]CELL_ID)? | ID )
  ```
*/
const REF = '(?:(?:(?:(?:\\b' + ID + '|' + NAME + '))[!])|\\b)(?:' + CELL_ID + '(?:[:]' + CELL_ID + ')?|' + ID + ')'
const REF_RE = new RegExp(REF)
const EXPRESSION_CELL_RE = new RegExp(EXPRESSION_CELL)

/*
  Transpiles a piece of source code so that it does not contain
  Transclusion expressions anymore, which are usually not valid in common languages.

  @param {string} code
  @param {object} map storage for transpiled symbols so that they can be mapped back later on
  @result
*/
export function transpile (code, map = {}) {
  if (!code) return code
  let symbols = extractSymbols(code)
  // Note: we are transpiling without changing the length of the original source
  // i.e. `'My Sheet'!A1:B10` is transpiled into `_My_Sheet__A1_B10`
  // thus the symbol locations won't get invalid by this step
  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i]
    code = code.substring(0, s.startPos) + s.mangledStr + code.slice(s.endPos)
    let transpiledName = s.mangledStr
    map[transpiledName] = s
  }
  return code
}

export function extractSymbols (code) {
  if (!code) return []
  let re = new RegExp(REF, 'g')
  let symbols = []
  let m
  while ((m = re.exec(code))) {
    symbols.push(_createSymbol(m))
  }
  return symbols
}

/*

  - `type`: `variable | cell | range`
  - `id`: a qualified id such as `doc1!x`, `sheet1!A1`, `sheet1!A1:A10`
  - `mangledStr`: not longer than the orignal which is used for transpiledCode
  - `scope`: e.g `doc1`, `sheet1`, `'My Document'`"
  - `symbol`: local symbol id such as `x`, `A1`, `A1:A10`
*/
export function parseSymbol (str) {
  let m = REF_RE.exec(str)
  if (!m) throw new Error('Unrecognised symbol format.')
  return _createSymbol(m)
}

/*
  Derives the qualified id of a cell.
*/
export function qualifiedId (doc, cell) {
  let cellId = isString(cell) ? cell : cell.id
  if (doc) {
    let docId = isString(doc) ? doc : doc.id
    return `${docId}!${cellId}`
  } else {
    return cellId
  }
}

/*
  Replaces all characters that are invalid in a variable identifier.

  Note: replacing characters one-by-one retains the original length or the string
  which is desired as this does avoid source-mapping. E.g. when a runtime error
  occurs, the error location can be applied to the original source code without
  any transformation.
*/
export function toIdentifier (str, c = '_') {
  return str.replace(new RegExp(INVALID_ID_CHARACTERS, 'g'), c)
}

function _createSymbol (m) {
  const text = m[0]
  const startPos = m.index
  const endPos = text.length + startPos
  const mangledStr = toIdentifier(text)
  const scope = m[1] || m[2]
  const anchor = m[3]
  const focus = m[4]
  const varName = m[5]
  let type, name
  if (anchor) {
    if (focus && focus !== anchor) {
      type = 'range'
      name = anchor + ':' + focus
    } else {
      type = 'cell'
      name = anchor
    }
  } else if (varName) {
    type = 'var'
    name = varName
  } else {
    throw new Error('Invalid symbol expression')
  }
  return { type, text, scope, name, mangledStr, startPos, endPos, anchor, focus }
}

export function recordTransformations (cell, dim, pos, count, affectedCells, visited) {
  affectedCells = affectedCells || new Set()
  visited = visited || new Set()
  cell.deps.forEach(s => {
    if (visited.has(s)) return
    visited.add(s)
    let start, end
    if (dim === 0) {
      start = s.startRow
      end = s.endRow
    } else {
      start = s.startCol
      end = s.endCol
    }
    let res = transformRange(start, end, pos, count)
    if (!res) return
    if (res === -1) {
      s._update = { type: 'broken' }
    } else {
      let type = (count < 0 ? 'delete' : 'insert') + (dim === 0 ? 'Rows' : 'Cols')
      s._update = {
        type,
        start: res.start,
        end: res.end
      }
    }
    affectedCells.add(s.cell)
  })
}

export function applyCellTransformations (cell) {
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

function transformRange (start, end, pos, count) {
  if (!count) return false
  if (!isNumber(pos) || !isNumber(count)) throw new Error('pos and count must be integers')
  if (end < pos) return false
  if (count > 0) {
    if (pos <= start) {
      start += count
    }
    if (pos <= end) {
      end += count
    }
  } else {
    // for removal count < 0
    count = -count
    // null means deleted
    if (start >= pos && end < pos + count) return -1
    const x1 = pos
    const x2 = pos + count
    if (x2 <= start) {
      start -= count
      end -= count
    } else {
      if (pos <= start) {
        start = start - Math.min(count, start - x1)
      }
      if (pos <= end) {
        end = end - Math.min(count, end - x1 + 1)
      }
    }
  }
  return { start, end }
}

// TODO: change the naming
// This is used within sheets to distinguish constants and cells with expression
//
export function isExpression (source) {
  return EXPRESSION_CELL_RE.exec(source)
}

function getCellSymbolName (s) {
  let newName = tableHelpers.getCellLabel(s.startRow, s.startCol)
  if (s.type === 'range') {
    newName += ':' + tableHelpers.getCellLabel(s.endRow, s.endCol)
  }
  return newName
}

export function valueFromText (text, preferredType = 'any') {
  const data = _parseText(preferredType, text)
  const type_ = type(data)
  return { type: type_, data }
}

function _parseText (preferredType, text) {
  // guess value
  if (text === 'false') {
    return false
  } else if (text === 'true') {
    return true
  } else if (!isNaN(text)) {
    let _int = Number.parseInt(text, 10)
    if (_int == text) { // eslint-disable-line
      return _int
    } else {
      return Number.parseFloat(text)
    }
  } else {
    return text
  }
}

export { gather }
