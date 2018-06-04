// TODO: apart from the dependency to the type system this is pretty independent now
// With stencilas type system extracted into its own repo
// we could move this class into stencile-mini, which would be more consistent
// with other context implementations.
import { parse } from 'stencila-mini'
import { coerceArray, pack } from './types'

const INPUT_TYPES = new Set(['var', 'call'])

export default class MiniContext {
  constructor (host) {
    this._host = host
  }

  get id () {
    return 'mini'
  }

  async compile (cell) {
    return this._compile(cell)
  }

  async execute (cell) {
    return this._execute(cell)
  }

  // called during evaluation of mini expressions
  async _callFunction (funcNode, args, namedArgs) {
    return this._host.callFunction(funcNode, args, namedArgs)
  }

  _compile (cell) {
    const code = cell.code
    if (!code) {
      Object.assign(cell, {
        inputs: [],
        outputs: [],
        messages: [],
        tokens: [],
        nodes: []
      })
      return cell
    }
    let expr = parse(code)
    let inputs = []
    let outputs = []
    let tokens, nodes
    let messages = []
    if (expr.syntaxError) {
      messages.push({
        type: 'error',
        message: expr.syntaxError.msg
      })
    }
    const _inputs = new Set()
    expr.nodes.forEach(n => {
      if (INPUT_TYPES.has(n.type)) {
        const name = n.name
        // making sure that inputs are not added twice
        if (!_inputs.has(name)) {
          inputs.push({name})
          _inputs.add(name)
        }
      }
    })
    if (expr.name) {
      const name = expr.name
      outputs.push({name})
    }
    if (expr.tokens) {
      // some tokens are used for code highlighting
      // some for function documentation
      tokens = expr.tokens
    }

    nodes = []
    expr.nodes.forEach((n) => {
      if (n.type === 'call') {
        let args = n.args.map((a) => {
          return {
            start: a.start,
            end: a.end
          }
        }).concat(n.namedArgs.map((a) => {
          return {
            start: a.start,
            end: a.end,
            name: a.name
          }
        }))
        let node = {
          type: 'function',
          name: n.name,
          start: n.start,
          end: n.end,
          args
        }
        nodes.push(node)
      }
    })

    Object.assign(cell, {
      type: 'cell',
      code,
      inputs,
      outputs,
      messages,
      tokens,
      nodes,
      _expr: expr
    })
    return cell
  }

  async _execute (cell) {
    let expr = cell._expr || parse(cell.code)
    // don't evaluate the expression in presence of an syntax error
    if (expr.syntaxError) {
      return Promise.resolve(cell)
    }
    const outputName = expr.name
    let adapter = new _MiniContextAdapter(this, cell.inputs)
    let value = await expr.evaluate(adapter)
    if (adapter.messages.length > 0) {
      cell.messages = adapter.messages
    }
    // HACK: Mini allows only one output
    let output = {value}
    if (outputName) {
      output.name = outputName
    }
    cell.outputs = [output]
    return cell
  }
}

// an adapter between mini and the context
// used to provide data, and
class _MiniContextAdapter {
  constructor (miniContext, inputs) {
    this.miniContext = miniContext
    let _inputs = new Map()
    inputs.forEach(i => _inputs.set(i.name, i.value))
    this.inputs = _inputs
    this.messages = []
  }

  resolve (name) {
    return this.inputs.get(name)
  }

  // coerce and pack
  pack (value, ctx) {
    if (ctx === 'array') {
      return coerceArray(value)
    }
    return pack(value)
  }

  unpack (val) {
    // TODO: better understand if it is ok to make this robust
    // by guarding undefined values, and not obfuscating an error occurring elsewhere
    // it happened whenever undefined is returned by a called function
    if (!val) return undefined
    return val.data
  }

  async callFunction (name, args, namedArgs) {
    let func = this.inputs.get(name)
    if (!func) {
      throw new Error('Function not provided.')
    }
    let res = await this.miniContext._callFunction(func, args, namedArgs)
    this.messages.concat(res.messages)
    return res.value
  }
}
