import FunctionManager from './FunctionManager'

/*
  Trying to get minimal viable solution of a host, that is configured once
  rather than dynamically reconfiguring itself.
*/
export default class SimpleHost {
  constructor () {
    this._contexts = {}
    this._functionManager = new FunctionManager()
  }

  configure (config) {
    let contexts = {}
    config.contexts.forEach(spec => {
      let lang = spec.lang
      let ClientClass = spec.client
      let args = spec.args || []
      contexts[lang] = new ClientClass(this, ...args)
    })
    this._contexts = contexts
  }

  getContext (lang) {
    return this._contexts[lang]
  }

  getFunctionManager() {
    return this._functionManager
  }
}
