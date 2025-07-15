import { getNatType } from '../../src/index.js'

getNatType().then((res) => {
  console.log('\x1b[38;2;0;151;255m%c%s\x1b[0m', 'color:#0097ff;', `------->Breathe: res`, res)
})
