import toIdentifier from './toIdentifier'

export default function createSymbol (m) {
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
