import SimpleHost from './SimpleHost'

export default function setupHost ({ contexts, libraries }) {
  let host = new SimpleHost()
  host.configure({ contexts })
  // TODO: library things will change totally, so don't invest time here
  libraries.forEach(({lang, lib}) => {
    let context = host.getContext(lang)
    context.importLibrary(lib)
    host._functionManager.importLibrary(context, lib)
  })
  // TODO: probably we gonna have an asynchronous configuration with remote contexts
  return Promise.resolve(host)
}
