import { EventEmitter } from "events"
import { io, Socket } from "socket.io-client"
import { applyPatch } from "fast-json-patch"

export class WsStateClient<WsStateType> extends EventEmitter {
  #socket: Socket
  #state: WsStateType = {} as WsStateType

  constructor(port: number, protocol?: string) {
    super()

    // Automatisch das richtige Protokoll basierend auf der aktuellen Seite verwenden
    if (!protocol && typeof location !== 'undefined') {
      protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    } else if (!protocol) {
      protocol = 'ws'
    }

    // Wenn wir über HTTPS kommen (Cloudflare), verwende die aktuelle Domain ohne Port
    // Andernfalls nutze hostname:port für lokale Entwicklung
    const url = typeof location !== 'undefined' && location.protocol === 'https:' 
      ? `${protocol}://${location.hostname}`
      : `${protocol}://${typeof location !== 'undefined' ? location.hostname : 'wstron.thekuriso.org'}:${port}`

    this.#socket = io(url)

    this.#socket.on('init', state => {
      this.#state = state
      this.emit('update')
    })

    this.#socket.on('patch', patch => {
      // Ensure to not keep references
      if (typeof structuredClone === 'function') {
        this.#state = structuredClone(applyPatch(this.#state, patch).newDocument)
      } else {
        this.#state = JSON.parse(JSON.stringify(applyPatch(this.#state, patch).newDocument))
      }
      this.emit('update')
    })
  }

  close() {
    this.#socket.close()
  }

  get state() { return this.#state }
}
