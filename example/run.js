require('source-map-support').install()

const libcore = require('stencila-libcore')
const { Engine, MiniContext, JsContext, setupHost, importFromJson } = require('../dist/engine.cjs.js')
const data = require('./data.js')
const fs = require('fs')

;(async function () {
  let host = await setupHost({
    contexts: [
      { id: 'mickey', lang: 'mini', client: MiniContext },
      { id: 'goofy', lang: 'js', client: JsContext }
    ],
    libraries: [{
      lang: 'js',
      lib: libcore
    }]
  })
  let engine = new Engine({ host })
  // an importer for JSON inputs and JSON dumps would be nice
  importFromJson(engine, data)
  await engine.runOnce()

  let state = engine.dump()
  fs.writeFileSync('./output.json', JSON.stringify(state, null, 2))
})()
