import {
  testAsync, setupEngine, getValues, getStates
} from './testHelpers'

testAsync('JavascriptContext Integration: two consecutive cells', async t => {
  let { engine } = setupEngine()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 2', lang: 'mini' },
      { id: 'cell2', source: 'x * 2', lang: 'js' }
    ]
  })
  let cells = doc.getCells()
  await engine.runOnce()
  t.deepEqual(getStates(cells), ['ok', 'ok'], 'cells should be ok')
  t.deepEqual(getValues(cells), [2, 4], 'values should have been computed')
  t.end()
})
