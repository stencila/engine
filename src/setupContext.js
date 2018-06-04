import CompositeContext from './CompositeContext'

// Note: async because we gonna have an asynchronous configuration with remote contexts
export default async function setupContext (config, options = {}) {
  let ContextClass = options.ContextClass || CompositeContext
  let context = new ContextClass()
  context.configure(config)
  return context
}
