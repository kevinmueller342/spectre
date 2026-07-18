import { useEffect, useRef } from 'react'
import { gradientGeometry } from './defaults'
import type { Settings } from './types'

const vertexShader = `#version 300 es
precision highp float;

uniform vec4 uDrawRect;
uniform vec2 uResolution;
out vec2 vScreenPoint;

const vec2 vertices[6] = vec2[6](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
  vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)
);

void main() {
  vec2 screenPoint = uDrawRect.xy + vertices[gl_VertexID] * uDrawRect.zw;
  vec2 position = vec2(screenPoint.x / uResolution.x, 1.0 - screenPoint.y / uResolution.y);
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
  vScreenPoint = screenPoint;
}`

const fragmentShader = `#version 300 es
precision highp float;

uniform sampler2D uBackground;
uniform vec2 uResolution;
uniform vec4 uLensRect;
uniform vec2 uLensInfo;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uBlur;
uniform float uReflection;
uniform float uDepth;
uniform float uPixelRatio;
uniform vec2 uPointer;

in vec2 vScreenPoint;
out vec4 outputColor;

float roundedBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float distanceToLens(vec2 screenPoint, vec2 center, vec2 halfSize, float radius) {
  return roundedBox(screenPoint - center, halfSize, radius);
}

vec3 blurBackdrop(vec2 uv, float spread) {
  vec2 pixel = vec2(spread) / uResolution;
  vec3 color = texture(uBackground, uv).rgb * 0.40;
  color += texture(uBackground, uv + vec2(pixel.x, 0.0)).rgb * 0.15;
  color += texture(uBackground, uv - vec2(pixel.x, 0.0)).rgb * 0.15;
  color += texture(uBackground, uv + vec2(0.0, pixel.y)).rgb * 0.15;
  color += texture(uBackground, uv - vec2(0.0, pixel.y)).rgb * 0.15;
  return color;
}

void main() {
  vec2 center = uLensRect.xy + uLensRect.zw * 0.5;
  vec2 halfSize = uLensRect.zw * 0.5;
  vec2 point = vScreenPoint - center;
  float radius = uLensInfo.x;
  float kind = uLensInfo.y;
  float depth = smoothstep(0.0, 1.0, uDepth);
  float distance = roundedBox(point, halfSize, radius);

  float shadowOffset = mix(2.0, 14.0, depth) * uPixelRatio;
  float shadowDistance = distanceToLens(vScreenPoint - vec2(shadowOffset * 0.32, shadowOffset), center, halfSize, radius);
  float shadowRange = mix(5.0, 22.0, depth) * uPixelRatio;
  float contactShadow = exp(-max(shadowDistance, 0.0) / max(shadowRange, 1.0));
  contactShadow *= smoothstep(shadowRange * 2.2, 0.0, max(shadowDistance, 0.0));
  contactShadow *= smoothstep(-1.5 * uPixelRatio, 1.5 * uPixelRatio, shadowDistance);

  float causticDistance = distanceToLens(vScreenPoint - vec2(shadowOffset * 0.5, shadowOffset * 1.15), center, halfSize, radius);
  float outsideCaustic = exp(-abs(causticDistance - 2.5 * uPixelRatio) / max(7.0 * uPixelRatio, 1.0));
  outsideCaustic *= smoothstep(-1.0 * uPixelRatio, 4.0 * uPixelRatio, causticDistance) * depth * uReflection;

  if (distance > 1.5 * uPixelRatio) {
    float alpha = clamp(contactShadow * (0.13 + depth * 0.17) + outsideCaustic * 0.035, 0.0, 0.34);
    vec3 color = mix(vec3(0.025, 0.035, 0.05), vec3(1.0, 0.90, 0.72), outsideCaustic * 0.13);
    outputColor = vec4(color, alpha);
    return;
  }

  float sampleStep = max(0.85, uPixelRatio);
  float dx = roundedBox(point + vec2(sampleStep, 0.0), halfSize, radius) - roundedBox(point - vec2(sampleStep, 0.0), halfSize, radius);
  float dy = roundedBox(point + vec2(0.0, sampleStep), halfSize, radius) - roundedBox(point - vec2(0.0, sampleStep), halfSize, radius);
  vec2 edgeNormal = normalize(vec2(dx, dy) + vec2(0.0001));

  float kindScale = kind > 0.5 ? 0.72 : 1.0;
  float edgeWidth = mix(3.0, 17.0, depth) * kindScale * uPixelRatio;
  float edge = smoothstep(-edgeWidth, 0.5 * uPixelRatio, distance);
  float deepEdge = smoothstep(-edgeWidth * 2.4, -edgeWidth * 0.28, distance);
  float mask = 1.0 - smoothstep(-0.8 * uPixelRatio, 1.25 * uPixelRatio, distance);

  float refractionPixels = mix(1.0, 18.0, depth) * mix(0.58, 1.0, uReflection) * kindScale * uPixelRatio;
  vec2 curvature = -point / max(min(uLensRect.z, uLensRect.w), 1.0) * refractionPixels * 0.62;
  vec2 refraction = edgeNormal * edge * refractionPixels + curvature;
  vec2 baseUv = vec2(vScreenPoint.x / uResolution.x, 1.0 - vScreenPoint.y / uResolution.y);
  vec2 sampleUv = clamp(baseUv + vec2(refraction.x, -refraction.y) / uResolution, vec2(0.002), vec2(0.998));
  float blurSpread = max(0.45, uBlur * (kind > 0.5 ? 0.66 : 1.0));
  vec3 refracted = blurBackdrop(sampleUv, blurSpread);

  float dispersion = edge * depth * uReflection * 1.35 * uPixelRatio;
  vec2 dispersionUv = vec2(edgeNormal.x, -edgeNormal.y) * dispersion / uResolution;
  refracted.r = texture(uBackground, clamp(sampleUv + dispersionUv, vec2(0.002), vec2(0.998))).r;
  refracted.b = texture(uBackground, clamp(sampleUv - dispersionUv, vec2(0.002), vec2(0.998))).b;

  vec2 pointerDirection = normalize((uPointer - vec2(0.5)) + vec2(-0.52, -0.64));
  vec2 keyDirection = normalize(mix(vec2(-0.58, -0.82), pointerDirection, 0.18));
  float litRim = max(dot(edgeNormal, keyDirection), 0.0);
  float darkRim = max(dot(edgeNormal, -keyDirection), 0.0);

  float shell = pow(edge, 1.35);
  float innerRidge = exp(-abs(distance + edgeWidth * 1.05) / max(mix(0.8, 1.8, depth) * uPixelRatio, 1.0));
  float innerDark = exp(-abs(distance + edgeWidth * 1.62) / max(2.4 * uPixelRatio, 1.0));
  float topBand = exp(-pow((point.y + halfSize.y - edgeWidth * 0.64) / max(edgeWidth * 0.33, 1.0), 2.0));
  topBand *= smoothstep(halfSize.x, halfSize.x * 0.20, abs(point.x));
  float leftBand = exp(-pow((point.x + halfSize.x - edgeWidth * 0.58) / max(edgeWidth * 0.38, 1.0), 2.0));
  leftBand *= smoothstep(halfSize.y, halfSize.y * 0.18, abs(point.y));
  float bottomShade = exp(-pow((point.y - halfSize.y + edgeWidth * 0.68) / max(edgeWidth * 0.50, 1.0), 2.0));

  vec2 glossCenter = vec2(-halfSize.x * 0.42, -halfSize.y + edgeWidth * 1.18);
  vec2 glossScale = vec2(max(halfSize.x * 0.27, 18.0 * uPixelRatio), max(edgeWidth * 0.72, 4.0 * uPixelRatio));
  vec2 glossPoint = (point - glossCenter) / glossScale;
  float gloss = exp(-dot(glossPoint, glossPoint) * 2.7) * smoothstep(-edgeWidth * 2.4, -edgeWidth * 0.32, distance);

  float cornerScale = max(edgeWidth * 1.05, 7.0 * uPixelRatio);
  vec2 lowerLeft = vec2(-halfSize.x + edgeWidth * .72, halfSize.y - edgeWidth * .66);
  vec2 lowerRight = vec2(halfSize.x - edgeWidth * .72, halfSize.y - edgeWidth * .66);
  vec2 upperRight = vec2(halfSize.x - edgeWidth * .72, -halfSize.y + edgeWidth * .66);
  float cyanCaustic = exp(-dot(point - lowerLeft, point - lowerLeft) / (cornerScale * cornerScale));
  float amberCaustic = exp(-dot(point - lowerRight, point - lowerRight) / (cornerScale * cornerScale));
  float violetCaustic = exp(-dot(point - upperRight, point - upperRight) / (cornerScale * cornerScale));

  float tintAmount = 0.012 + uOpacity * (kind > 0.5 ? 0.28 : 0.20);
  refracted = mix(refracted, uTint, tintAmount);
  refracted += vec3(1.0, 1.0, 0.995) * topBand * (0.10 + depth * uReflection * 0.38);
  refracted += vec3(0.93, 0.98, 1.0) * leftBand * (0.035 + depth * uReflection * 0.12);
  refracted += vec3(1.0) * shell * litRim * (0.08 + depth * uReflection * 0.24);
  refracted += vec3(1.0) * innerRidge * litRim * (0.035 + depth * uReflection * 0.12);
  refracted += vec3(1.0) * gloss * (0.07 + depth * uReflection * 0.22);
  refracted += vec3(0.10, 0.62, 0.88) * cyanCaustic * edge * depth * uReflection * 0.055;
  refracted += vec3(1.0, 0.58, 0.18) * amberCaustic * edge * depth * uReflection * 0.050;
  refracted += vec3(0.54, 0.38, 0.92) * violetCaustic * edge * depth * uReflection * 0.032;
  refracted *= 1.0 - bottomShade * (0.06 + depth * 0.13);
  refracted *= 1.0 - shell * darkRim * (0.08 + depth * 0.17);
  refracted *= 1.0 - innerRidge * darkRim * (0.035 + depth * 0.085);
  refracted *= 1.0 - innerDark * deepEdge * (0.012 + depth * 0.045);

  float lensAlpha = mask * mix(0.90, 0.985, uOpacity);
  outputColor = vec4(clamp(refracted, 0.0, 1.0), lensAlpha);
}`

type Lens = { rect: DOMRect; radius: number; kind: number; clip?: DOMRect }
type LensElement = { element: HTMLElement; radius: number; kind: number; clip?: HTMLElement }

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function hexToChannels(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const
}

function transparent(hex: string) {
  const [red, green, blue] = hexToChannels(hex)
  return `rgba(${red}, ${green}, ${blue}, 0)`
}

function radial(ctx: CanvasRenderingContext2D, width: number, height: number, x: number, y: number, color: string, radius: number) {
  const gradient = ctx.createRadialGradient(width * x, height * y, 0, width * x, height * y, Math.max(width, height) * radius)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, transparent(color))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

function linear(ctx: CanvasRenderingContext2D, width: number, height: number, colors: string[]) {
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  colors.forEach((color, index) => gradient.addColorStop(index / Math.max(colors.length - 1, 1), color))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

async function drawBackground(canvas: HTMLCanvasElement, settings: Settings) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  if (settings.backgroundPreset === 'custom' && settings.customBackground) {
    const image = new Image()
    image.src = settings.customBackground
    await image.decode().catch(() => undefined)
    if (image.naturalWidth && image.naturalHeight) {
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
      const drawWidth = image.naturalWidth * scale
      const drawHeight = image.naturalHeight * scale
      ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
      return
    }
  }

  if (settings.backgroundPreset === 'palette') {
    ctx.fillStyle = settings.backgroundMode === 'solid' ? settings.backgroundSolidColor : settings.backgroundColorA
    ctx.fillRect(0, 0, width, height)
    if (settings.backgroundMode === 'gradient') {
      const geometry = gradientGeometry(settings.backgroundGradientAngle, settings.backgroundGradientSpread)
      radial(ctx, width, height, geometry.lightX / 100, geometry.lightY / 100, settings.backgroundColorB, geometry.radius / 100)
      radial(ctx, width, height, geometry.accentX / 100, geometry.accentY / 100, settings.backgroundColorC, geometry.radius / 100)
    }
    return
  }

  if (settings.backgroundPreset === 'linen') {
    linear(ctx, width, height, ['#e9e4dc', '#c9d4ce', '#d8c9c1'])
    return
  }

  const presets = {
    aurora: { base: '#d9d9d2', spots: [[.12, .16, '#e8cfc4', .42], [.86, .14, '#bedbd2', .45], [.6, .84, '#c8c8df', .5]] },
    dusk: { base: '#777a91', spots: [[.2, .2, '#b9c8dc', .48], [.8, .78, '#d6b8bf', .5]] },
    bloom: { base: '#d7e1d4', spots: [[.14, .74, '#efc5bb', .44], [.78, .18, '#d8c8ed', .46]] },
    midnight: { base: '#151923', spots: [[.25, .18, '#3c5a67', .48], [.78, .82, '#514560', .52]] }
  } as const
  const preset = presets[settings.backgroundPreset as keyof typeof presets] || presets.aurora
  ctx.fillStyle = preset.base
  ctx.fillRect(0, 0, width, height)
  preset.spots.forEach(([x, y, color, radius]) => radial(ctx, width, height, x, y, color, radius))
}

function collectLensElements(root: HTMLElement): LensElement[] {
  const selectors: [string, number][] = [
    ['.quadrant', 0], ['.task-card', 1], ['.header-button', 1], ['.mobile-fab', 1], ['.focus-tabs', 1], ['.check-button', 2]
  ]
  const result: LensElement[] = []
  selectors.forEach(([selector, kind]) => {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return
      const rect = element.getBoundingClientRect()
      result.push({ element, kind, radius: Number.parseFloat(style.borderRadius) || Math.min(rect.width, rect.height) / 2, clip: selector === '.task-card' ? element.closest<HTMLElement>('.task-list') ?? undefined : undefined })
    })
  })
  return result
}

function measureVisible(elements: LensElement[]): Lens[] {
  const margin = 52
  return elements.flatMap(({ element, radius, kind, clip }) => {
    const rect = element.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4 || rect.right < -margin || rect.left > window.innerWidth + margin || rect.bottom < -margin || rect.top > window.innerHeight + margin) return []
    const clipRect = clip?.getBoundingClientRect()
    if (clipRect && (rect.right < clipRect.left || rect.left > clipRect.right || rect.bottom < clipRect.top || rect.top > clipRect.bottom)) return []
    return [{ rect, radius, kind, clip: clipRect }]
  })
}

function renderRatio() {
  return Math.min(window.devicePixelRatio || 1, 1.5)
}

export function GlassRenderer({ settings, onReady }: { settings: Settings; onReady: (ready: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const root = canvas?.closest<HTMLElement>('.app')
    if (!canvas || !root || !('WebGL2RenderingContext' in window) || window.matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      onReady(false)
      return
    }

    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' })
    if (!gl) { onReady(false); return }
    const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader)
    if (!vertex || !fragment) { onReady(false); return }
    const program = gl.createProgram()
    if (!program) { onReady(false); return }
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program)); onReady(false); return
    }

    const texture = gl.createTexture()
    const vao = gl.createVertexArray()
    if (!texture || !vao) { onReady(false); return }
    const sourceCanvas = document.createElement('canvas')
    const pointer = new Float32Array([.18, .12])
    let lensElements: LensElement[] = []
    let lenses: Lens[] = []
    let renderFrame = 0
    let layoutFrame = 0
    let rebuildFrame = 0
    let resizeFrame = 0
    let stopped = false
    let textureVersion = 0

    const locations = {
      resolution: gl.getUniformLocation(program, 'uResolution'), drawRect: gl.getUniformLocation(program, 'uDrawRect'),
      lensRect: gl.getUniformLocation(program, 'uLensRect'), lensInfo: gl.getUniformLocation(program, 'uLensInfo'),
      tint: gl.getUniformLocation(program, 'uTint'), opacity: gl.getUniformLocation(program, 'uOpacity'),
      blur: gl.getUniformLocation(program, 'uBlur'), reflection: gl.getUniformLocation(program, 'uReflection'),
      depth: gl.getUniformLocation(program, 'uDepth'), pixelRatio: gl.getUniformLocation(program, 'uPixelRatio'),
      pointer: gl.getUniformLocation(program, 'uPointer')
    }

    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1i(gl.getUniformLocation(program, 'uBackground'), 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const render = () => {
      renderFrame = 0
      if (stopped) return
      const ratio = renderRatio()
      const margin = (18 + settings.glassDepth * .24) * ratio
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.uniform2f(locations.resolution, canvas.width, canvas.height)
      const [red, green, blue] = hexToChannels(settings.glassTint)
      gl.uniform3f(locations.tint, red / 255, green / 255, blue / 255)
      gl.uniform1f(locations.opacity, settings.glassOpacity / 100)
      gl.uniform1f(locations.blur, settings.glassBlur * ratio * .14)
      gl.uniform1f(locations.reflection, settings.glassReflection / 100)
      gl.uniform1f(locations.depth, settings.glassDepth / 100)
      gl.uniform1f(locations.pixelRatio, ratio)
      gl.uniform2fv(locations.pointer, pointer)
      lenses.forEach(({ rect, radius, kind, clip }) => {
        const left = rect.left * ratio
        const top = rect.top * ratio
        const width = rect.width * ratio
        const height = rect.height * ratio
        gl.uniform4f(locations.drawRect, left - margin, top - margin, width + margin * 2, height + margin * 2)
        gl.uniform4f(locations.lensRect, left, top, width, height)
        gl.uniform2f(locations.lensInfo, radius * ratio, kind)
        if (clip) {
          const clipLeft = Math.max(0, clip.left * ratio)
          const clipTop = Math.max(0, clip.top * ratio)
          const clipRight = Math.min(canvas.width, clip.right * ratio)
          const clipBottom = Math.min(canvas.height, clip.bottom * ratio)
          gl.enable(gl.SCISSOR_TEST)
          gl.scissor(Math.round(clipLeft), Math.round(canvas.height - clipBottom), Math.max(0, Math.round(clipRight - clipLeft)), Math.max(0, Math.round(clipBottom - clipTop)))
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        if (clip) gl.disable(gl.SCISSOR_TEST)
      })
    }

    const requestRender = () => { if (!renderFrame) renderFrame = window.requestAnimationFrame(render) }
    const measure = () => { lenses = measureVisible(lensElements); requestRender() }
    const scheduleLayout = () => {
      if (layoutFrame) return
      layoutFrame = window.requestAnimationFrame(() => { layoutFrame = 0; measure() })
    }
    const rebuild = () => { lensElements = collectLensElements(root); measure() }
    const scheduleRebuild = () => {
      if (rebuildFrame) return
      rebuildFrame = window.requestAnimationFrame(() => { rebuildFrame = 0; rebuild() })
    }

    const resize = async () => {
      resizeFrame = 0
      const version = ++textureVersion
      const ratio = renderRatio()
      const width = Math.max(1, Math.round(window.innerWidth * ratio))
      const height = Math.max(1, Math.round(window.innerHeight * ratio))
      canvas.width = width; canvas.height = height
      sourceCanvas.width = width; sourceCanvas.height = height
      gl.viewport(0, 0, width, height)
      await drawBackground(sourceCanvas, settings)
      if (stopped || version !== textureVersion) return
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas)
      rebuild()
      onReady(true)
    }
    const scheduleResize = () => {
      if (resizeFrame) return
      resizeFrame = window.requestAnimationFrame(() => { void resize() })
    }

    const pointerMove = (event: PointerEvent) => {
      pointer[0] = event.clientX / Math.max(window.innerWidth, 1)
      pointer[1] = event.clientY / Math.max(window.innerHeight, 1)
      requestRender()
    }
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList' || record.attributeName === 'class')) scheduleRebuild()
      else scheduleLayout()
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    const resizeObserver = new ResizeObserver(scheduleLayout)
    resizeObserver.observe(root)
    window.addEventListener('resize', scheduleResize)
    window.addEventListener('scroll', scheduleLayout, { passive: true })
    root.addEventListener('scroll', scheduleLayout, { capture: true, passive: true })
    window.addEventListener('pointermove', pointerMove, { passive: true })
    void resize()

    return () => {
      stopped = true
      onReady(false)
      observer.disconnect(); resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleResize)
      window.removeEventListener('scroll', scheduleLayout)
      root.removeEventListener('scroll', scheduleLayout, true)
      window.removeEventListener('pointermove', pointerMove)
      if (renderFrame) window.cancelAnimationFrame(renderFrame)
      if (layoutFrame) window.cancelAnimationFrame(layoutFrame)
      if (rebuildFrame) window.cancelAnimationFrame(rebuildFrame)
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      gl.deleteTexture(texture); gl.deleteVertexArray(vao); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment)
    }
  }, [settings.backgroundPreset, settings.backgroundMode, settings.backgroundSolidColor, settings.backgroundColorA, settings.backgroundColorB, settings.backgroundColorC, settings.backgroundGradientAngle, settings.backgroundGradientSpread, settings.customBackground, settings.glassTint, settings.glassOpacity, settings.glassBlur, settings.glassReflection, settings.glassDepth, onReady])

  return <canvas ref={canvasRef} className="optical-glass-canvas" aria-hidden="true" />
}
