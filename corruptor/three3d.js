import * as THREE from './vendor/three.module.js'
import { SVGLoader } from './vendor/SVGLoader.js'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const readScope = () => { try { return window.StrudelCapture?.getScope() } catch (e) { return undefined } }
const rms = (s) => {
  if (!s || !s.length) return 0
  let x = 0
  for (let i = 0; i < s.length; i++) x += s[i] * s[i]
  return Math.min(1, Math.sqrt(x / s.length) * 3)
}

const mkCanvas = (style) => {
  const c = document.createElement('canvas')
  Object.assign(c.style, { position: 'fixed' }, style)
  c.style.setProperty('pointer-events', 'none', 'important') // never block clicks
  c.setAttribute('data-js-three3d', '')
  document.body.appendChild(c)
  return c
}

// ── barely-visible jagged glitch mass, lurking on the background ──
const initDread = () => {
  const canvas = mkCanvas({ inset: '0', width: '100vw', height: '100vh', zIndex: '0', opacity: '0.07' })
  let renderer
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false }) } catch (e) { canvas.remove(); return }

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
  camera.position.z = 6

  // sharp spikes: push each vertex out by a hashed amount → cracked, angular, wrong
  const geo = new THREE.IcosahedronGeometry(3.4, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const spike = 1 + (Math.sin(i * 12.9898) * 43758.5 % 1 + 1) % 1 * 1.1
    pos.setXYZ(i, pos.getX(i) * spike, pos.getY(i) * spike, pos.getZ(i) * spike)
  }
  const mass = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x8a0000 }),
  )
  scene.add(mass)

  const resize = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize)
  resize()

  if (reduced) { renderer.render(scene, camera); return }
  const clock = new THREE.Clock()
  let glitch = 0
  const tick = () => {
    const dt = clock.getDelta()
    mass.rotation.y += dt * 0.04
    mass.rotation.x += dt * 0.016
    if (glitch > 0) {
      glitch -= dt
      mass.rotation.z = (Math.random() - 0.5) * 0.3
      mass.position.x = (Math.random() - 0.5) * 0.7
    } else {
      mass.rotation.z *= 0.85
      mass.position.x *= 0.8
      if (Math.random() < 0.005) glitch = 0.06 + Math.random() * 0.16
    }
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// ── red extruded ANTON logo, flying in 3D by the dev credit ──
const initLogo = async () => {
  const SIZE = 190
  const canvas = mkCanvas({ right: '14px', bottom: '14px', width: `${SIZE}px`, height: `${SIZE}px`, zIndex: '5' })
  let renderer
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }) } catch (e) { canvas.remove(); return }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(SIZE, SIZE, false)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  camera.position.z = 5
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(2, 3, 4); scene.add(key)
  const rim = new THREE.DirectionalLight(0xff2a2a, 0.8); rim.position.set(-3, -1, 2); scene.add(rim)

  let svgText
  try { svgText = await (await fetch('./assets/anton.svg')).text() } catch (e) { canvas.remove(); return }

  const data = new SVGLoader().parse(svgText)
  const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.3, roughness: 0.4 })
  const group = new THREE.Group()
  for (const path of data.paths) {
    const c = path.color
    if (c && (c.r * 0.3 + c.g * 0.59 + c.b * 0.11) < 0.35) continue // drop the dark background rect
    for (const shape of SVGLoader.createShapes(path)) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 240, bevelEnabled: true, bevelThickness: 24, bevelSize: 16, bevelSegments: 1 })
      group.add(new THREE.Mesh(g, mat))
    }
  }
  if (!group.children.length) { canvas.remove(); return }

  const box = new THREE.Box3().setFromObject(group)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  group.children.forEach((m) => m.geometry.translate(-center.x, -center.y, -center.z))
  const scl = 2.6 / Math.max(size.x, size.y)
  group.scale.set(scl, -scl, scl) // SVG y-down → flip

  const rig = new THREE.Group()
  rig.add(group)
  scene.add(rig)

  if (reduced) { rig.rotation.set(-0.2, 0.5, 0); renderer.render(scene, camera); return }
  const clock = new THREE.Clock()
  const tick = () => {
    const dt = clock.getDelta()
    const t = clock.elapsedTime
    const lvl = rms(readScope())
    rig.rotation.y += dt * (0.5 + lvl * 1.4)
    rig.rotation.x = Math.sin(t * 0.5) * 0.35
    rig.position.y = Math.sin(t * 0.8) * 0.18 // gentle float
    rig.position.x = Math.cos(t * 0.6) * 0.12
    rig.scale.setScalar(1 + lvl * 0.12)
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const boot = () => { initDread(); initLogo() }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
else boot()
