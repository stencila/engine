import { CompositeContext } from '../index'

export default class TestContext extends CompositeContext {
  constructor () {
    super()

    this._disabled = false
  }

  _disable (val) {
    this._disabled = val
  }

  getLanguageContext (name) {
    if (this._disabled) {
      return undefined
    } else {
      return super.getLanguageContext(name)
    }
  }
}
