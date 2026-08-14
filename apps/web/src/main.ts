/**
 * Web application entry: thin bootstrap over the shell library. Everything —
 * loader holding, module-table seeding, AppRoot gate, plugin assembly — lives
 * in @deepseek-ai/dsh-client-web; this file only finds the mount point.
 */

// Polyfill crypto.randomUUID for unsecure contexts (HTTP on LAN/VPN IP)
// In unsecure contexts, browsers disable crypto.randomUUID but keep crypto.getRandomValues.
// This runs before any plugin bundle executes.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {} as Crypto
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = function () {
    // Use crypto.getRandomValues if available, fallback to Math.random
    const getRandomValues = typeof globalThis.crypto.getRandomValues === 'function'
      ? (arr: Uint8Array) => { globalThis.crypto.getRandomValues(arr as unknown as ArrayBufferView) }
      : (arr: Uint8Array) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256) }
    const arr = new Uint8Array(16)
    getRandomValues(arr)
    // RFC4122 v4: set version (4) and variant (8/9/a/b)
    const val6 = arr[6]
    const val8 = arr[8]
    if (val6 !== undefined) arr[6] = (val6 & 0x0f) | 0x40
    if (val8 !== undefined) arr[8] = (val8 & 0x3f) | 0x80
    const hex = [...arr].map(b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}

import { AppWebEntry } from '@deepseek-ai/dsh-client-web'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
void new AppWebEntry(el).run()
