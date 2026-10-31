import { useEffect, useRef } from 'react';

export default function CrystallineShader({ motionPaused }: { motionPaused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    let isDisposed = false;

    function syncSize() {
      if (!canvas) return;
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    syncSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => syncSize());
      resizeObserver.observe(document.body);
    }
    window.addEventListener('resize', syncSize, { passive: true });

    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' }) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return;

    const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

    const fs = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
varying vec2 v_texCoord;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 mouse = u_mouse / u_resolution.xy;
    if (length(u_mouse) < 1.0) {
        mouse = vec2(0.5, 0.5);
    }
    
    float t = u_time * 0.25;
    
    // Interactive mouse displacement ripple
    float distMouse = distance(uv, mouse);
    float mouseWave = sin(distMouse * 18.0 - u_time * 2.5) * exp(-distMouse * 4.0) * 0.08;
    
    vec2 p = uv * 2.5 + vec2(t * 0.1, t * 0.15) + vec2(mouseWave);
    
    // Multi-octave organic crystalline flow
    float n1 = snoise(p);
    float n2 = snoise(p * 2.1 - vec2(t * 0.2, -t * 0.15));
    float n3 = snoise(p * 4.3 + vec2(n1 * 0.5, n2 * 0.5));
    
    float pattern = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
    
    // Light futuristic palette stops
    vec3 bgIce = vec3(0.98, 0.98, 1.0);
    vec3 cyanGlow = vec3(0.0, 0.95, 0.99);
    vec3 skyBlue = vec3(0.35, 0.65, 1.0);
    vec3 purpleGlow = vec3(0.62, 0.42, 0.98);
    vec3 specularWhite = vec3(1.0, 1.0, 1.0);
    
    // Blend organic fluid gradient
    vec3 col = bgIce;
    col = mix(col, skyBlue, smoothstep(-0.4, 0.6, pattern) * 0.20);
    col = mix(col, cyanGlow, smoothstep(0.1, 0.8, n2) * 0.25);
    col = mix(col, purpleGlow, smoothstep(0.2, 0.9, n3) * 0.12);
    
    // Specular crystalline caustic shimmer highlights
    float caustic = pow(max(0.0, 1.0 - abs(pattern)), 8.0);
    col += specularWhite * caustic * 0.30;
    
    // Radial light bloom centered dynamically between hero and console
    vec2 heroGlowPos = mix(vec2(0.65, 0.6), mouse, 0.15);
    float glowRadius = 1.0 - distance(uv, heroGlowPos) * 0.9;
    glowRadius = clamp(glowRadius, 0.0, 1.0);
    col += cyanGlow * pow(glowRadius, 2.5) * 0.22;

    gl_FragColor = vec4(col, 1.0);
}`;

    function compileShader(type: number, src: string) {
      const shader = gl!.createShader(type);
      if (!shader) return null;
      gl!.shaderSource(shader, src);
      gl!.compileShader(shader);
      return shader;
    }

    const vShader = compileShader(gl.VERTEX_SHADER, vs);
    const fShader = compileShader(gl.FRAGMENT_SHADER, fs);
    if (!vShader || !fShader) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vShader);
    gl.attachShader(prog, fShader);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    const mouse = { x: canvas.width / 2, y: canvas.height / 2 };

    const handleMouseMove = (event: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = 1.0 - (event.clientY - rect.top) / rect.height;
        mouse.x = nx * canvas.width;
        mouse.y = ny * canvas.height;
      }
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    let startTime = performance.now();
    function render(now: number) {
      if (isDisposed) return;
      const elapsed = motionPaused ? 1000 : (now - startTime);
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      if (uTime) gl!.uniform1f(uTime, elapsed * 0.001);
      if (uRes) gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      if (uMouse) gl!.uniform2f(uMouse, mouse.x, mouse.y);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      if (!motionPaused) {
        animId = requestAnimationFrame(render);
      }
    }
    animId = requestAnimationFrame(render);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', syncSize);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [motionPaused]);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none opacity-85 -z-10 overflow-hidden" aria-hidden="true">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}

