export const voronoiCrackFragment = /* glsl */ `
precision mediump float;

varying vec2 vTextureCoord;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_progress;
uniform float u_glow;
uniform float u_seed;

float hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(dot(p, vec2(374.0, 145.3))) * 43758.5453);
}

vec2 voronoi(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);

  float md = 8.0;
  vec2 mr = vec2(0.0);

  for (int j = -2; j <= 2; ++j) {
    for (int i = -2; i <= 2; ++i) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(n + g), hash(n + g + 1.0));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        mr = r;
      }
    }
  }

  return vec2(sqrt(md), mr.x * mr.y);
}

float edgeDistance(vec2 uv) {
  vec2 c = voronoi(uv * 4.0 + u_seed * 8.0);
  float cell = c.x;
  float ridge = abs(c.y);
  return mix(cell, ridge, 0.8);
}

void main() {
  vec2 uv = vTextureCoord;
  vec2 st = uv * u_resolution.xy / min(u_resolution.x, u_resolution.y);

  float d = edgeDistance(st);
  float threshold = mix(0.003, 0.02, u_progress);
  float crack = smoothstep(threshold, threshold - 0.0025, d);
  float glowWidth = mix(0.04, 0.12, u_glow);
  float glow = smoothstep(glowWidth, 0.0, d);

  float flicker = 0.75 + 0.25 * sin(u_time * 6.2831 + u_seed * 12.0);
  float pulse = 1.0 + 0.45 * sin(u_time * 7.6);

  vec3 neonA = vec3(0.133, 1.0, 0.533);
  vec3 neonB = vec3(0.09, 0.8, 0.435);
  vec3 neon = mix(neonA, neonB, 0.5 + 0.5 * sin(u_time * 3.0));
  neon *= flicker * pulse;

  float alpha = clamp(crack + glow * 0.6, 0.0, 1.0);
  vec3 color = neon * (0.9 + glow * 0.7);

  gl_FragColor = vec4(color, alpha * clamp(u_glow + 0.2, 0.0, 1.0));
}
`;

export default voronoiCrackFragment;
