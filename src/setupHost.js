import SimpleHost from './SimpleHost'

// Note: async because we gonna have an asynchronous configuration with remote contexts
export default async function setupHost ({ contexts, libraries }, options = {}) {
  let HostClass = options.HostClass || SimpleHost
  let host = new HostClass()
  host.configure({ contexts })
  // TODO: library things will change totally, so don't invest time here
  libraries.forEach(({lang, lib}) => {
    let context = host.getContext(lang)
    context.importLibrary(lib)
  })
  return host
}
