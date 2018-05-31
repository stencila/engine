import CompositeContext from './CompositeContext'

// Note: async because we gonna have an asynchronous configuration with remote contexts
export default async function setupContext ({ contexts, libraries }, options = {}) {
  let ContextClass = options.ContextClass || CompositeContext
  let context = new ContextClass()
  context.configure({ contexts })
  // TODO: library things will change totally, so don't invest time here
  libraries.forEach(({lang, lib}) => {
    let langContext = context.getLanguageContext(lang)
    langContext.importLibrary(lib)
  })
  return context
}
