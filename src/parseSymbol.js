import { REF_RE } from './engineConstants'
import createSymbol from './createSymbol'

/*
  - `type`: `variable | cell | range`
  - `id`: a qualified id such as `doc1!x`, `sheet1!A1`, `sheet1!A1:A10`
  - `mangledStr`: not longer than the orignal which is used for transpiledCode
  - `scope`: e.g `doc1`, `sheet1`, `'My Document'`"
  - `symbol`: local symbol id such as `x`, `A1`, `A1:A10`
*/
export default function parseSymbol (str) {
  let m = REF_RE.exec(str)
  if (!m) throw new Error('Unrecognised symbol format.')
  return createSymbol(m)
}
