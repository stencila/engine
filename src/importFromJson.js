import { uuid } from 'substance'

export default function importFromJSON (engine, data) {
  data.resources.forEach(res => {
    if (!res.id) res.id = uuid()
    switch (res.type) {
      case 'document': {
        engine.addDocument(res)
        break
      }
      case 'sheet': {
        engine.addSheet(res)
        break
      }
      default:
        //
        console.error('Unsupported resource type')
    }
  })
}
