export default function parseValue (text) {
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
