import { tableHelpers } from 'substance'
import { qualifiedId } from './engineHelpers'

const getIndexesFromRange = tableHelpers.getIndexesFromRange

/*
 * A class representing symbols used in Stencila Cells to reference other cells, or ranges.
 *
 * Examples:
 *
 * - `x` or `'My Document'!x` (variable)
 * - `A1` or `'My Sheet'!A1` (cell)
 * - `A1:B10` or `'My Sheet'!A1:B10` (range)
 *
 */
export default class CellSymbol {
  /*
   * @param {Symbol} s the parsed symbol
   * @param {string} docId id of the target document where the symbol can be resolved
   * @param {Cell} cell the owner cell which has this symbol as an input dependency
   */
  constructor (type, name, docId, cell) {
    // 'var' | 'cell' | 'range'
    this.type = type
    // For example 'x', 'A1', 'A1:B10'
    this.name = name
    // id of the document which is owning the cell
    this.docId = docId
    // a qualified id
    this.id = qualifiedId(docId, name)
    // a link to the owning cell
    this.cell = cell

    // only used for cell or range symbols
    this.startRow = null
    this.startCol = null
    this.endRow = null
    this.endCol = null

    this.update()
  }

  update () {
    const { type, name } = this
    if (type === 'cell') {
      let { startRow, startCol } = getIndexesFromRange(name)
      this.startRow = this.endRow = startRow
      this.startCol = this.endCol = startCol
    } else if (type === 'range') {
      let [start, end] = name.split(':')
      let { startRow, startCol, endRow, endCol } = getIndexesFromRange(start, end)
      this.startRow = startRow
      this.startCol = startCol
      this.endRow = endRow
      this.endCol = endCol
    }
  }

  toString () {
    return this.id
  }
}
