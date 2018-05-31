// These characters will be replaced. Add more if needed.
const INVALID_ID_CHARACTERS = '[^A-Za-z0-9]'
const TICK = '\''.charCodeAt(0)

/*
  Replaces all characters that are invalid in a variable identifier.

  Note: replacing characters one-by-one retains the original length or the string
  which is desired as this does avoid source-mapping. E.g. when a runtime error
  occurs, the error location can be applied to the original source code without
  any transformation.
*/
export default function toIdentifier (str, c = '_') {
  let firstIsTick = (str.charCodeAt(0) === TICK)
  str = str.replace(new RegExp(INVALID_ID_CHARACTERS, 'g'), c)
  // ATTENTION: for transclusion symbols which start with a tick
  // we want to add character that separates the transpiled id
  // from a potentially previous one
  if (firstIsTick) {
    return ' ' + str.slice(1)
  } else {
    return str
  }
}
