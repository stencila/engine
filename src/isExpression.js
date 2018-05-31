import { EXPRESSION_CELL_RE } from './engineConstants'

// TODO: change the naming
// This is used within sheets to distinguish constants and cells with expression
export default function isExpression (source) {
  return EXPRESSION_CELL_RE.exec(source)
}
