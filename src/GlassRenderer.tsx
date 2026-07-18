import { useEffect, useRef } from 'react'
import type { Settings } from './types'

const MAX_LENSES = 64

const vertexShader = `#version 300 es
precision highp float;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`

const fragmentShader = `#version 300 es
precision highp float;

#define MAX_LENSES 64

uniform sampler2D uBackground;
uniform vec2 uResolution;
uniform vec4 uRects[MAX_LENSES];
uniform vec2 uLensInfo[MAX_LENSES];
uniform int uLensCount;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uBlur;
uniform float uReflection;
uniform float uPixelRatio;
uniform vec2 uPointer;

out vec4 outputColor;

float roundedBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float lensDistance(vec2 screenPoint, vec4 rect, float radius) {
  vec2 center = rect.xy + rect.zw * 0.5;
  return roundedBox(screenPoint - center, rect.zw * 0.5, radius);
}

vec3 backdrop(vec2 uv, float spread) {
  vec2 pixel = vec2(spread) / uResolution;
  vec3 color = texture(uBackground, uv).rgb * 0.24;
  color += texture(uBackground, uv + vec2(pixel.x, 0.0)).rgb * 0.12;
  color += texture(uBackground, uv - vec2(pixel.x, 0.0)).rgb * 0.12;
  color += texture(uBackground, uv + vec2(0.0, pixel.y)).rgb * 0.12;
  color += texture(uBackground, uv - vec2(0.0, pixel.y)).rgb * 0.12;
  color += texture(uBackground, uv + pixel).rgb * 0.07;
  color += texture(uBackground, uv - pixel).rgb * 0.07;
  color += texture(uBackground, uv + vec2(pixel.x, -pixel.y)).rgb * 0.07;
  color += texture(uBackground, uv + vec2(-pixel.x, pixel.y)).rgb * 0.07;
  return color;
}

void main() {
  vec2 screenPoint = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  float shadow = 0.0;
  float caustic = 0.0;
  int activeLens = -1;

  for (int index = 0; index < MAX_LENSES; index++) {
    if (index >= uLensCount) break;
    vec4 rect = uRects[index];
    float radius = uLensInfo[index].x;
    float distance = lensDistance(screenPoint, rect, radius);

    vec2 shifted = screenPoint - vec2(0.0, 7.0 * uPixelRatio);
    float shadowDistance = lensDistance(shifted, rect, radius);
    float localShadow = exp(-max(shadowDistance, 0.0) / (10.0 * uPixelRatio));
    localShadow *= smoothstep(28.0 * uPixelRatio, 0.0, max(shadowDistance, 0.0));
    localShadow *= smoothstep(-2.0 * uPixelRatio, 1.0 * uPixelRatio, shadowDistance);
    shadow = max(shadow, localShadow);

    vec2 glowShift = screenPoint - vec2(4.0, 10.0) * uPixelRatio;
    float glowDistance = lensDistance(glowShift, rect, radius);
    float localCaustic = exp(-abs(glowDistance - 4.0 * uPixelRatio) / (8.0 * uPixelRatio));
    localCaustic *= smoothstep(-1.0, 4.0 * uPixelRatio, glowDistance);
    caustic = max(caustic, localCaustic);

    if (distance <= 1.25 * uPixelRatio) activeLens = index;
  }

  if (activeLens < 0) {
    float outsideAlpha = clamp(shadow * (0.18 + uReflection * 0.1) + caustic * uReflection * 0.035, 0.0, 0.32);
    vec3 outsideColor = mix(vec3(0.03, 0.045, 0.06), vec3(1.0, 0.91, 0.72), caustic * 0.18);
    outputColor = vec4(outsideColor, outsideAlpha);
    return;
  }

  vec4 rect = uRects[activeLens];
  float radius = uLensInfo[activeLens].x;
  float kind = uLensInfo[activeLens].y;
  vec2 center = rect.xy + rect.zw * 0.5;
  vec2 point = screenPoint - center;
  vec2 halfSize = rect.zw * 0.5;
  float distance = roundedBox(point, halfSize, radius);

  float stepSize = max(0.9, uPixelRatio);
  float dx = roundedBox(point + vec2(stepSize, 0.0), halfSize, radius) - roundedBox(point - vec2(stepSize, 0.0), halfSize, radius);
  float dy = roundedBox(point + vec2(0.0, stepSize), halfSize, radius) - roundedBox(point - vec2(0.0, stepSize), halfSize, radius);
  vec2 edgeNormal = normalize(vec2(dx, dy) + vec2(0.0001));

  float edgeWidth = mix(8.0, 15.0, uReflection) * uPixelRatio;
  if (kind > 0.5) edgeWidth *= 0.72;
  float edge = smoothstep(-edgeWidth, 0.5 * uPixelRatio, distance);
  float innerEdge = smoothstep(-edgeWidth * 2.2, -edgeWidth * 0.25, distance);
  float mask = 1.0 - smoothstep(-0.6 * uPixelRatio, 1.3 * uPixelRatio, distance);

  float refractionPixels = mix(3.0, 15.0, uReflection) * uPixelRatio;
  float kindPower = kind > 0.5 ? 1.0 : 0.72;
  vec2 bulge = -point / max(min(rect.z, rect.w), 1.0) * refractionPixels * 0.7 * kindPower;
  vec2 refraction = (edgeNormal * edge * refractionPixels + bulge);
  vec2 refractionUv = vec2(refraction.x, -refraction.y) / uResolution;
  vec2 baseUv = vec2(gl_FragCoord.x, gl_FragCoord.y) / uResolution;
  vec2 sampleUv = clamp(baseUv + refractionUv, vec2(0.001), vec2(0.999));

  float blurSpread = max(0.35, uBlur * (kind > 0.5 ? 0.72 : 1.0));
  vec3 refracted = backdrop(sampleUv, blurSpread);

  float dispersion = edge * uReflection * 1.15 * uPixelRatio;
  vec2 dispersionUv = vec2(edgeNormal.x, -edgeNormal.y) * dispersion / uResolution;
  refracted.r = backdrop(clamp(sampleUv + dispersionUv, vec2(0.001), vec2(0.999)), blurSpread).r;
  refracted.b = backdrop(clamp(sampleUv - dispersionUv, vec2(0.001), vec2(0.999)), blurSpread).b;

  float slope = edge * mix(0.46, 0.92, uReflection);
  vec3 normal = normalize(vec3(-edgeNormal * slope, 1.0));
  vec2 pointerDirection = normalize((uPointer - vec2(0.5)) + vec2(-0.42, -0.55));
  vec3 light = normalize(vec3(pointerDirection, 1.15));
  vec2 rimLightDirection = normalize(vec2(-0.58, -0.82));
  float litRim = max(dot(edgeNormal, rimLightDirection), 0.0);
  float darkRim = max(dot(edgeNormal, -rimLightDirection), 0.0);
  float specular = pow(max(dot(normal, light), 0.0), mix(18.0, 38.0, uReflection));
  specular *= edge * litRim * (0.18 + uReflection * 0.62);

  float topBand = exp(-pow((point.y + halfSize.y - edgeWidth * 0.7) / max(edgeWidth * 0.42, 1.0), 2.0));
  topBand *= smoothstep(halfSize.x, halfSize.x * 0.24, abs(point.x));
  float leftBand = exp(-pow((point.x + halfSize.x - edgeWidth * 0.62) / max(edgeWidth * 0.45, 1.0), 2.0));
  leftBand *= smoothstep(halfSize.y, halfSize.y * 0.18, abs(point.y));
  float lowerOcclusion = exp(-pow((point.y - halfSize.y + edgeWidth * 0.62) / max(edgeWidth * 0.52, 1.0), 2.0));
  float innerRidge = exp(-abs(distance + edgeWidth * 1.08) / max(1.2 * uPixelRatio, 1.0));
  float fresnel = pow(edge, 1.7) * (0.025 + uReflection * 0.055);
  vec2 glossCenter = vec2(-halfSize.x * 0.48, -halfSize.y + edgeWidth * 1.25);
  vec2 glossScale = vec2(max(halfSize.x * 0.32, 18.0 * uPixelRatio), max(edgeWidth * 0.9, 5.0 * uPixelRatio));
  float gloss = exp(-dot((point - glossCenter) / glossScale, (point - glossCenter) / glossScale) * 2.8);
  gloss *= smoothstep(-edgeWidth * 2.1, -edgeWidth * 0.28, distance);
  float cornerScale = max(edgeWidth * 1.4, 8.0 * uPixelRatio);
  vec2 lowerLeft = vec2(-halfSize.x + edgeWidth * .8, halfSize.y - edgeWidth * .7);
  vec2 lowerRight = vec2(halfSize.x - edgeWidth * .8, halfSize.y - edgeWidth * .7);
  vec2 upperRight = vec2(halfSize.x - edgeWidth * .8, -halfSize.y + edgeWidth * .7);
  float cyanCaustic = exp(-dot(point - lowerLeft, point - lowerLeft) / (cornerScale * cornerScale));
  float amberCaustic = exp(-dot(point - lowerRight, point - lowerRight) / (cornerScale * cornerScale));
  float violetCaustic = exp(-dot(point - upperRight, point - upperRight) / (cornerScale * cornerScale));

  float tintAmount = 0.018 + uOpacity * (kind > 0.5 ? 0.3 : 0.22);
  refracted = mix(refracted, uTint, tintAmount);
  refracted += vec3(specular * 0.56);
  refracted += vec3(0.98, 1.0, 1.0) * topBand * litRim * (0.055 + uReflection * 0.105);
  refracted += vec3(0.92, 0.98, 1.0) * leftBand * litRim * (0.035 + uReflection * 0.06);
  refracted += vec3(0.96, 0.985, 1.0) * fresnel;
  refracted += vec3(1.0) * innerRidge * litRim * (0.035 + uReflection * 0.075);
  refracted += vec3(1.0) * gloss * (0.08 + uReflection * 0.16);
  refracted += vec3(0.12, 0.72, 0.94) * cyanCaustic * edge * uReflection * 0.075;
  refracted += vec3(1.0, 0.57, 0.16) * amberCaustic * edge * uReflection * 0.065;
  refracted += vec3(0.58, 0.42, 1.0) * violetCaustic * edge * uReflection * 0.045;
  refracted *= 1.0 - lowerOcclusion * (0.09 + uReflection * 0.115);
  refracted *= 1.0 - darkRim * edge * (0.09 + uReflection * 0.14);
  refracted *= 1.0 - innerRidge * darkRim * (0.045 + uReflection * 0.07);
  refracted *= 1.0 - innerEdge * edge * 0.025;

  float lensAlpha = mask * 0.985;
  outputColor = vec4(clamp(refracted, 0.0, 1.0), lensAlpha);
}`

type Lens = { rect: DOMRect; radius: number; kind: number }

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
      radial(ctx, width, height, .15, .08, settings.backgroundColorB, .48)
      radial(ctx, width, height, .88, .86, settings.backgroundColorC, .52)
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

function visibleLenses(root: HTMLElement): Lens[] {
  const selectors: [string, number][] = [
    ['.quadrant', 0], ['.task-card', 1], ['.header-button', 1], ['.mobile-fab', 1], ['.focus-tabs', 1], ['.check-button', 2]
  ]
  const lenses: Lens[] = []
  selectors.forEach(([selector, kind]) => {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      if (getComputedStyle(element).display === 'none') return
      const rect = element.getBoundingClientRect()
      if (rect.width < 4 || rect.height < 4 || rect.bottom < -40 || rect.top > window.innerHeight + 40) return
      lenses.push({ rect, radius: Number.parseFloat(getComputedStyle(element).borderRadius) || Math.min(rect.width, rect.height) / 2, kind })
    })
  })
  return lenses.slice(0, MAX_LENSES)
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
    const rectValues = new Float32Array(MAX_LENSES * 4)
    const lensValues = new Float32Array(MAX_LENSES * 2)
    const pointer = new Float32Array([.18, .12])
    let lensCount = 0
    let frame = 0
    let stopped = false
    let textureVersion = 0

    const locations = {
      resolution: gl.getUniformLocation(program, 'uResolution'), rects: gl.getUniformLocation(program, 'uRects[0]'),
      lensInfo: gl.getUniformLocation(program, 'uLensInfo[0]'), lensCount: gl.getUniformLocation(program, 'uLensCount'),
      tint: gl.getUniformLocation(program, 'uTint'), opacity: gl.getUniformLocation(program, 'uOpacity'),
      blur: gl.getUniformLocation(program, 'uBlur'), reflection: gl.getUniformLocation(program, 'uReflection'),
      pixelRatio: gl.getUniformLocation(program, 'uPixelRatio'), pointer: gl.getUniformLocation(program, 'uPointer')
    }

    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1i(gl.getUniformLocation(program, 'uBackground'), 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const render = () => {
      frame = 0
      if (stopped) return
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.uniform2f(locations.resolution, canvas.width, canvas.height)
      gl.uniform4fv(locations.rects, rectValues)
      gl.uniform2fv(locations.lensInfo, lensValues)
      gl.uniform1i(locations.lensCount, lensCount)
      const [red, green, blue] = hexToChannels(settings.glassTint)
      gl.uniform3f(locations.tint, red / 255, green / 255, blue / 255)
      gl.uniform1f(locations.opacity, settings.glassOpacity / 100)
      gl.uniform1f(locations.blur, settings.glassBlur * window.devicePixelRatio * .12)
      gl.uniform1f(locations.reflection, settings.glassReflection / 100)
      gl.uniform1f(locations.pixelRatio, Math.min(window.devicePixelRatio || 1, 1.75))
      gl.uniform2fv(locations.pointer, pointer)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const requestRender = () => { if (!frame) frame = window.requestAnimationFrame(render) }

    const collect = () => {
      rectValues.fill(0); lensValues.fill(0)
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75)
      const lenses = visibleLenses(root)
      lensCount = lenses.length
      lenses.forEach(({ rect, radius, kind }, index) => {
        rectValues.set([rect.left * ratio, rect.top * ratio, rect.width * ratio, rect.height * ratio], index * 4)
        lensValues.set([radius * ratio, kind], index * 2)
      })
      requestRender()
    }

    const resize = async () => {
      const version = ++textureVersion
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75)
      const width = Math.max(1, Math.round(window.innerWidth * ratio))
      const height = Math.max(1, Math.round(window.innerHeight * ratio))
      canvas.width = width; canvas.height = height
      sourceCanvas.width = width; sourceCanvas.height = height
      gl.viewport(0, 0, width, height)
      await drawBackground(sourceCanvas, settings)
      if (stopped || version !== textureVersion) return
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas)
      collect()
      onReady(true)
    }

    const pointerMove = (event: PointerEvent) => {
      pointer[0] = event.clientX / Math.max(window.innerWidth, 1)
      pointer[1] = event.clientY / Math.max(window.innerHeight, 1)
      requestRender()
    }
    const observer = new MutationObserver(collect)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    const resizeObserver = new ResizeObserver(collect)
    resizeObserver.observe(root)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', collect, { passive: true })
    window.addEventListener('pointermove', pointerMove, { passive: true })
    void resize()

    return () => {
      stopped = true
      onReady(false)
      observer.disconnect(); resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', collect)
      window.removeEventListener('pointermove', pointerMove)
      if (frame) window.cancelAnimationFrame(frame)
      gl.deleteTexture(texture); gl.deleteVertexArray(vao); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment)
    }
  }, [settings.backgroundPreset, settings.backgroundMode, settings.backgroundSolidColor, settings.backgroundColorA, settings.backgroundColorB, settings.backgroundColorC, settings.customBackground, settings.glassTint, settings.glassOpacity, settings.glassBlur, settings.glassReflection, onReady])

  return <canvas ref={canvasRef} className="optical-glass-canvas" aria-hidden="true" />
}
