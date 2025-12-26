import { EventEmitter } from "events"
import { MultiElo } from "multi-elo"
import { baseTickrate, tickIncreaseInterval } from "@gpn-tron/shared/constants/common"
import { Player, Move } from "./Player"

export enum ScoreType {
  LOOSE,
  WIN
}

export type Score = {
  type: ScoreType
  time: number
}

export type ScoreHistory = Score[]

export class Game extends EventEmitter {
  #id: string
  #players: Player[]
  #width: number
  #height: number
  #limit_gab: number
  #upper_limit = { x: 0, y: 0 }
  #lower_limit = { x: 0, y: 0 }
  #fields: Array<Array<number>>
  #state: GameState
  #tickRate = baseTickrate
  #startTime = Date.now()

  get state() {
    return this.#state
  }
  get alivePlayers(): Player[] {
    return this.#players.filter(({ alive }) => alive)
  }
  get deadPlayers(): Player[] {
    return this.#players.filter(({ alive }) => !alive)
  }

  constructor(players: Player[]) {
    super()

    this.#id = Math.random().toString(32).slice(2)
    this.#players = players

    this.#initializePlayers()
    this.#initializeFields()
    this.#initializeGame()
    this.#initializeState()

    setTimeout(() => this.#onTick(), 1000 / baseTickrate)
  }

  rawBroadcastToAlive(packet: string) {
    for (const player of this.alivePlayers) {
      player.rawSend(packet)
    }
  }

  broadcastToAlive(type: string, ...args: any) {
    for (const player of this.alivePlayers) {
      player.send(type, ...args)
    }
  }

  broadcast(type: string, ...args: any) {
    this.#players.forEach(player => {
      player.send(type, ...args)
    })
  }

  #removePlayerFromFields(player: Player) {
    player.moves.forEach(({ x, y }) => {
      this.#fields[x][y] = -1
    })
  }

  #initializePlayers() {
    // Shuffle the players
    this.#players.sort(() => 0.5 - Math.random())

    for (let i=0; i<this.#players.length; i++) {
      this.#players[i].id = i // Set the current player id
    }
  }

  #initializeState() {
    this.#state = {
      id: this.#id,
      width: this.#width,
      height: this.#height,
      lower_limit: this.#lower_limit,
      upper_limit: this.#upper_limit,
      players: this.#players.map(({ state }) => state),
    }
  }

  #initializeFields() {
    this.#width = this.#players.length * 2 + 2
    this.#height = this.#players.length * 2 + 2
    this.#fields = Array(this.#width).fill(null).map(() => Array(this.#height).fill(-1))
    this.#lower_limit.x = 0
    this.#lower_limit.y = 0
    this.#upper_limit.x = this.#width - 1
    this.#upper_limit.y = this.#height - 1
    this.#limit_gab = 1

    for (let i = 0; i < this.#players.length; i++) {
      const x = i * 2
      const y = i * 2
      this.#fields[x][y] = i // Set the current player id to the spawn field
      this.#players[i].spawn(x, y)
    }
  }

  #initializeGame() {
    const onEndRemover = []
    this.once('end', () => {
      onEndRemover.forEach(fn => fn())
    })

    for (const player of this.alivePlayers) {
      player.send('game', this.#width, this.#height, player.id)

      // Watch for chat messages and share them with all players
      const onChat = message => {
        this.broadcastToAlive('message', player.id, message)
      }
      player.on('chat', onChat)

      onEndRemover.push(() => {
        player.off('chat', onChat)
      })
    }
    this.#broadcastLimits()
    this.#broadcastPlayerPacket()
    this.#broadcastPos()
    this.broadcastToAlive('tick')
  }

  #broadcastPlayerPacket() {
    let playerPacket = ''
    for (const player of this.alivePlayers) {
      playerPacket += `player|${player.id}|${player.username}\n`
    }
    this.rawBroadcastToAlive(playerPacket)
  }

  #broadcastPos() {
    let updatePacket = ''
    for (const player of this.alivePlayers) {
      const { x, y } = player.pos
      updatePacket += `pos|${player.id}|${x}|${y}\n`
    }

    this.rawBroadcastToAlive(updatePacket)
  }

  #broadcastLimits() {
    const packet = `limit|${this.#lower_limit.x}|${this.#lower_limit.y}|${this.#upper_limit.x}|${this.#upper_limit.y}\n`
    this.rawBroadcastToAlive(packet)
  }

  #updateMapSize() {
    let areLimitsChanged = false
    let max_x = 0
    let max_y = 0
    let min_x = this.#width
    let min_y = this.#height
    for (const player of this.alivePlayers) {
      let { x, y } = player.pos
      if (y < min_y) min_y = y
      if (x < min_x) min_x = x
      if (x > max_x) max_x = x
      if (y > max_y) max_y = y
    }
    
    const findNewLowerLimit = (old_limit: number, min: number) => {
      if(min - this.#limit_gab > old_limit) {
        areLimitsChanged = true
        return min - this.#limit_gab
      }
      else
        return old_limit
    }

    const findNewUpperLimit = (old_limit: number, max: number) => {
      if(max + this.#limit_gab < old_limit) {
        areLimitsChanged = true
        return max + this.#limit_gab
      }
      else
        return old_limit
    }

    this.#lower_limit.x = findNewLowerLimit(this.#lower_limit.x, min_x)
    this.#lower_limit.y = findNewLowerLimit(this.#lower_limit.y, min_y)
    this.#upper_limit.x = findNewUpperLimit(this.#upper_limit.x, max_x)
    this.#upper_limit.y = findNewUpperLimit(this.#upper_limit.y, max_y)
    if(areLimitsChanged){
      this.#broadcastLimits()
    }
  }

  #onTick() {
    const newDeadPlayers: Player[] = []

    // Remove disconnected players
    this.alivePlayers.filter(({ connected }) => !connected).forEach(player => {
      newDeadPlayers.push(player)
      player.kill()
      this.#removePlayerFromFields(player)
    })

    // Update player position
    for (const player of this.alivePlayers) {
      const move = player.readMove()
      let { x, y } = player.pos

      if (move === Move.UP) {
        if (y === this.#lower_limit.y) y = this.#upper_limit.y
        else y--
      }
      else if (move === Move.RIGHT) {
        if (x === this.#upper_limit.x) x = this.#lower_limit.x
        else x++
      }
      else if (move === Move.DOWN) {
        if (y === this.#upper_limit.y) y = this.#lower_limit.y
        else y++
      }
      else if (move === Move.LEFT) {
        if (x === this.#lower_limit.x) x = this.#upper_limit.x
        else x--
      }

      player.setPos(x, y)
    }
      
      // Apply move to fields
    for (const player of this.alivePlayers) {
      const { x, y } = player.pos
      const fieldPlayerIndex = this.#fields[x][y]
      const fieldPlayer = this.#players[fieldPlayerIndex]

      // If field is free move to it
      if (!fieldPlayer) {
        this.#fields[x][y] = player.id
        continue
      }

      // If both people entered the field at the same time, kill both
      if (fieldPlayer !== player && fieldPlayer.pos.x === x && fieldPlayer.pos.y === y) {
        newDeadPlayers.push(fieldPlayer)
        fieldPlayer.kill()
      }

      newDeadPlayers.push(player)
      player.kill()
    }

    // Cleanup fields of dead players and make them lose
    newDeadPlayers.forEach(player => {
      this.#removePlayerFromFields(player)
      player.lose()
    })

    // Inform about dead players and pos updates
    let updatePacket = ''
    if (newDeadPlayers.length) {
      updatePacket += `die|${newDeadPlayers.map(({ id }) => id).join('|')}\n`
    }
    for (const player of this.alivePlayers) {
      const { x, y } = player.pos
      updatePacket += `pos|${player.id}|${x}|${y}\n`
    }

    this.rawBroadcastToAlive(updatePacket)

    // Check for game end
    let shouldEnd = false
    if (this.#players.length === 1 && this.alivePlayers.length === 0) shouldEnd = true
    else if (this.#players.length > 1 && this.alivePlayers.length <= 1) shouldEnd = true

    if (shouldEnd) {
      const winners: Player[] = this.alivePlayers
      winners.forEach(p => p.win())

      const losers = this.deadPlayers

      // Update ELO scores
      if (winners.length && losers.length) {
        const playersInOrder = [...winners, ...losers];
        const placesInOrder = [...(winners.map(player => 1)), ...(losers.map(player => 2))];
        const newEloScores = MultiElo.getNewRatings(playersInOrder.map(player => player.eloScore), placesInOrder);
        for (let i = 0; i < playersInOrder.length; i++) {
          playersInOrder[i].eloScore = newEloScores[i];
        }
      }
      console.log('game end')
      this.emit('end', winners)
    } else {
      this.broadcastToAlive('tick')
      if(newDeadPlayers.length > 0) this.#updateMapSize()

      // Dynamically define tickrate
      const timeDiff = Date.now() - this.#startTime
      this.#tickRate = baseTickrate + Math.floor(timeDiff / 1000 / tickIncreaseInterval)

      setTimeout(() => this.#onTick(), 1000 / this.#tickRate)
    }
  }
}
