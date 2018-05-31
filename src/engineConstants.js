export const BROKEN_REF = '#BROKEN_REF'
/*
  Matchers for transclusions and cell references

  Examples:
  - A1
  - A1:B10
  - Foo!A1
  - doc1!x
  - 'My Sheet'!A1:B10
  - 'My Doc'.x
*/
export const ID = '([_A-Za-z][_A-Za-z0-9]*)'
export const NAME = "[']([^']+)[']"
export const CELL_ID = '([A-Z]+[1-9][0-9]*)'
export const EXPRESSION_CELL = '^\\s*' + ID + '?\\s*='
export const EXPRESSION_CELL_RE = new RegExp(EXPRESSION_CELL)
/*
  A reference can point to a variable, a cell, or a range inside the same document
  or another one. To avoid matches inside of other symbols, '\b' (word boundary) is used in the expression.
  `[']` can not be used in combination with '\b'.get

  ```
   ( ( \b ID | ['].+['] )[!] | \b)( CELL_ID([:]CELL_ID)? | ID )
  ```
*/
export const REF = '(?:(?:(?:(?:\\b' + ID + '|' + NAME + '))[!])|\\b)(?:' + CELL_ID + '(?:[:]' + CELL_ID + ')?|' + ID + ')'
export const REF_RE = new RegExp(REF)
