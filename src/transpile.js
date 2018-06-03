import extractSymbols from './extractSymbols'

/*
  Transpiles a piece of source code so that it does not contain
  Transclusion expressions anymore, which are usually not valid in common languages.

  @param {string} code
  @param {object} map storage for transpiled symbols so that they can be mapped back later on
  @result
*/
export default function transpile (code) {
  if (!code) return code
  let symbols = extractSymbols(code)
  let map = {}
  let transpiledCode = code
  // Note: we are transpiling without changing the length of the original source
  // i.e. `'My Sheet'!A1:B10` is transpiled into `_My_Sheet__A1_B10`
  // thus the symbol locations won't get invalid by this step
  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i]
    transpiledCode = transpiledCode.substring(0, s.startPos) + s.mangledStr + transpiledCode.slice(s.endPos)
    let transpiledName = s.mangledStr
    let key = transpiledName.trim()
    map[key] = s
  }
  return { transpiledCode, symbols, map }
}
