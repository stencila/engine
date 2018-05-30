/*
  Trying to get minimal viable solution of a host, that is configured once
  rather than dynamically reconfiguring itself.

  EXPERIMENTAL: playing with a different approach
  to functions. The use-case of 'custom functions' inspired
  us to move towards this direction in general.
  This means, functions are essentially just values.
  A 'function' type value, bears all information necessary
  to call into the right context.
  In theory we could even achieve to let a context define the function
  on the fly in case of a stateless context.
  This all needs some more thinking and discussions.
*/
export default class SimpleHost {
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
  }

  getContext (lang) {
    return this._lang2context[lang]
  }

  async callFunction (funcValue, args, namedArgs) {
    const funcSpec = funcValue.value.data
    if (!funcSpec.context) {
      throw new Error('funcSpec.context is mandatory')
    }
    // TODO: instead of storing contexts via language
    // I would prefer to store them by id
    // and do the language mapping extra
    let context = this._contexts[funcSpec.context]
    if (!context) {
      throw new Error('No context registered for language')
    }
    let call = {
      type: 'call',
      func: funcSpec,
      args,
      namedArgs
    }
    return context.evaluateCall(call)
  }
}
