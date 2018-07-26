import { isString, EventEmitter, flatten, forEach, tableHelpers } from 'substance'
import { CellError, RuntimeError, SyntaxError } from './CellErrors'
import { UNKNOWN, ANALYSED, READY, cellStateToInteger } from './CellStates'
import CellSymbol from './CellSymbol'
import { parseValue, qualifiedId as _qualifiedId } from './engineHelpers'
import EngineCellGraph from './EngineCellGraph'
import Sheet from './Sheet'
import Document from './Document'
import { coerceArray, pack } from './types'

/**
  The Engine implements the Stencila Execution Model.

  The Engine can be run independently, and thus has its own internal model.

  There are two types of resources containing cells, Documents and Sheets.
  Every document defines a variable scope. Variables are produced by cells.
  A document has an id but also a human readable name.
  Sheets have a tabular layout, while Documents have a sequential layout.

  Document cells can define variables which can be referenced within the same document,
  like in `x + 1`.

  Sheet cells can be referenced via cell- and range expressions, such as
  `A1`, or `A1:B10`.

  Across documents and sheets, cells are referenced using a transclusion syntax, prefixed with the document id or the document name, such as in
  `'My Document'!x` or `sheet1!A1:B10`.
*/
export default class Engine extends EventEmitter {
  constructor (context) {
    super()

    if (!context) throw new Error('context is required')
    this.context = context

    this._docs = {}
    this._graph = new EngineCellGraph(this)

    // for every (actionable) cell there is information what to do next
    // There are several steps that need to be done, to complete a cell:
    // - code analysis (context)
    // - registration of inputs/output (graph)
    // - cell evaluation (context)
    // - validation (engine)
    // - graph update
    this._nextActions = new Map()
    this._currentActions = new Map()
  }

  runOnce () {
    const self = this
    return new Promise(resolve => {
      function step () {
        if (self._needsUpdate()) {
          self.cycle().then(step)
        } else {
          resolve()
        }
      }
      step()
    })
  }

  cycle () {
    return Promise.all(this._cycle())
  }

  _needsUpdate () {
    const graph = this._graph
    if (graph.needsUpdate()) return true
    const nextActions = this._nextActions
    if (nextActions.size === 0) return false
    // update is required if there is an action that has not been suspended
    for (let [, a] of nextActions) {
      if (!a.suspended) return true
    }
    return false
  }

  runForEver (refreshInterval) {
    // TODO: does this only work in the browser?
    if (this._runner) {
      clearInterval(this._runner)
    }
    this._runner = setInterval(() => {
      if (this.needsUpdate()) {
        this._cycle()
      }
    }, refreshInterval)
  }

  run (interval) {
    this.runForEver(interval)
  }

  /*
    Registers a document via id.

    @param {object} data
      - `type`: 'document' | 'sheet'
      - `name`: a human readable name used for transclusions
      - `columns`: (for sheets) initial column data
      - 'sequence': (for documents) initial order of cells
  */
  addDocument (data) {
    let doc = new Document(this, data)
    this._registerResource(doc)
    return doc
  }

  addSheet (data) {
    let sheet = new Sheet(this, data)
    this._registerResource(sheet)
    return sheet
  }

  dump () {
    let resources = []
    forEach(this._docs, (doc, id) => {
      resources.push(doc.dump())
    })
    return {
      resources
    }
  }

  hasResource (id) {
    return this._docs.hasOwnProperty(id)
  }

  getResource (id) {
    return this._docs[id]
  }

  needsUpdate () {
    return this._nextActions.size > 0 || this._graph.needsUpdate()
  }

  _cycle () {
    let res = []
    const graph = this._graph
    const nextActions = this._nextActions
    if (nextActions.size > 0) {
      // console.log('executing cycle')
      // clearing next actions so that we can record new next actions
      this._nextActions = new Map()

      // group actions by type
      let actions = {
        analyse: [],
        register: [],
        evaluate: [],
        update: []
      }
      nextActions.forEach(a => actions[a.type].push(a))
      actions.update.forEach(a => {
        if (a.errors && a.errors.length > 0) {
          graph.addErrors(a.id, a.errors)
        } else {
          graph.setValue(a.id, a.value)
        }
      })
      actions.register.forEach(a => {
        let cell = graph.getCell(a.id)
        graph.setInputsOutputs(cell.id, a.inputs, a.output)
      })

      this._updateGraph()

      let A = actions.analyse.map(a => this._analyse(a))
      let B = actions.evaluate.map(a => {
        let cell = graph.getCell(a.id)
        // This is necessary because we make sure the cell still exists
        if (cell) {
          if (this._canRunCell(cell)) {
            return this._evaluate(a)
          } else {
            // otherwise keep this as a next action
            a.suspended = true
            this._setAction(a.id, a)
            return false
          }
        } else {
          return false
        }
      })
      res = A.concat(B)
    } else if (graph.needsUpdate()) {
      this._updateGraph()
    }
    return res
  }

  getNextActions () {
    return this._nextActions
  }

  _registerResource (doc) {
    const id = doc.id
    if (this._docs.hasOwnProperty(id)) throw new Error(`document with id ${id} already exists`)
    this._docs[id] = doc
    doc._registerCells()
  }

  /*
    Registers a cell.

    A cell is registered independent from the topology it resides in.

    Cells are treated differently w.r.t. their parent document.

    For instance, in a document cells can be block expressions,
    and can define a variable. In a sheet every cell must be a simple expression
    and it is is assigned to a variable implicitly (such as `sheet1!A1`).
  */
  _registerCell (cell) {
    this._graph.addCell(cell)
    this._resetCell(cell)
  }

  /*
    Removes a cell from the engine.
  */
  _unregisterCell(cellOrId) { // eslint-disable-line
    let id = isString(cellOrId) ? cellOrId : cellOrId.id
    let cell = this._graph.getCell(id)
    if (cell) {
      this._graph.removeCell(id)
    }
  }

  _updateCell (id, cellData) {
    const graph = this._graph
    let cell = graph.getCell(id)
    Object.assign(cell, cellData)
    cell.status = UNKNOWN
    this._setAction(id, {
      id,
      type: 'analyse'
    })
  }

  _resetCell (cell) {
    const id = cell.id
    cell.status = UNKNOWN
    this._setAction(id, {
      id,
      type: 'analyse'
    })
  }

  _sendUpdate (type, cells) {
    let cellsByDocId = {}
    cells.forEach(cell => {
      let _cells = cellsByDocId[cell.docId]
      if (!_cells) _cells = cellsByDocId[cell.docId] = []
      _cells.push(cell)
    })
    this.emit('update', type, cellsByDocId)
  }

  _updateGraph () {
    const graph = this._graph
    let updatedIds = graph.update()
    let cells = new Set()
    updatedIds.forEach(id => {
      let cell = graph.getCell(id)
      if (cell) {
        // WIP: adding support for RangeCells
        // Instead of registering an evaluation, we just update the graph.
        // TODO: this requires another cycle to propagate the result of the RangeCell,
        // which would not be necessary in theory
        if (cell.status === READY) {
          this._setAction(cell.id, {
            type: 'evaluate',
            id: cell.id
          })
        }
        cells.add(cell)
      }
    })
    if (cells.size > 0) {
      this._sendUpdate('state', cells)
    }
  }

  _analyse (action) {
    const graph = this._graph
    const id = action.id
    const cell = graph.getCell(id)
    // if the cell has been removed in the meantime
    if (!cell) return
    // clear all errors which are not managed by the CellGraph
    cell.clearErrors(e => {
      return e.type !== 'graph'
    })
    // in case of constants, casting the string into a value,
    // updating the cell graph and returning without further evaluation
    if (cell.isConstant()) {
      // TODO: we might want to coerce to the type from the cell
      let value = pack(parseValue(cell.source))
      // constants can't have inputs, so deregister them
      if (cell.inputs && cell.inputs.size > 0) {
        graph.setInputs(id, new Set())
      }
      // constants can't have errors at this stage (later on maybe validation errors)
      if (cell.errors.length > 0) {
        graph.clearErrors(id)
      }
      graph.setValue(id, value)
      return
    }
    // TODO: we need to reset the cell status. Should we let CellGraph do this?
    cell.status = UNKNOWN
    // leave a mark that we are currently running this action
    this._currentActions.set(id, action)

    const lang = cell.getLang()
    const isExpr = cell.isSheetCell()
    const transpiledSource = cell.transpiledSource
    return this.context.compile({
      id: cell.id,
      code: transpiledSource,
      lang,
      expr: isExpr
    }).then(res => {
      if (this._isSuperseded(id, action)) {
      // console.log('action has been superseded')
        return
      }
      this._currentActions.delete(id)
      // storing the cell representation of the context
      cell.data = res
      // make sure that the cell id is set
      res.id = id

      // Note: treating all errors coming from analyseCode() as SyntaxErrors
      // TODO: we might want to be more specific here
      if (res.messages && res.messages.length > 0) {
        // TODO: we should not need to set this manually
        cell.status = ANALYSED
        graph.addErrors(id, res.messages.map(err => {
          console.error(err)
          if (err instanceof CellError) {
            return err
          } else {
            return new SyntaxError(err.message)
          }
        }))
      }
      // console.log('analysed cell', cell, res)

      // mapping the result from the context to the engine's internal format
      let inputs = new Set()
      // TODO: at some point we want to allow for multiple outputs
      let output = null
      if (res.inputs.length > 0 || res.outputs.length > 0) {
        // transform the extracted symbols into fully-qualified symbols
        // e.g. in `x` in `sheet1` is compiled into `sheet1.x`
        // At this point symbols are bound to a specific scope
        ({ inputs, output } = this._compileSymbols(res, cell))

        // TODO: this was originally here to make the app more robust
        // but trying to get rid it
        // try {
        //   ({ inputs, output } = this._compileSymbols(res, cell))
        // } catch (error) {
        //   console.error(error)
        //   cell.status = ANALYSED
        //   graph.addErrors(id, [new SyntaxError('Invalid syntax')])
        // }
      }
      this._setAction(id, {
        type: 'register',
        id,
        // Note: these symbols are in plain-text analysed by the context
        // based on the transpiled source
        inputs,
        output
      })
    })
  }

  _evaluate (action) {
    const graph = this._graph
    const id = action.id
    const cell = graph.getCell(id)
    cell.clearErrors(e => {
      return e.type !== 'graph'
    })
    // console.log('evaluating cell', cell.toString())
    this._currentActions.set(id, action)
    // EXPERIMENTAL: remove 'autorun' so that the cell is not updated forever
    delete cell.autorun
    // prepare inputs for the context
    this._getInputValues(cell)
    // execute
    let p = this.context.execute(cell.data).then(res => {
      if (this._isSuperseded(id, action)) {
      // console.log('action has been superseded')
        return
      }
      this._currentActions.delete(id)
      let value
      let output = res.outputs[0]
      if (output) value = output.value
      this._setAction(id, {
        type: 'update',
        id,
        errors: res.messages,
        value
      })
    })
    return p.catch(err => {
      console.error(err)
      graph.addError(id, new RuntimeError('Internal error', err))
    })
  }

  // create symbols that can be passed to the cell graph
  _compileSymbols (res, cell) {
    const sourceSymbolMapping = cell._source.symbolMapping
    const docId = cell.docId
    const symbolMapping = {}
    let inputs = new Set()
    // Note: the inputs here are given as mangledStr
    // typically we have detected these already during transpilation
    // Let's wait for it to happen where this is not the case
    res.inputs.forEach(input => {
      let name = input.name
      // HACK
      // TODO: when do we need this?
      if (isString(input)) {
        console.error('FIXME: input is in an unexpected format')
        name = input
      }
      let symbol = sourceSymbolMapping[name]
      // Note: the engine does not track function names as symbols
      // which are returned as input
      // in this case we create a locally bound symbol
      if (!symbol) {
        symbol = new CellSymbol('var', name, docId, cell)
      } else {
        // if there is a scope given explicily try to lookup the doc
        // otherwise it is a local reference, i.e. within the same document as the cell
        let targetDocId = symbol.scope ? this._lookupDocumentId(symbol.scope) : docId
        symbol = new CellSymbol(symbol.type, symbol.name, targetDocId, cell)
      }
      symbolMapping[name] = symbol
      inputs.add(symbol)
    })
    cell._symbolMapping = symbolMapping
    // turn the output into a qualified id
    let output = res.outputs[0]
    if (output) output = _qualifiedId(docId, output.name)
    return { inputs, output }
  }

  /*
    Provides packed values stored in a hash by their name.
    Ranges and transcluded symbols are stored via their mangled name.

    > Attention: this requires that cell code is being transpiled accordingly.

    ```
    $ graph._getInputValues(['x', 'sheet1!A1:B3'])
    {
      'x': ...,
      'sheet1_A1_B3': ...
    }
    ```
  */
  _getInputValues (cell) {
    const graph = this._graph
    for (let input of cell.data.inputs) {
      let symbolMapping = cell._symbolMapping
      let s = symbolMapping[input.name]
      let val
      switch (s.type) {
        case 'cell': {
          let sheet = this._docs[s.docId]
          if (sheet) {
            let cell = sheet.cells[s.startRow][s.startCol]
            val = cell.value
          }
          break
        }
        case 'range': {
          let sheet = this._docs[s.docId]
          if (sheet) {
            val = _getValueForRange(sheet, s.startRow, s.startCol, s.endRow, s.endCol)
          }
          break
        }
        default:
          val = graph.getValue(s) || graph._globals.get(s.name)
      }
      input.value = val
    }
  }

  _lookupDocumentId (name) {
    for (var id in this._docs) { // eslint-disable-line guard-for-in
      let doc = this._docs[id]
      if (doc.name === name || id === name) {
        return doc.id
      }
    }
  }

  _lookupDocument (name) {
    let docId = this._lookupDocumentId(name)
    return this._docs[docId]
  }

  _canRunCell (cell) {
    if (cell.hasOwnProperty('autorun')) {
      return cell.autorun
    }
    return cell.doc.autorun
  }

  _allowRunningCellAndPredecessors (id) {
    const graph = this._graph
    let predecessors = graph._getPredecessorSet(id)
    this._allowRunningCell(id, true)
    predecessors.forEach(_id => {
      this._allowRunningCell(_id)
    })
  }

  _allowRunningCell (id, reset) {
    const graph = this._graph
    let cell = graph.getCell(id)
    cell.autorun = true
    if (reset && cellStateToInteger(cell.status) > cellStateToInteger(ANALYSED)) {
      cell.status = ANALYSED
      graph._structureChanged.add(id)
    }
    let action = this._nextActions.get(id)
    if (action) {
      delete action.suspended
    }
  }

  _allowRunningAllCellsOfDocument (docId) {
    const graph = this._graph
    let doc = this._docs[docId]
    let cells = doc.getCells()
    if (doc instanceof Sheet) {
      cells = flatten(cells)
    }
    let ids = new Set()
    cells.forEach(cell => {
      ids.add(cell.id)
    })
    cells.forEach(cell => {
      graph._getPredecessorSet(cell.id, ids)
    })
    ids.forEach(id => {
      this._allowRunningCell(id)
    })
  }

  _setAction (id, action) {
    let currentAction = this._currentActions.get(id)
    if (!currentAction || currentAction.type !== action.type) {
      // console.log('Scheduling action', id, action)
      this._nextActions.set(id, action)
      // supersede the current action
      this._currentActions.delete(id)
    }
  }

  _isSuperseded (id, action) {
    return (this._currentActions.get(id) !== action)
  }

  // EXPERIMENTAL: allow to set some global values
  // This is not dynamic yet, i.e. cells can not produce globals
  // It is used for registering global library functions
  _addGlobal (name, value) {
    this._graph._globals.set(name, value)
  }
}

function getCellValue (cell) {
  return cell ? cell.value : undefined
}

function _getArrayValueForCells (cells) {
  let arr = cells.map(c => getCellValue(c))
  return coerceArray(arr)
}

/*
  Gathers the value for a cell range
  - `A1:A1`: value
  - `A1:A10`: array
  - `A1:E1`: array
  - `A1:B10`: table

  TODO: we should try to avoid using specific coercion here
*/
function _getValueForRange (sheet, startRow, startCol, endRow, endCol) {
  let matrix = sheet.getCells()
  let val
  // range is a single cell
  // NOTE: with the current implementation of parseSymbol this should not happen
  /* istanbul ignore if */
  if (startRow === endRow && startCol === endCol) {
    val = getCellValue(matrix[startRow][startCol])
  // range is 1D
  } else if (startRow === endRow) {
    let cells = matrix[startRow].slice(startCol, endCol + 1)
    val = _getArrayValueForCells(cells)
  } else if (startCol === endCol) {
    let cells = []
    for (let i = startRow; i <= endRow; i++) {
      cells.push(matrix[i][startCol])
    }
    val = _getArrayValueForCells(cells)
  // range is 2D (-> creating a table)
  } else {
    let data = {}
    for (let j = startCol; j <= endCol; j++) {
      let name = sheet.getColumnName(j) || tableHelpers.getColumnLabel(j)
      let cells = []
      for (let i = startRow; i <= endRow; i++) {
        cells.push(matrix[i][j])
      }
      // TODO: why is it necessary to extract the primitive value here, instead of just using getCellValue()?
      data[name] = cells.map(c => {
        let val = getCellValue(c)
        if (val) {
          return val.data
        } else {
          return undefined
        }
      })
    }
    val = {
      // Note: first 'type' is for packing
      // and second type for diambiguation against other complex types
      type: 'table',
      data: {
        type: 'table',
        data,
        columns: endCol - startCol + 1,
        rows: endRow - startRow + 1
      }
    }
  }
  return val
}
