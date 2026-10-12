// Les rendus de miniatures passent un par un pour ne pas figer l'interface.
let chain = Promise.resolve()

export function enqueueRender(fn) {
  const p = chain.then(fn)
  chain = p.catch(() => {})
  return p
}
