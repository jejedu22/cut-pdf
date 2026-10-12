// [1,2,3,5] -> "1-3, 5" (séparateur au choix)
export function rangesLabel(list, sep) {
  const r = []
  for (let i = 0; i < list.length;) {
    let j = i
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++
    r.push(j > i ? `${list[i]}-${list[j]}` : `${list[i]}`)
    i = j + 1
  }
  return r.join(sep)
}

export const fmtSize = n =>
  (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`).replace('.', ',')

export function saveBlob(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
