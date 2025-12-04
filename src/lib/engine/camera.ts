import { Mat4, Vec3 } from "./math"

const FAR = 1000

export class Camera {
  alpha: number
  beta: number
  radius: number
  target: Vec3
  fov: number
  aspect: number = 1
  near: number = 0.05
  far: number = FAR

  // Input state — УПРОЩЕНО как в рабочем примере
  private canvas: HTMLCanvasElement | null = null
  private isDragging: boolean = false      // ОБЩИЙ флаг для мыши и тача
  private mouseButton: number | null = null // 0 = левая, 2 = правая
  private lastMousePos = { x: 0, y: 0 }
  private lastTouchPos = { x: 0, y: 0 }
  private touchIdentifier: number | null = null
  private isPinching: boolean = false
  private lastPinchDistance: number = 0
  private lastPinchMidpoint = { x: 0, y: 0 }
  private initialPinchDistance: number = 0

  // Camera settings — ОСТОРОЖНО: пониженная чувствительность!
  angularSensitivity: number = 0.005
  panSensitivity: number = 0.0002 // ← КАК В РАБОЧЕМ ПРИМЕРЕ (в 50 раз меньше!)
  wheelPrecision: number = 0.01
  pinchPrecision: number = 0.05
  minZ: number = 0.1
  maxZ: number = FAR
  lowerBetaLimit: number = 0.001
  upperBetaLimit: number = Math.PI - 0.001

  // Кэш для оптимизации (ваша фишка)
  private _position: Vec3 = new Vec3(0, 0, 0)
  private _viewMatrix: Mat4 = Mat4.identity()
  private _projectionMatrix: Mat4 = Mat4.identity()
  private _cameraVectors: { right: Vec3; up: Vec3 } | null = null
  private _dirty = {
    position: true,
    viewMatrix: true,
    projectionMatrix: true,
    cameraVectors: true
  }

  constructor(alpha: number, beta: number, radius: number, target: Vec3, fov: number = Math.PI / 4) {
    this.alpha = alpha
    this.beta = beta
    this.radius = radius
    this.target = target
    this.fov = fov

    this.bindEvents()
  }

  private bindEvents() {
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    this.onWheel = this.onWheel.bind(this)
    this.onTouchStart = this.onTouchStart.bind(this)
    this.onTouchMove = this.onTouchMove.bind(this)
    this.onTouchEnd = this.onTouchEnd.bind(this)
  }

  getPosition(): Vec3 {
    if (this._dirty.position) {
      const sinBeta = Math.sin(this.beta)
      const x = this.target.x + this.radius * sinBeta * Math.sin(this.alpha)
      const y = this.target.y + this.radius * Math.cos(this.beta)
      const z = this.target.z + this.radius * sinBeta * Math.cos(this.alpha)

      this._position.x = x
      this._position.y = y
      this._position.z = z
      this._dirty.position = false
    }
    return this._position
  }

  getViewMatrix(): Mat4 {
    if (this._dirty.viewMatrix) {
      const eye = this.getPosition()
      const up = new Vec3(0, 1, 0)
      this._viewMatrix = Mat4.lookAt(eye, this.target, up)
      this._dirty.viewMatrix = false
    }
    return this._viewMatrix
  }

  private getCameraVectors(): { right: Vec3; up: Vec3 } {
    if (this._dirty.cameraVectors) {
      const eye = this.getPosition()
      const forward = this.target.subtract(eye)
      const forwardLen = forward.length()

      if (forwardLen < 0.0001) {
        this._cameraVectors = { right: new Vec3(1, 0, 0), up: new Vec3(0, 1, 0) }
      } else {
        const forwardNorm = forward.scale(1 / forwardLen)
        const worldUp = new Vec3(0, 1, 0)

        let right = worldUp.cross(forwardNorm)
        const rightLen = right.length()

        if (rightLen < 0.0001) {
          right = new Vec3(1, 0, 0)
        } else {
          right = right.scale(1 / rightLen)
        }

        const up = forwardNorm.cross(right).normalize()
        this._cameraVectors = { right, up }
      }
      this._dirty.cameraVectors = false
    }
    return this._cameraVectors!
  }

  private panCamera(deltaX: number, deltaY: number) {
    const { right, up } = this.getCameraVectors()
    const panDistance = this.radius * this.panSensitivity

    // ЗАЩИТА от NaN/Infinity
    if (!isFinite(right.x) || !isFinite(up.y)) return

    const panRight = right.scale(-deltaX * panDistance) // ← НАПРАВЛЕНИЕ как в рабочем примере
    const panUp = up.scale(deltaY * panDistance)      // ← НАПРАВЛЕНИЕ как в рабочем примере

    this.target = this.target.add(panRight).add(panUp)
    this.markDirty()
  }

  getProjectionMatrix(): Mat4 {
    if (this._dirty.projectionMatrix) {
      this._projectionMatrix = Mat4.perspective(this.fov, this.aspect, this.near, this.far)
      this._dirty.projectionMatrix = false
    }
    return this._projectionMatrix
  }

  public markDirty() {
    this._dirty.position = true
    this._dirty.viewMatrix = true
    this._dirty.cameraVectors = true
  }

  attachControl(canvas: HTMLCanvasElement) {
    this.canvas = canvas

    // ВАЖНО: блокируем контекстное меню НАВСЕГДА
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      return false
    }, false)

    canvas.addEventListener("mousedown", this.onMouseDown)
    window.addEventListener("mousemove", this.onMouseMove)
    window.addEventListener("mouseup", this.onMouseUp)
    canvas.addEventListener("wheel", this.onWheel, { passive: false })

    // Touch events
    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false })
    window.addEventListener("touchmove", this.onTouchMove, { passive: false })
    window.addEventListener("touchend", this.onTouchEnd)
  }

  detachControl() {
    if (!this.canvas) return

    this.canvas.removeEventListener("mousedown", this.onMouseDown)
    window.removeEventListener("mousemove", this.onMouseMove)
    window.removeEventListener("mouseup", this.onMouseUp)
    this.canvas.removeEventListener("wheel", this.onWheel)

    // Touch events
    this.canvas.removeEventListener("touchstart", this.onTouchStart)
    window.removeEventListener("touchmove", this.onTouchMove)
    window.removeEventListener("touchend", this.onTouchEnd)

    this.canvas = null
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button !== 0 && e.button !== 2) return

    // БЛОКИРУЕМ всё всплытие
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    this.isDragging = true
    this.mouseButton = e.button
    this.lastMousePos = { x: e.clientX, y: e.clientY }
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return // ← УПРОЩЕНО: без проверки кнопки

    const deltaX = e.clientX - this.lastMousePos.x
    const deltaY = e.clientY - this.lastMousePos.y

    if (this.mouseButton === 2) {
      this.panCamera(deltaX, deltaY)
    } else {
      this.alpha += deltaX * this.angularSensitivity
      this.beta -= deltaY * this.angularSensitivity
      this.beta = Math.max(this.lowerBetaLimit, Math.min(this.upperBetaLimit, this.beta))
      this.markDirty()
    }

    this.lastMousePos = { x: e.clientX, y: e.clientY }
  }

  private onMouseUp() { // ← УПРОЩЁН: без параметра event!
    this.isDragging = false
    this.mouseButton = null
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    const zoomFactor = 1 + Math.sign(e.deltaY) * this.wheelPrecision
    this.radius *= zoomFactor
    this.radius = Math.max(this.minZ, Math.min(this.maxZ, this.radius))
    this.far = Math.max(FAR, this.radius * 4)
    this._dirty.projectionMatrix = true
    this.markDirty()
  }

  private onTouchStart(e: TouchEvent) {
    e.preventDefault()

    if (e.touches.length === 1) {
      const touch = e.touches[0]
      this.isDragging = true
      this.isPinching = false
      this.touchIdentifier = touch.identifier
      this.lastTouchPos = { x: touch.clientX, y: touch.clientY }
    } else if (e.touches.length === 2) {
      this.isDragging = false
      this.isPinching = true
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]

      const dx = touch2.clientX - touch1.clientX
      const dy = touch2.clientY - touch1.clientY
      this.lastPinchDistance = Math.sqrt(dx * dx + dy * dy)
      this.initialPinchDistance = this.lastPinchDistance

      this.lastPinchMidpoint = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      }
    }
  }

  private onTouchMove(e: TouchEvent) {
    e.preventDefault()

    if (this.isPinching && e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const dx = touch2.clientX - touch1.clientX
      const dy = touch2.clientY - touch1.clientY
      const distance = Math.sqrt(dx * dx + dy * dy)

      const currentMidpoint = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      }

      const distanceDelta = distance - this.lastPinchDistance
      const midpointDeltaX = currentMidpoint.x - this.lastPinchMidpoint.x
      const midpointDeltaY = currentMidpoint.y - this.lastPinchMidpoint.y

      // Упрощенная логика определения жестов
      const ZOOM_THRESHOLD = 1.0
      const PAN_THRESHOLD = 3.0

      if (Math.abs(distanceDelta) > ZOOM_THRESHOLD) {
        // Zoom gesture
        this.radius -= distanceDelta * this.pinchPrecision
        this.radius = Math.max(this.minZ, Math.min(this.maxZ, this.radius))
        this.far = Math.max(FAR, this.radius * 4)
        this._dirty.projectionMatrix = true
        this.markDirty()
      }

      if (Math.abs(midpointDeltaX) > PAN_THRESHOLD || Math.abs(midpointDeltaY) > PAN_THRESHOLD) {
        // Pan gesture - используем ТЕ ЖЕ направления что и для мыши
        this.panCamera(midpointDeltaX, midpointDeltaY)
      }

      this.lastPinchDistance = distance
      this.lastPinchMidpoint = currentMidpoint
    } else if (this.isDragging && this.touchIdentifier !== null) {
      let touch: Touch | null = null
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this.touchIdentifier) {
          touch = e.touches[i]
          break
        }
      }

      if (!touch) return

      const deltaX = touch.clientX - this.lastTouchPos.x
      const deltaY = touch.clientY - this.lastTouchPos.y

      this.alpha += deltaX * this.angularSensitivity
      this.beta -= deltaY * this.angularSensitivity
      this.beta = Math.max(this.lowerBetaLimit, Math.min(this.upperBetaLimit, this.beta))

      this.lastTouchPos = { x: touch.clientX, y: touch.clientY }
      this.markDirty()
    }
  }

  private onTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      this.isDragging = false
      this.isPinching = false
      this.touchIdentifier = null
      this.initialPinchDistance = 0
    } else if (e.touches.length === 1 && this.isPinching) {
      const touch = e.touches[0]
      this.isPinching = false
      this.isDragging = true
      this.touchIdentifier = touch.identifier
      this.lastTouchPos = { x: touch.clientX, y: touch.clientY }
      this.initialPinchDistance = 0
    } else if (this.touchIdentifier !== null) {
      let touchStillActive = false
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this.touchIdentifier) {
          touchStillActive = true
          break
        }
      }

      if (!touchStillActive) {
        this.isDragging = false
        this.touchIdentifier = null
      }
    }
  }
  setAspectRatio(aspect: number) {
    this.aspect = aspect
    this._dirty.projectionMatrix = true
  }

  setFov(fov: number) {
    this.fov = fov
    this._dirty.projectionMatrix = true
  }
}

