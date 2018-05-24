// DEPRECATED: this will be removed when we register functions as values
export default class FunctionManager {
  constructor (libraries = null) {
    // Maps function names to the library in which they have been defined
    this.functionMap = {}
    // Holds function instances scoped by libraryName and functionName
    this.functions = {}
  }

  /*
    Get function instance by name
  */
  getFunction (functionName) {
    let record = this.functionMap[functionName]
    if (record) {
      return this.functions[record.library][functionName]
    }
  }

  getContextLibrary(functionName) {
    return this.functionMap[functionName]
  }

  /*
    Import a function
  */
  importFunction (context, func, libraryName = 'local') {
    const record = this.functionMap[func.name]
    if (record && record.library !== libraryName) {
      throw new Error(`Function "${func.name}" is already defined in library "${record.library}"`)
    }
    this.functionMap[func.name] = { context, library: libraryName }
    if (!this.functions[libraryName]) this.functions[libraryName] = {}
    this.functions[libraryName][func.name] = func
  }

  /*
    Import a function library
  */
  importLibrary (context, library) {
    for (let func of Object.values(library.funcs)) {
      this.importFunction(context, func, library.name)
    }
  }
}
