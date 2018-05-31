import extractSymbols from './extractSymbols'

/*
  Transpiles a piece of source code so that it does not contain
  Transclusion expressions anymore, which are usually not valid in common languages.

  @param {string} code
  @param {object} map storage for transpiled symbols so that they can be mapped back later on
  @result
*/
export default function transpile (code, map = {}) {
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
