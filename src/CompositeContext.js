import { ContextError } from './CellErrors'
import { pack, unpack } from './types'

export default class CompositeContext {
  constructor () {
    this._contexts = {}
    this._lang2context = {}
  }

  configure (config) {
    let contexts = {}
    let lang2context = {}
    config.contexts.forEach(spec => {
      let lang = spec.lang
      let id = spec.id
      let ClientClass = spec.client
      let args = spec.args || []
      let context = new ClientClass(this, id, ...args)
      contexts[id] = context
      lang2context[lang] = context
    })
    this._contexts = contexts
    this._lang2context = lang2context

    config.libraries.forEach(({lang, lib}) => {
      let langContext = this.getLanguageContext(lang)
      langContext.importLibrary(lib)
    })
  }

  getLanguageContext (lang) {
    return this._lang2context[lang]
  }

  async compile (cell) {
    const lang = cell.lang
    const context = this.getLanguageContext(lang)
    if (!context) {
      // TODO: need to think about how initialization should be done
      Object.assign(cell, {messages: [], inputs: [], outputs: []})
      cell.messages.push(new ContextError(`No context for language '${lang}'`))
      return cell
    } else {
      return context.compile(cell)
    }
  }

  async execute (cell) {
    const lang = cell.lang
    const context = this.getLanguageContext(lang)
    if (!context) {
      if (!cell.messages) cell.messages = []
      cell.messages.push(new ContextError(`No context for language '${lang}'`))
      return cell
    } else {
      return context.execute(cell)
    }
  }

  /**
    @param {object} a function value (TODO: link to documentation)
    @param {array} an array of packed values
    @param {object} a Map with packed values by name
  */
  async callFunction (funcValue, args, namedArgs) {
    // HACK: this is being used inconsistently
    let data = funcValue.data || funcValue.value.data
    const contextId = data.context
    if (!contextId) {
      throw new Error('context is mandatory')
    }
    // TODO: instead of storing contexts via language
    // I would prefer to store them by id
    // and do the language mapping extra
    let context = this._contexts[contextId]
    if (!context) {
      throw new Error('No context registered for language')
    }
    let call = {
      type: 'call',
      func: funcValue,
      args,
      namedArgs
    }
    return context.evaluateCall(call)
  }

  pack (value, options) {
    return pack(value, options)
  }

  unpack (pkg) {
    return unpack(pkg)
  }
}
