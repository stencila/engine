import { isString } from 'substance'
import { UNKNOWN, cellStateToString } from './CellStates'
import { transpile, isExpression, qualifiedId } from './engineHelpers'

export default class Cell {
  constructor (doc, cellData) {
    const { id, lang, source, status, inputs, output, value, errors, hasSideEffects, next, prev } = cellData
    this.doc = doc

    // Attention: the given cell id is not necessarily globally unique
    // thus, we derive a unique id using the document id and the node id
    // localId is used later to be able to map back to the associated node
    // TODO: I would rather go for only one id, and always have a doc
    if (doc) {
      let docId = this.docId = doc.id
      // is the id already a qualified id?
      if (id.startsWith(docId)) {
        this.id = id
        // ATTENTION: assuming that the qualified id is joining
        // the doc id and the node id with a single character (e.g. '!')
        this.unqualifiedId = id.slice(docId.length + 1)
      } else {
        this.id = qualifiedId(doc, cellData)
        this.unqualifiedId = id
      }
    } else {
      this.docId = null
      this.id = id
      this.unqualifiedId = id
    }

    this.lang = lang

    /*
     The source code is transpiled to an object
     - original
     - transpiledSource
     - symbols
     - symbolMapping: map from transpiled names to original names
     - isContant
    */
    this._source = this._transpile(source)

    // managed by CellGraph
    this.status = status || UNKNOWN
    // a set of symbols ('x', 'A1', 'A1:B10', 'doc1!x', 'sheet1!A1', 'sheet1!A1:A10', 'sheet1!foo')
    this.inputs = new Set(inputs || [])
    // an output symbol (typically only used for document cells)
    this.output = output
    // one or many CellErrors
    this.errors = errors || []
    // the last computed value
    this.value = value
    // for cells with side effects
    this.hasSideEffects = Boolean(hasSideEffects)
    // for cells in a linear model
    // this is particularly important for cells with side effects
    this.next = next
    this.prev = prev
    // used by CellGraph
    this.level = 0
    // TODO: maybe we want to keep some stats, e.g. time of last evaluation, duration of last evaluation etc.
    this.stats = {}
  }

  clearErrors (filter) {
    if (isString(filter)) {
      const type = filter
      filter = (e) => {
        return e.type === type
      }
    }
    this.errors = this.errors.filter(e => !filter(e))
  }

  addErrors (errors) {
    this.errors = this.errors.concat(errors)
  }

  hasErrors () {
    return this.errors.length > 0
  }

  hasError (type) {
    for (let i = 0; i < this.errors.length; i++) {
      if (this.errors[i].type === type) return true
    }
    return false
  }

  get state () {
    console.warn('DEPRECATED: use cellState.status instead.')
    return this.status
  }

  hasOutput () {
    return Boolean(this.output)
  }

  hasValue () {
    return Boolean(this.value)
  }

  getValue () {
    return this.value
  }

  getLang () {
    return this.lang || (this.doc ? this.doc.lang : 'mini')
  }

  get source () {
    return this._source.original
  }

  set source (source) {
    this._source = this._transpile(source)
  }

  get transpiledSource () {
    return this._source.transpiled
  }

  get symbolMapping () {
    return this._source.symbolMapping
  }

  get symbols () {
    return this._source.symbols
  }

  isConstant () {
    return this._source.isConstant
  }

  isSheetCell () {
    return false
  }

  toString () {
    // sheet1!A1 <- { ... source }
    let parts = []
    if (this.output) {
      parts.push(this.output)
      parts.push(' <- ')
    } else {
      parts.push(this.id)
      parts.push(': ')
    }
    parts.push(this._source.original)
    return parts.join('')
  }

  dump () {
    // TODO: to be able to start off from a loaded dump
    // we would need to store more information, such as 'level' etc
    // let inputs = Array.from(this.inputs).map(s => s.dump())
    // let output
    // if (this.output) output = this.output.dump()
    return {
      id: this.unqualifiedId,
      lang: this.lang,
      source: this._source.original,
      status: cellStateToString(this.status),
      // inputs,
      // output,
      errors: this.errors,
      value: this.value
    }
  }

  _getStatusString () {
    return cellStateToString(this.status)
  }

  _transpile (source) {
    let original = source
    let transpiled
    let symbols = []
    let symbolMapping = {}
    let isConstant = false
    // in sheets there is a distinction between constants and
    // expressions. Typically, expression start with an '='.
    // In addition we allow cells to register an alias such as 'x = 1'
    // Then the cell can be addressed either via cell notation, such as 'A1',
    // or by name 'x'
    if (this.isSheetCell()) {
      let m = isExpression(source)
      if (m) {
        // there is an output name if the user writes 'x = ...'
        let output = m[1]
        // if the cell is an expression without an output name
        // we must transpile the source, because a leading '='
        // is not valid in all of the languages we consider
        if (!output) {
          let L = m[0].length
          let prefix = new Array(L)
          prefix.fill(' ')
          source = prefix + source.slice(L)
        }
      } else {
        isConstant = true
      }
    }
    if (isConstant) {
      transpiled = original
    } else if (source) {
      let res = transpile(source)
      transpiled = res.transpiledCode
      symbols = res.symbols
      symbolMapping = res.map
    }

    return {
      original,
      transpiled,
      symbols,
      symbolMapping,
      isConstant
    }
  }
}
