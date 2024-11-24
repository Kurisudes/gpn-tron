import { getColorByString, makeGreyish} from "@gpn-tron/shared/constants/colors"
import gameService from "../services/GameService"

const wallSize = 1
const floorSize = 16
const roomSize = floorSize + wallSize

const isColorDark = (hexColor: string) => {
  // Validate and normalize the hex color
  const isValidHex = /^#([A-Fa-f0-9]{3}){1,2}$/.test(hexColor);
  if (!isValidHex) {
      console.error('Error: Invalid color parsed')
      return true;
  }

  // Expand shorthand hex (#RGB) to full hex (#RRGGBB)
  const normalizedHex = hexColor.length === 4
      ? `#${hexColor[1]}${hexColor[1]}${hexColor[2]}${hexColor[2]}${hexColor[3]}${hexColor[3]}`
      : hexColor;

  // Convert hex to RGB
  const red = parseInt(normalizedHex.substring(1, 3), 16);
  const green = parseInt(normalizedHex.substring(3, 5), 16);
  const blue = parseInt(normalizedHex.substring(5, 7), 16);

  // Calculate luminance (relative brightness)
  // Formula source: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  // Determine if the color is dark or bright
  return luminance < 128
}

export class GameRenderer {
  #canvas: HTMLCanvasElement
  #context: CanvasRenderingContext2D
  #offScreenCanvas = document.createElement('canvas')
  #offScreenContext = this.#offScreenCanvas.getContext('2d')
  #canvasPixelSize: number
  #viewFactor: number

  get factoredRoomSize() {
    return roomSize * this.#viewFactor
  }
  get factoredWallSize() {
    return wallSize * this.#viewFactor
  }
  get factoredHalfWallSize() {
    return this.factoredWallSize / 2
  }
  get factoredHalfRoomSize() {
    return this.factoredRoomSize / 2
  }
  get factoredFloorSize() {
    return floorSize * this.#viewFactor
  }
  get playerRadius() {
    return this.factoredFloorSize * 0.4
  }

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas
    this.#context = canvas.getContext('2d')
  }

  #factoredPos(pos: Vec2) {
    const x = this.#factoredCoordinate(pos.x)
    const y = this.#factoredCoordinate(pos.y)
    return {x, y}
  }

  #factoredCoordinate(xy: number) {
    return xy * this.factoredRoomSize + this.factoredRoomSize / 2
  }

  #drawPlayersDot(color: string, pos: Vec2) {
    const fpos = this.#factoredPos(pos)
    this.#offScreenContext.fillStyle = color
    this.#offScreenContext.beginPath()
    this.#offScreenContext.arc(fpos.x, fpos.y, this.playerRadius, 0, 2 * Math.PI, false)
    this.#offScreenContext.fill()
  }

  #drawPlayerLine (color: string, from: Vec2, to: Vec2) {
    let context = this.#offScreenContext
    let playerRadius = this.playerRadius
    context.strokeStyle = color
    context.lineWidth = playerRadius * 2
    context.beginPath()
    context.moveTo(this.#factoredCoordinate(from.x), this.#factoredCoordinate(from.y))
    context.lineTo(this.#factoredCoordinate(to.x), this.#factoredCoordinate(to.y))
    context.stroke()

    // Draw corners
    this.#drawPlayersDot(color, to)
  }
  
  #updateCanvasSize() {
    this.#canvasPixelSize = Math.min(
      this.#canvas.parentElement.clientHeight,
      this.#canvas.parentElement.clientWidth
    )
    this.#offScreenCanvas.width = this.#canvasPixelSize
    this.#offScreenCanvas.height = this.#canvasPixelSize
  }

  #updateViewFactor() {
    const size = Math.max(gameService.game.width, gameService.game.height)
    const pixelSize = size * roomSize
    this.#viewFactor = this.#canvasPixelSize / pixelSize /1.05
  }

  #renderWalls() {
    const { game } = gameService
    if (!game) return

    // Render walls
    this.#offScreenContext.strokeStyle = 'white'
    this.#offScreenContext.lineWidth = 1
    const lowY  =  game.lower_limit.y      * this.factoredRoomSize
    const highY = (game.upper_limit.y + 1) * this.factoredRoomSize
    const lowX  =  game.lower_limit.x      * this.factoredRoomSize
    const highX = (game.upper_limit.x + 1) * this.factoredRoomSize
    for (let x = game.lower_limit.x; x < game.upper_limit.x + 2; x++) {
      const tmpX = x * this.factoredRoomSize

      this.#offScreenContext.beginPath()
      this.#offScreenContext.moveTo(tmpX, lowY)
      this.#offScreenContext.lineTo(tmpX, highY)
      this.#offScreenContext.stroke()

      for (let y = game.lower_limit.y; y < game.upper_limit.y + 2; y++) {
        const tmpY = y * this.factoredRoomSize

        this.#offScreenContext.beginPath()
        this.#offScreenContext.moveTo(lowX, tmpY)
        this.#offScreenContext.lineTo(highX, tmpY)
        this.#offScreenContext.stroke()
      }
    }
  }

  #renderFrame() {
    const { game } = gameService
    if (!game) return
    const frameColor = 'grey'
    const upper_right = {x: game.upper_limit.x + 1, y: game.upper_limit.y + 1}
    const lower_right = {x: game.upper_limit.x + 1, y: game.lower_limit.y - 1}
    const upper_left  = {x: game.lower_limit.x - 1, y: game.upper_limit.y + 1}
    const lower_left  = {x: game.lower_limit.x - 1, y: game.lower_limit.y - 1}

    this.#drawPlayerLine(frameColor, upper_right, upper_left)
    this.#drawPlayerLine(frameColor, upper_left,  lower_left)
    this.#drawPlayerLine(frameColor, lower_left,  lower_right)
    this.#drawPlayerLine(frameColor, lower_right, upper_right)
  }

  #renderPlayers() {
    console.log("render Players")
    const { game } = gameService
    if (!game) return
    const space_to_wall = 0.5
    const lowerX = game.lower_limit.x
    const upperX = game.upper_limit.x
    const lowerY = game.lower_limit.y
    const upperY = game.upper_limit.y
    
    const drawArrow = (direction: "up" | "down" | "left" | "right", prevPos: Vec2,  pos: Vec2): void => {
      drawSingleArrow(direction, pos, "black")
      drawSingleArrow(direction, prevPos, "black")
    }
    const drawSingleArrow = (direction: "up" | "down" | "left" | "right", position: Vec2, color): void => {
      const ctx = this.#offScreenContext

      const x = this.#factoredCoordinate(position.x)
      const y = this.#factoredCoordinate(position.y)
      const size = this.playerRadius

      ctx.strokeStyle = color; // Arrow color
      ctx.lineWidth = 2; // Arrow thickness
      ctx.fillStyle = "#000000"; // Arrowhead fill color

      ctx.beginPath();

      // Draw the arrow based on the direction
      switch (direction) {
        case "up":
          ctx.moveTo(x, y + size);
          ctx.lineTo(x - size / 2, y - size / 2);
          ctx.lineTo(x + size / 2, y - size / 2);
          break;

        case "down":
          ctx.moveTo(x, y - size);
          ctx.lineTo(x - size / 2, y + size / 2);
          ctx.lineTo(x + size / 2, y + size / 2);
          break;

        case "right":
          ctx.moveTo(x + size, y);
          ctx.lineTo(x - size / 2, y - size / 2);
          ctx.lineTo(x - size / 2, y + size / 2);
          break;

        case "left":
          ctx.lineTo(x + size / 2, y - size / 2);
          ctx.moveTo(x - size, y);
          ctx.lineTo(x + size / 2, y + size / 2);
          break;
      }
      ctx.closePath();

      // Stroke the arrow line
      ctx.stroke();

      // Fill the arrowhead
      ctx.fill();
    }

    for (const player of game.players) {
      let { alive, name, pos, moves } = player
      if (!alive) continue

      const playerColor = getColorByString(name)
      const greyishPlayerColor = makeGreyish(playerColor, 0.7)
      

      // Render paths
      for (let moveIndex = 0; moveIndex < moves.length; moveIndex++) {
        const pos = moves[moveIndex]
        let moveColor = ""
        if(pos.x >= lowerX && pos.y >= lowerY && pos.x <= upperX && pos.y <= upperY) {
          moveColor = playerColor
        }
        else {
          moveColor =  greyishPlayerColor
        }
        
        
        if (moveIndex === 0) {
          // Draw start head of this move
          this.#drawPlayersDot(moveColor, pos)
          continue
        } 
        const prevPos = moves[moveIndex - 1]

        // Todo: optimize Arrows - Idea: first draw all lines then draw all arrows 
        const drawMove = (color) => {
          if (prevPos.y === pos.y) {
            if(prevPos.x - pos.x === 1 || prevPos.x - pos.x === -1) {
              this.#drawPlayerLine(color, prevPos, pos)
            } else if (prevPos.x < pos.x) {
              this.#drawPlayerLine(color, {x: pos.x +space_to_wall, y: pos.y}, pos)
              this.#drawPlayerLine(color, {x: prevPos.x -space_to_wall, y: prevPos.y}, prevPos)
              drawArrow("left", prevPos, pos)
            }
            else if (prevPos.x > pos.x) {
              this.#drawPlayerLine(color, {x: pos.x -space_to_wall, y: pos.y}, pos)
              this.#drawPlayerLine(color, {x: prevPos.x +space_to_wall, y: prevPos.y}, prevPos)
              drawArrow("right", prevPos, pos)
            } else this.#showMessage('error1: '+ prevPos.y + " " + pos.y, pos)
          }
          else {
            if(prevPos.y - pos.y === 1 || prevPos.y - pos.y === -1) {
              this.#drawPlayerLine(color, prevPos, pos)
            } else if (prevPos.y < pos.y) {
              this.#drawPlayerLine(color, {x: pos.x, y: pos.y +space_to_wall}, pos)
              this.#drawPlayerLine(color, {x: prevPos.x, y: prevPos.y -space_to_wall}, prevPos)
              drawArrow("down", prevPos, pos)
            }
            else if (prevPos.y > pos.y) {
              this.#drawPlayerLine(color, {x: pos.x, y: pos.y -space_to_wall}, pos)
              this.#drawPlayerLine(color, {x: prevPos.x, y: prevPos.y +space_to_wall}, prevPos)
              drawArrow("up", prevPos, pos)
            } else this.#showMessage('error2: '+ prevPos.y + " " + pos.y, pos)
          }
        }
        drawMove(moveColor)  
      }
      // Draw head

    }
  }

  #renderNames() {
    const { game } = gameService
    if (!game) return

    for (const player of game.players) {
      let { alive, name, pos: { x, y } } = player
      if (!alive) continue

      const playerColor = getColorByString(name)
      x *= this.factoredRoomSize
      y *= this.factoredRoomSize
      x += this.factoredHalfRoomSize
      y += this.factoredHalfRoomSize

      const textHeight = 18

      this.#offScreenContext.font = `bold ${textHeight}px serif`
      const nameMetrics = this.#offScreenContext.measureText(name)

      const nameX = x - nameMetrics.width / 2 - 10
      const nameY = y - textHeight * 3 - 5

      // Draw name box
      this.#offScreenContext.fillStyle = playerColor
      this.#offScreenContext.strokeStyle = 'white'
      this.#offScreenContext.lineWidth = 2
      this.#offScreenContext.beginPath()
      this.#offScreenContext.rect(nameX, nameY, nameMetrics.width + 10, textHeight + 10)
      this.#offScreenContext.fill()
      this.#offScreenContext.stroke()
      
      // Draw player name
      this.#offScreenContext.textBaseline = 'top'
      if(isColorDark(playerColor)) 
        this.#offScreenContext.fillStyle = 'white'
      else
        this.#offScreenContext.fillStyle = 'black'
      this.#offScreenContext.fillText(name, nameX + 5, nameY + 5)
    }
  }

  #showMessage(message: string, pos: Vec2) {
    const x = this.#factoredCoordinate(pos.x)
    const y = this.#factoredCoordinate(pos.y)
    this.#offScreenContext.fillStyle = 'white'
    this.#offScreenContext.fillRect(x - 10, y + this.factoredRoomSize - 20, this.#offScreenContext.measureText(message).width + 20, 40)
    this.#offScreenContext.fillStyle = 'black'
    this.#offScreenContext.fillText(message, x, y + this.factoredRoomSize)
  }

  #renderChat() {
    const { game } = gameService
    if (!game) return

    for (const player of game.players) {
      let { alive, pos, moves, chat } = player
      if (!alive || !chat) continue

      this.#showMessage(chat, pos)
    }
  }

  render() {
    if (!this.#canvas || !this.#canvas.parentElement || !gameService.game) return

    this.#updateCanvasSize()
    this.#updateViewFactor()

    // Clear frame
    this.#offScreenContext.fillStyle = '#090a35'
    this.#offScreenContext.clearRect(0, 0, this.#canvas.width, this.#canvas.height)
    this.#offScreenContext.fillRect(0, 0, this.#canvas.width, this.#canvas.height)

    this.#renderWalls()
    this.#renderPlayers()
    this.#renderFrame()
    this.#renderNames()
    this.#renderChat()

    // Now push the rendering to real canvas
    this.#canvas.width = this.#offScreenCanvas.width
    this.#canvas.height = this.#offScreenCanvas.height
    this.#context.drawImage(this.#offScreenCanvas, 0, 0)
  }
}
