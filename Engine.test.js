import test from 'tape'
import Engine from '../../src/engine/Engine'
import JsContext from '../../src/contexts/JsContext'
import MiniContext from '../../src/contexts/MiniContext'
import FunctionManager from '../../src/function/FunctionManager'
import { libtestXML, libtest } from '../contexts/libtest'
// import { wait } from '../testHelpers'

test('Engine: single cell', t => {
  t.plan(8)
  let { engine, graph } = _setup()
  const id = 'sheet1.cell1'
  // this should automatically trigger code analysis and
  // incremental graph updates
  engine.addCell({
    id,
    lang: 'mini',
    source: '1+2',
    docId: 'sheet1'
  })
  // wait for all actions to be finished
  _cycle(engine)
  .then(() => {
    let nextActions = engine.getNextActions()
    t.equal(nextActions.size, 1, 'There should be one next action')
    let a = nextActions.get(id)
    t.equal(a.type, 'register', '.. which should a registration action')
  })
  .then(() => _cycle(engine))
  .then(() => {
    t.ok(graph.hasCell('sheet1.cell1'), 'The cell should now be registered')
    let nextActions = engine.getNextActions()
    let a = nextActions.get(id)
    t.equal(a.type, 'evaluate', 'next action should be evaluate')
  })
  .then(() => _cycle(engine))
  .then(() => {
    let nextActions = engine.getNextActions()
    let a = nextActions.get(id)
    t.equal(a.type, 'update', 'next action should be update')
  })
  .then(() => _cycle(engine))
  .then(() => {
    let nextActions = engine.getNextActions()
    t.equal(nextActions.size, 0, 'There should be no pending actions')
    let cell = graph.getCell(id)
    t.notOk(cell.hasErrors(), 'the cell should have no error')
    t.equal(_getValue(cell), 3, 'the value should have been computed correctly')
  })
})

test('Engine: play', t => {
  t.plan(1)
  let { engine, graph } = _setup()
  engine.addCell({
    id: 'cell1',
    lang: 'mini',
    source: 'x = 2',
    docId: 'doc1'
  })
  engine.addCell({
    id: 'cell2',
    lang: 'mini',
    source: 'y = 3',
    docId: 'doc1'
  })
  engine.addCell({
    id: 'cell3',
    lang: 'mini',
    source: 'z = x + y',
    docId: 'doc1'
  })
  _play(engine)
  .then(() => {
    t.deepEqual(_getValues(graph, 'cell1', 'cell2', 'cell3'), [2,3,5], 'values should have been computed')
  })
})

function _cycle(engine) {
  let actions = engine.cycle()
  return Promise.all(actions)
}

function _play(engine) {
  return new Promise((resolve) => {
    function step() {
      if (engine.hasNextAction()) {
        _cycle(engine).then(step)
      } else {
        resolve()
      }
    }
    step()
  })
}

// TODO: there must be a helper, already
// look into other tests
function _getValue(cell) {
  if (cell.value) {
    return cell.value.data
  }
}

function _getValues(graph, ...ids) {
  return ids.map(id => {
    let cell = graph.getCell(id)
    if (cell) {
      return _getValue(cell)
    }
    return undefined
  })
}

function _setup() {
  // A JsContext with the test function library
  let jsContext = new JsContext()
  let miniContext
  jsContext.importLibrary('test', libtest)
  // Function manager for getting function specs
  let functionManager = new FunctionManager()
  functionManager.importLibrary('test', libtestXML)
  // A mock Host that provides the JsContext when requested
  let host = {
    createContext: function(lang) {
      switch (lang) {
        case 'js':
          return Promise.resolve(jsContext)
        case 'mini':
          return Promise.resolve(miniContext)
        default:
          return Promise.reject(new Error('No context for language '+lang))
      }
    },
    functionManager
  }
  miniContext = new MiniContext(host)
  let engine = new Engine(host)
  let graph = engine._graph
  return { host, engine, graph }
}