
import { Quat, Vec3, Mat4 } from "./math"
import { loadAmmo } from "./ammo-loader"
import type { AmmoInstance } from "@fred3d/ammo"

export enum RigidbodyShape {
  Sphere = 0,
  Box = 1,
  Capsule = 2,
}

export enum RigidbodyType {
  Static = 0,
  Dynamic = 1,
  Kinematic = 2,
}

export interface Rigidbody {
  name: string
  englishName: string
  boneIndex: number
  group: number
  collisionMask: number
  shape: RigidbodyShape
  size: Vec3
  shapePosition: Vec3
  shapeRotation: Vec3
  mass: number
  linearDamping: number
  angularDamping: number
  restitution: number
  friction: number
  type: RigidbodyType
  bodyOffsetMatrixInverse: Mat4
  bodyOffsetMatrix?: Mat4
}

export interface Joint {
  name: string
  englishName: string
  type: number
  rigidbodyIndexA: number
  rigidbodyIndexB: number
  position: Vec3
  rotation: Vec3
  positionMin: Vec3
  positionMax: Vec3
  rotationMin: Vec3
  rotationMax: Vec3
  springPosition: Vec3
  springRotation: Vec3
}

export class Physics {
  private rigidbodies: Rigidbody[]
  private joints: Joint[]
  private gravity: Vec3 = new Vec3(0, -98, 0)
  private ammoInitialized = false
  private ammoPromise: Promise<AmmoInstance> | null = null
  private ammo: AmmoInstance | null = null
  private dynamicsWorld: any = null
  private ammoRigidbodies: any[] = []
  private ammoConstraints: any[] = []
  private rigidbodiesInitialized = false
  private jointsCreated = false
  private firstFrame = true
  private forceDisableOffsetForConstraintFrame = true
  private zeroVector: any = null

  // Оптимизации
  private fixedTimeStep: number = 1 / 60
  private maxSubSteps: number = 1
  private enabled: boolean = true
  private lastStepTime: number = 0
  private problemRigidbodyIndices: Set<number> = new Set()
  
  // Дополнительные оптимизации
  private performanceMode: 'high' | 'balanced' | 'low' = 'balanced'
  private distanceCulling: boolean = true
  private cullingDistance: number = 50
  private cameraPosition: Vec3 = new Vec3(0, 0, 0)
  private lazyJointCreation: boolean = true
  private activeRigidbodies: Set<number> = new Set()
  private frameSkipCounter: number = 0
  private frameSkipRate: number = 0 // Каждый N-ый кадр пропускаем физику
  private tempObjects: any[] = [] // Пул временных объектов
  private boneMatrixCache: Map<number, Mat4> = new Map()

  constructor(rigidbodies: Rigidbody[], joints: Joint[] = []) {
    this.rigidbodies = rigidbodies
    this.joints = joints
    this.detectProblemRigidbodies()
    this.initAmmo()
  }

  // Установка режима производительности
  setPerformanceMode(mode: 'high' | 'balanced' | 'low'): void {
    this.performanceMode = mode
    switch (mode) {
      case 'high':
        this.fixedTimeStep = 1 / 60
        this.maxSubSteps = 3
        this.frameSkipRate = 0
        break
      case 'balanced':
        this.fixedTimeStep = 1 / 50
        this.maxSubSteps = 1
        this.frameSkipRate = 1 // Пропускаем каждый 2ой кадр
        break
      case 'low':
        this.fixedTimeStep = 1 / 30
        this.maxSubSteps = 1
        this.frameSkipRate = 2 // Пропускаем каждый 3ий кадр
        break
    }
  }

  // Установка позиции камеры для дистанционного каллинга
  setCameraPosition(position: Vec3): void {
    this.cameraPosition = position
  }

  // Включение/выключение дистанционного каллинга
  setDistanceCulling(enabled: boolean, distance: number = 50): void {
    this.distanceCulling = enabled
    this.cullingDistance = distance
  }

  private detectProblemRigidbodies(): void {
    for (let i = 0; i < this.rigidbodies.length; i++) {
      const rb = this.rigidbodies[i]
      
      const isSmall = rb.size.x < 1 && rb.size.y < 1 && rb.size.z < 1
      const isLight = rb.mass < 0.5
      const hasJoints = this.joints.some(j => 
        j.rigidbodyIndexA === i || j.rigidbodyIndexB === i
      )
      
      if ((isSmall && isLight) || hasJoints) {
        this.problemRigidbodyIndices.add(i)
      }
    }
  }

  markProblemRigidbody(index: number): void {
    this.problemRigidbodyIndices.add(index)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  setPhysicsRate(fixedTimeStep: number, maxSubSteps: number): void {
    this.fixedTimeStep = fixedTimeStep
    this.maxSubSteps = maxSubSteps
  }

  // Оптимизация: отложенная загрузка Ammo
  private async initAmmo(): Promise<void> {
    if (this.ammoInitialized || this.ammoPromise) return
    
    // Приоритизация загрузки - ждем следующий фрейм если браузер занят
    if (typeof requestIdleCallback !== 'undefined') {
      await new Promise(resolve => requestIdleCallback(() => resolve(null)))
    } else {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    
    this.ammoPromise = loadAmmo()
    try {
      this.ammo = await this.ammoPromise
      this.createAmmoWorld()
      this.ammoInitialized = true
    } catch (error) {
      console.error("[Physics] Failed to initialize Ammo:", error)
      this.ammoPromise = null
    }
  }

  // Оптимизация: пул временных объектов
  private getTempVector(x: number, y: number, z: number): any {
    if (!this.ammo) return null
    
    // Ищем свободный вектор в пуле
    for (const vec of this.tempObjects) {
      if (vec.available) {
        vec.available = false
        vec.setValue(x, y, z)
        return vec
      }
    }
    
    // Создаем новый если нет свободных
    const newVec = new this.ammo.btVector3(x, y, z)
    newVec.available = false
    this.tempObjects.push(newVec)
    return newVec
  }

  private returnTempVector(vec: any): void {
    if (vec) {
      vec.available = true
    }
  }

  // Оптимизация: вычисление расстояния до камеры
  private isRigidbodyInRange(rbIndex: number): boolean {
    if (!this.distanceCulling) return true
    
    const rb = this.rigidbodies[rbIndex]
    const ammoBody = this.ammoRigidbodies[rbIndex]
    if (!ammoBody) return true

    const transform = ammoBody.getWorldTransform()
    const origin = transform.getOrigin()
    const position = new Vec3(origin.x(), origin.y(), origin.z())
    
    return position.distanceTo(this.cameraPosition) <= this.cullingDistance
  }

  // Оптимизация: обновление только активных rigidbodies
  private updateActiveRigidbodies(): void {
    this.activeRigidbodies.clear()
    
    for (let i = 0; i < this.rigidbodies.length; i++) {
      const rb = this.rigidbodies[i]
      const ammoBody = this.ammoRigidbodies[i]
      
      if (!ammoBody) continue
      
      // Статические и кинематические всегда активны если в зоне видимости
      if (rb.type !== RigidbodyType.Dynamic) {
        if (this.isRigidbodyInRange(i)) {
          this.activeRigidbodies.add(i)
        }
        continue
      }
      
      // Динамические активны если движутся или в зоне видимости
      const isMoving = ammoBody.getLinearVelocity().length() > 0.1 || 
                      ammoBody.getAngularVelocity().length() > 0.1
      
      if (isMoving || this.isRigidbodyInRange(i)) {
        this.activeRigidbodies.add(i)
        if (!isMoving) {
          ammoBody.activate(false) // Деактивируем если не движется
        }
      }
    }
  }

  setGravity(gravity: Vec3): void {
    this.gravity = gravity
    if (this.dynamicsWorld && this.ammo) {
      const Ammo = this.ammo
      const gravityVec = this.getTempVector(gravity.x, gravity.y, gravity.z)
      this.dynamicsWorld.setGravity(gravityVec)
      this.returnTempVector(gravityVec)
    }
  }

  getGravity(): Vec3 {
    return this.gravity
  }

  getRigidbodies(): Rigidbody[] {
    return this.rigidbodies
  }

  getJoints(): Joint[] {
    return this.joints
  }

  getRigidbodyTransforms(): Array<{ position: Vec3; rotation: Quat }> {
    const transforms: Array<{ position: Vec3; rotation: Quat }> = []

    if (!this.ammo || !this.ammoRigidbodies.length) {
      for (let i = 0; i < this.rigidbodies.length; i++) {
        const rb = this.rigidbodies[i]
        transforms.push({
          position: new Vec3(rb.shapePosition.x, rb.shapePosition.y, rb.shapePosition.z),
          rotation: Quat.fromEuler(rb.shapeRotation.x, rb.shapeRotation.y, rb.shapeRotation.z),
        })
      }
      return transforms
    }

    // Оптимизация: обновляем только активные трансформы
    for (const i of this.activeRigidbodies) {
      const ammoBody = this.ammoRigidbodies[i]
      if (!ammoBody) continue

      const transform = ammoBody.getWorldTransform()
      const origin = transform.getOrigin()
      const rotQuat = transform.getRotation()

      transforms[i] = {
        position: new Vec3(origin.x(), origin.y(), origin.z()),
        rotation: new Quat(rotQuat.x(), rotQuat.y(), rotQuat.z(), rotQuat.w()),
      }
    }

    // Заполняем неактивные bind pose
    for (let i = 0; i < this.rigidbodies.length; i++) {
      if (!transforms[i]) {
        const rb = this.rigidbodies[i]
        transforms[i] = {
          position: new Vec3(rb.shapePosition.x, rb.shapePosition.y, rb.shapePosition.z),
          rotation: Quat.fromEuler(rb.shapeRotation.x, rb.shapeRotation.y, rb.shapeRotation.z),
        }
      }
    }

    return transforms
  }

  private createAmmoWorld(): void {
    if (!this.ammo) return

    const Ammo = this.ammo

    const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration()
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration)
    const overlappingPairCache = new Ammo.btDbvtBroadphase()
    const solver = new Ammo.btSequentialImpulseConstraintSolver()

    this.dynamicsWorld = new Ammo.btDiscreteDynamicsWorld(
      dispatcher,
      overlappingPairCache,
      solver,
      collisionConfiguration
    )

    // Оптимизации в зависимости от режима
    const solverInfo = this.dynamicsWorld.getSolverInfo()
    switch (this.performanceMode) {
      case 'high':
        solverInfo.set_m_numIterations(10)
        break
      case 'balanced':
        solverInfo.set_m_numIterations(6)
        break
      case 'low':
        solverInfo.set_m_numIterations(4)
        break
    }
    
    solverInfo.set_m_splitImpulse(1)
    solverInfo.set_m_splitImpulsePenetrationThreshold(-0.02)

    const gravityVec = this.getTempVector(this.gravity.x, this.gravity.y, this.gravity.z)
    this.dynamicsWorld.setGravity(gravityVec)
    this.returnTempVector(gravityVec)

    this.zeroVector = this.getTempVector(0, 0, 0)
    this.createAmmoRigidbodies()
  }

  private createAmmoRigidbodies(): void {
    if (!this.ammo || !this.dynamicsWorld) return

    const Ammo = this.ammo
    this.ammoRigidbodies = []

    for (let i = 0; i < this.rigidbodies.length; i++) {
      const rb = this.rigidbodies[i]
      const isProblematic = this.problemRigidbodyIndices.has(i)

      let shape: any = null
      const size = rb.size

      switch (rb.shape) {
        case RigidbodyShape.Sphere:
          shape = new Ammo.btSphereShape(size.x)
          break
        case RigidbodyShape.Box:
          const sizeVector = this.getTempVector(size.x, size.y, size.z)
          shape = new Ammo.btBoxShape(sizeVector)
          this.returnTempVector(sizeVector)
          break
        case RigidbodyShape.Capsule:
          shape = new Ammo.btCapsuleShape(size.x, size.y)
          break
        default:
          const defaultHalfExtents = this.getTempVector(size.x / 2, size.y / 2, size.z / 2)
          shape = new Ammo.btBoxShape(defaultHalfExtents)
          this.returnTempVector(defaultHalfExtents)
          break
      }

      if (isProblematic) {
        shape.setMargin(0.05)
      }

      const transform = new Ammo.btTransform()
      transform.setIdentity()

      const shapePos = this.getTempVector(rb.shapePosition.x, rb.shapePosition.y, rb.shapePosition.z)
      transform.setOrigin(shapePos)
      this.returnTempVector(shapePos)

      const shapeRotQuat = Quat.fromEuler(rb.shapeRotation.x, rb.shapeRotation.y, rb.shapeRotation.z)
      const quat = new Ammo.btQuaternion(shapeRotQuat.x, shapeRotQuat.y, shapeRotQuat.z, shapeRotQuat.w)
      transform.setRotation(quat)
      Ammo.destroy(quat)

      const motionState = new Ammo.btDefaultMotionState(transform)
      
      let mass = rb.type === RigidbodyType.Dynamic ? rb.mass : 0
      if (isProblematic && mass > 0) {
        mass = Math.max(mass, 0.1)
      }
      
      const isDynamic = rb.type === RigidbodyType.Dynamic

      const localInertia = this.getTempVector(0, 0, 0)
      if (isDynamic && mass > 0) {
        shape.calculateLocalInertia(mass, localInertia)
      }

      const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
      rbInfo.set_m_restitution(rb.restitution)
      rbInfo.set_m_friction(rb.friction)
      rbInfo.set_m_linearDamping(rb.linearDamping)
      rbInfo.set_m_angularDamping(rb.angularDamping)

      const body = new Ammo.btRigidBody(rbInfo)

      if (isProblematic) {
        body.setSleepingThresholds(0.2, 0.2)
        body.setDamping(rb.linearDamping * 1.5, rb.angularDamping * 1.5)
        body.setCcdMotionThreshold(0.5)
        body.setCcdSweptSphereRadius(0.2)
      } else {
        body.setSleepingThresholds(0.1, 0.1)
        body.setCcdMotionThreshold(0.1)
        body.setCcdSweptSphereRadius(0.1)
      }

      if (rb.type === RigidbodyType.Static || rb.type === RigidbodyType.Kinematic) {
        body.setCollisionFlags(body.getCollisionFlags() | 2)
        body.setActivationState(4)
      }

      const collisionGroup = 1 << rb.group
      const collisionMask = rb.collisionMask

      const isZeroVolume =
        (rb.shape === RigidbodyShape.Sphere && rb.size.x === 0) ||
        (rb.shape === RigidbodyShape.Box && (rb.size.x === 0 || rb.size.y === 0 || rb.size.z === 0)) ||
        (rb.shape === RigidbodyShape.Capsule && (rb.size.x === 0 || rb.size.y === 0))

      if (collisionMask === 0 || isZeroVolume) {
        body.setCollisionFlags(body.getCollisionFlags() | 4)
      }

      this.dynamicsWorld.addRigidBody(body, collisionGroup, collisionMask)
      this.ammoRigidbodies.push(body)
      this.activeRigidbodies.add(i) // Изначально все активны

      Ammo.destroy(rbInfo)
      this.returnTempVector(localInertia)
    }
  }

  private createAmmoJoints(): void {
    if (!this.ammo || !this.dynamicsWorld || this.ammoRigidbodies.length === 0) return

    const Ammo = this.ammo
    this.ammoConstraints = []

    for (const joint of this.joints) {
      // Оптимизация: отложенное создание джойнтов для удаленных объектов
      if (this.lazyJointCreation) {
        const isBodyAActive = this.activeRigidbodies.has(joint.rigidbodyIndexA)
        const isBodyBActive = this.activeRigidbodies.has(joint.rigidbodyIndexB)
        if (!isBodyAActive && !isBodyBActive) {
          continue
        }
      }

      const rbIndexA = joint.rigidbodyIndexA
      const rbIndexB = joint.rigidbodyIndexB

      if (!this.isValidJointIndices(rbIndexA, rbIndexB)) {
        continue
      }

      const bodyA = this.ammoRigidbodies[rbIndexA]
      const bodyB = this.ammoRigidbodies[rbIndexB]

      if (!bodyA || !bodyB) {
        continue
      }

      // Оптимизация: используем кэш для матриц
      const bodyAMat = this.getCachedBodyMatrix(bodyA)
      const bodyBMat = this.getCachedBodyMatrix(bodyB)

      const jointRotQuat = Quat.fromEuler(joint.rotation.x, joint.rotation.y, joint.rotation.z)
      const jointPos = new Vec3(joint.position.x, joint.position.y, joint.position.z)
      const jointTransform = Mat4.fromPositionRotation(jointPos, jointRotQuat)

      const frameInAMat = bodyAMat.inverse().multiply(jointTransform)
      const framePosA = frameInAMat.getPosition()
      const frameRotA = frameInAMat.toQuat()

      const frameInBMat = bodyBMat.inverse().multiply(jointTransform)
      const framePosB = frameInBMat.getPosition()
      const frameRotB = frameInBMat.toQuat()

      const frameInA = new Ammo.btTransform()
      frameInA.setIdentity()
      const pivotInA = this.getTempVector(framePosA.x, framePosA.y, framePosA.z)
      frameInA.setOrigin(pivotInA)
      const quatA = new Ammo.btQuaternion(frameRotA.x, frameRotA.y, frameRotA.z, frameRotA.w)
      frameInA.setRotation(quatA)

      const frameInB = new Ammo.btTransform()
      frameInB.setIdentity()
      const pivotInB = this.getTempVector(framePosB.x, framePosB.y, framePosB.z)
      frameInB.setOrigin(pivotInB)
      const quatB = new Ammo.btQuaternion(frameRotB.x, frameRotB.y, frameRotB.z, frameRotB.w)
      frameInB.setRotation(quatB)

      const useLinearReferenceFrameA = true
      const constraint = new Ammo.btGeneric6DofSpringConstraint(
        bodyA,
        bodyB,
        frameInA,
        frameInB,
        useLinearReferenceFrameA
      )

      if (this.forceDisableOffsetForConstraintFrame) {
        let jointPtr: number | undefined
        if (typeof Ammo.getPointer === "function") {
          jointPtr = Ammo.getPointer(constraint)
        } else {
          const constraintWithPtr = constraint as { ptr?: number }
          jointPtr = constraintWithPtr.ptr
        }

        if (jointPtr !== undefined && Ammo.HEAP8) {
          const heap8 = Ammo.HEAP8 as Uint8Array
          if (heap8[jointPtr + 1300] === (useLinearReferenceFrameA ? 1 : 0) && heap8[jointPtr + 1301] === 1) {
            heap8[jointPtr + 1301] = 0
          }
        }
      }

      for (let i = 0; i < 6; ++i) {
        constraint.setParam(2, 0.475, i)
      }

      const lowerLinear = this.getTempVector(joint.positionMin.x, joint.positionMin.y, joint.positionMin.z)
      const upperLinear = this.getTempVector(joint.positionMax.x, joint.positionMax.y, joint.positionMax.z)
      constraint.setLinearLowerLimit(lowerLinear)
      constraint.setLinearUpperLimit(upperLinear)

      const lowerAngular = this.getTempVector(
        this.normalizeAngle(joint.rotationMin.x),
        this.normalizeAngle(joint.rotationMin.y),
        this.normalizeAngle(joint.rotationMin.z)
      )
      const upperAngular = this.getTempVector(
        this.normalizeAngle(joint.rotationMax.x),
        this.normalizeAngle(joint.rotationMax.y),
        this.normalizeAngle(joint.rotationMax.z)
      )
      constraint.setAngularLowerLimit(lowerAngular)
      constraint.setAngularUpperLimit(upperAngular)

      if (joint.springPosition.x !== 0) {
        constraint.setStiffness(0, joint.springPosition.x)
        constraint.enableSpring(0, true)
      }
      if (joint.springPosition.y !== 0) {
        constraint.setStiffness(1, joint.springPosition.y)
        constraint.enableSpring(1, true)
      }
      if (joint.springPosition.z !== 0) {
        constraint.setStiffness(2, joint.springPosition.z)
        constraint.enableSpring(2, true)
      }

      constraint.setStiffness(3, joint.springRotation.x)
      constraint.enableSpring(3, true)
      constraint.setStiffness(4, joint.springRotation.y)
      constraint.enableSpring(4, true)
      constraint.setStiffness(5, joint.springRotation.z)
      constraint.enableSpring(5, true)

      this.dynamicsWorld.addConstraint(constraint, false)
      this.ammoConstraints.push(constraint)

      this.returnTempVector(pivotInA)
      this.returnTempVector(pivotInB)
      Ammo.destroy(quatA)
      Ammo.destroy(quatB)
      this.returnTempVector(lowerLinear)
      this.returnTempVector(upperLinear)
      this.returnTempVector(lowerAngular)
      this.returnTempVector(upperAngular)
    }
  }

  private getCachedBodyMatrix(body: any): Mat4 {
    const transform = body.getWorldTransform()
    const origin = transform.getOrigin()
    const rotation = transform.getRotation()
    
    const pos = new Vec3(origin.x(), origin.y(), origin.z())
    const rot = new Quat(rotation.x(), rotation.y(), rotation.z(), rotation.w())
    
    return Mat4.fromPositionRotation(pos, rot)
  }

  private isValidJointIndices(indexA: number, indexB: number): boolean {
    return indexA >= 0 && indexA < this.ammoRigidbodies.length &&
           indexB >= 0 && indexB < this.ammoRigidbodies.length
  }

  private normalizeAngle(angle: number): number {
    const pi = Math.PI
    const twoPi = 2 * pi
    let normalized = angle % twoPi
    if (normalized < -pi) {
      normalized += twoPi
    } else if (normalized > pi) {
      normalized -= twoPi
    }
    return normalized
  }

  reset(boneWorldMatrices: Float32Array, boneInverseBindMatrices: Float32Array): void {
    if (!this.ammoInitialized || !this.ammo || !this.dynamicsWorld) {
      return
    }

    const boneCount = boneWorldMatrices.length / 16
    const Ammo = this.ammo

    if (!this.rigidbodiesInitialized) {
      this.computeBodyOffsets(boneInverseBindMatrices, boneCount)
      this.rigidbodiesInitialized = true
    }

    for (let i = 0; i < this.rigidbodies.length; i++) {
      const rb = this.rigidbodies[i]
      const ammoBody = this.ammoRigidbodies[i]
      if (!ammoBody || rb.boneIndex < 0 || rb.boneIndex >= boneCount) continue

      const boneIdx = rb.boneIndex
      const worldMatIdx = boneIdx * 16

      // Используем кэш для bone матриц
      let boneWorldMat = this.boneMatrixCache.get(boneIdx)
      if (!boneWorldMat) {
        boneWorldMat = new Mat4(boneWorldMatrices.subarray(worldMatIdx, worldMatIdx + 16))
        this.boneMatrixCache.set(boneIdx, boneWorldMat)
      }

      const bodyOffsetMatrix = rb.bodyOffsetMatrix!
      const bodyWorldMatrix = boneWorldMat.multiply(bodyOffsetMatrix)

      const worldPos = bodyWorldMatrix.getPosition()
      const worldRot = bodyWorldMatrix.toQuat()

      const transform = new Ammo.btTransform()
      const pos = this.getTempVector(worldPos.x, worldPos.y, worldPos.z)
      const quat = new Ammo.btQuaternion(worldRot.x, worldRot.y, worldRot.z, worldRot.w)

      transform.setOrigin(pos)
      transform.setRotation(quat)

      ammoBody.setWorldTransform(transform)
      ammoBody.getMotionState().setWorldTransform(transform)

      ammoBody.setLinearVelocity(this.zeroVector)
      ammoBody.setAngularVelocity(this.zeroVector)

      if (rb.type === RigidbodyType.Dynamic) {
        ammoBody.activate(true)
      }

      this.returnTempVector(pos)
      Ammo.destroy(quat)
    }

    if (this.dynamicsWorld.stepSimulation) {
      this.dynamicsWorld.stepSimulation(0, 0, 0)
    }

    // Сбрасываем активные rigidbodies
    this.updateActiveRigidbodies()
  }

  step(dt: number, boneWorldMatrices: Float32Array, boneInverseBindMatrices: Float32Array): void {
    if (!this.enabled || !this.ammoInitialized || !this.ammo || !this.dynamicsWorld) {
      return
    }

    // Оптимизация: пропуск кадров
    if (this.frameSkipRate > 0) {
      this.frameSkipCounter++
      if (this.frameSkipCounter > this.frameSkipRate) {
        this.frameSkipCounter = 0
      } else if (this.frameSkipCounter > 0) {
        return // Пропускаем этот кадр
      }
    }

    const boneCount = boneWorldMatrices.length / 16

    if (this.firstFrame) {
      if (!this.rigidbodiesInitialized) {
        this.computeBodyOffsets(boneInverseBindMatrices, boneCount)
        this.rigidbodiesInitialized = true
      }

      this.positionBodiesFromBones(boneWorldMatrices, boneCount)

      if (!this.jointsCreated) {
        this.createAmmoJoints()
        this.jointsCreated = true
      }

      if (this.dynamicsWorld.stepSimulation) {
        this.dynamicsWorld.stepSimulation(0, 0, 0)
      }

      this.firstFrame = false
      this.lastStepTime = performance.now()
      
      // Инициализируем активные rigidbodies
      this.updateActiveRigidbodies()
      return
    }

    const currentTime = performance.now()
    const deltaTime = Math.min((currentTime - this.lastStepTime) / 1000, 0.1)
    this.lastStepTime = currentTime

    // Обновляем активные rigidbodies
    this.updateActiveRigidbodies()

    this.syncFromBones(boneWorldMatrices, boneInverseBindMatrices, boneCount)
    this.stepAmmoPhysics(deltaTime)
    this.applyAmmoRigidbodiesToBones(boneWorldMatrices, boneInverseBindMatrices, boneCount)
  }

  private computeBodyOffsets(boneInverseBindMatrices: Float32Array, boneCount: number): void {
    for (let i = 0; i < this.rigidbodies.length; i++) {
      const rb = this.rigidbodies[i]
      if (rb.boneIndex >= 0 && rb.boneIndex < boneCount) {
        const boneIdx = rb.boneIndex
        const invBindIdx = boneIdx * 16

        const invBindMat = new Mat4(boneInverseBindMatrices.subarray(invBindIdx, invBindIdx + 16))

        const shapeRotQuat = Quat.fromEuler(rb.shapeRotation.x, rb.shapeRotation.y, rb.shapeRotation.z)
        const shapeWorldBind = Mat4.fromPositionRotation(rb.shapePosition, shapeRotQuat)

        const bodyOffsetMatrix = invBindMat.multiply(shapeWorldBind)
        rb.bodyOffsetMatrixInverse = bodyOffsetMatrix.inverse()
        rb.bodyOffsetMatrix = bodyOffsetMatrix
      } else {
        rb.bodyOffsetMatrixInverse = Mat4.identity()
        rb.bodyOffsetMatrix = Mat4.identity()
      }
    }
  }

  private positionBodiesFromBones(boneWorldMatrices: Float32Array, boneCount: number): void {
    if (!this.ammo) return

    const Ammo = this.ammo

    for (let i = 0; i < this.rigidbodies.length; i++) {
      const rb = this.rigidbodies[i]
      const ammoBody = this.ammoRigidbodies[i]
      if (!ammoBody || rb.boneIndex < 0 || rb.boneIndex >= boneCount) continue

      const boneIdx = rb.boneIndex
      const worldMatIdx = boneIdx * 16

      const boneWorldMat = new Mat4(boneWorldMatrices.subarray(worldMatIdx, worldMatIdx + 16))

      const bodyOffsetMatrix = rb.bodyOffsetMatrix!
      const nodeWorldMatrix = boneWorldMat.multiply(bodyOffsetMatrix)

      const worldPos = nodeWorldMatrix.getPosition()
      const worldRot = nodeWorldMatrix.toQuat()

      const transform = new Ammo.btTransform()
      const pos = this.getTempVector(worldPos.x, worldPos.y, worldPos.z)
      const quat = new Ammo.btQuaternion(worldRot.x, worldRot.y, worldRot.z, worldRot.w)

      transform.setOrigin(pos)
      transform.setRotation(quat)

      if (rb.type === RigidbodyType.Static || rb.type === RigidbodyType.Kinematic) {
        ammoBody.setCollisionFlags(ammoBody.getCollisionFlags() | 2)
        ammoBody.setActivationState(4)
      }

      ammoBody.setWorldTransform(transform)
      ammoBody.getMotionState().setWorldTransform(transform)

      ammoBody.setLinearVelocity(this.zeroVector)
      ammoBody.setAngularVelocity(this.zeroVector)

      this.returnTempVector(pos)
      Ammo.destroy(quat)
    }
  }

  private syncFromBones(boneWorldMatrices: Float32Array, boneInverseBindMatrices: Float32Array, boneCount: number): void {
    if (!this.ammo) return

    const Ammo = this.ammo

    // Оптимизация: синхронизируем только активные тела
    for (const i of this.activeRigidbodies) {
      const rb = this.rigidbodies[i]
      const ammoBody = this.ammoRigidbodies[i]
      if (!ammoBody) continue

      if (
        (rb.type === RigidbodyType.Static || rb.type === RigidbodyType.Kinematic) &&
        rb.boneIndex >= 0 && rb.boneIndex < boneCount
      ) {
        const boneIdx = rb.boneIndex
        const worldMatIdx = boneIdx * 16

        const boneWorldMat = new Mat4(boneWorldMatrices.subarray(worldMatIdx, worldMatIdx + 16))

        const bodyOffsetMatrix = rb.bodyOffsetMatrix!
        const nodeWorldMatrix = boneWorldMat.multiply(bodyOffsetMatrix)

        const worldPos = nodeWorldMatrix.getPosition()
        const worldRot = nodeWorldMatrix.toQuat()

        const transform = new Ammo.btTransform()
        const pos = this.getTempVector(worldPos.x, worldPos.y, worldPos.z)
        const quat = new Ammo.btQuaternion(worldRot.x, worldRot.y, worldRot.z, worldRot.w)

        transform.setOrigin(pos)
        transform.setRotation(quat)

        ammoBody.setWorldTransform(transform)
        ammoBody.getMotionState().setWorldTransform(transform)

        ammoBody.setLinearVelocity(this.zeroVector)
        ammoBody.setAngularVelocity(this.zeroVector)

        this.returnTempVector(pos)
        Ammo.destroy(quat)
      }
    }
  }

  private stepAmmoPhysics(dt: number): void {
    if (!this.ammo || !this.dynamicsWorld) return

    this.dynamicsWorld.stepSimulation(dt, this.maxSubSteps, this.fixedTimeStep)
  }

  private applyAmmoRigidbodiesToBones(boneWorldMatrices: Float32Array, boneInverseBindMatrices: Float32Array, boneCount: number): void {
    if (!this.ammo) return

    // Оптимизация: применяем только активные динамические тела
    for (const i of this.activeRigidbodies) {
      const rb = this.rigidbodies[i]
      const ammoBody = this.ammoRigidbodies[i]
      if (!ammoBody) continue

      if (rb.type === RigidbodyType.Dynamic && rb.boneIndex >= 0 && rb.boneIndex < boneCount) {
        const boneIdx = rb.boneIndex
        const worldMatIdx = boneIdx * 16

        const transform = ammoBody.getWorldTransform()
        const origin = transform.getOrigin()
        const rotation = transform.getRotation()

        const nodePos = new Vec3(origin.x(), origin.y(), origin.z())
        const nodeRot = new Quat(rotation.x(), rotation.y(), rotation.z(), rotation.w())
        const nodeWorldMatrix = Mat4.fromPositionRotation(nodePos, nodeRot)

        const boneWorldMat = nodeWorldMatrix.multiply(rb.bodyOffsetMatrixInverse)

        const values = boneWorldMat.values
        if (!isNaN(values[0]) && !isNaN(values[15]) && Math.abs(values[0]) < 1e6 && Math.abs(values[15]) < 1e6) {
          boneWorldMatrices.set(values, worldMatIdx)
        }
      }
    }
  }

  // Очистка ресурсов
  destroy(): void {
    if (this.ammo) {
      // Очищаем пул временных объектов
      for (const obj of this.tempObjects) {
        this.ammo.destroy(obj)
      }
      this.tempObjects = []
      
      if (this.zeroVector) {
        this.ammo.destroy(this.zeroVector)
        this.zeroVector = null
      }
    }
    this.boneMatrixCache.clear()
    this.activeRigidbodies.clear()
    this.problemRigidbodyIndices.clear()
  }
}
