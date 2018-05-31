import { isString } from 'substance'

/*
  Derives the qualified id of a cell.
*/
export default function qualifiedId (doc, cell) {
  let cellId = isString(cell) ? cell : cell.id
  if (doc) {
    let docId = isString(doc) ? doc : doc.id
    return `${docId}!${cellId}`
  } else {
    return cellId
  }
}
