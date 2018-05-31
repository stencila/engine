import transformRange from './transformRange'

export default function recordTransformations (cell, dim, pos, count, affectedCells, visited) {
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
