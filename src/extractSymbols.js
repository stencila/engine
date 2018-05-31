import { REF } from './engineConstants'
import createSymbol from './createSymbol'

export default function extractSymbols (code) {
  if (!code) return []
  let re = new RegExp(REF, 'g')
  let symbols = []
  let m
  while ((m = re.exec(code))) {
    symbols.push(createSymbol(m))
  }
  return symbols
}
