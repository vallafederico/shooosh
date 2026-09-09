import {test,expect} from 'bun:test'
import {createCanvasScene} from './canvas-scene'
test('scene ownership releases resources once, including late asynchronous acquisitions',()=>{
  const scene=createCanvasScene({} as HTMLCanvasElement,{autoInit:false})
  let destroyed=0
  const resource={destroy(){destroyed++}}
  scene.retain(resource);scene.retain(resource)
  scene.destroy();scene.destroy()
  expect(destroyed).toBe(1)
  scene.retain({destroy(){destroyed++}})
  expect(destroyed).toBe(2)
})
