/** Shared GLSL snippets: cheap hash noise used by sky, clouds and water. */
export const GLSL_NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i + vec3(0.0,0.0,0.0)), hash13(i + vec3(1.0,0.0,0.0)), f.x),
                 mix(hash13(i + vec3(0.0,1.0,0.0)), hash13(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0.0,0.0,1.0)), hash13(i + vec3(1.0,0.0,1.0)), f.x),
                 mix(hash13(i + vec3(0.0,1.0,1.0)), hash13(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
}
float vnoise2(vec2 x) {
  vec2 i = floor(x); vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash13(vec3(i, 0.0)), hash13(vec3(i + vec2(1.0, 0.0), 0.0)), f.x),
             mix(hash13(vec3(i + vec2(0.0, 1.0), 0.0)), hash13(vec3(i + vec2(1.0, 1.0), 0.0)), f.x), f.y);
}
float fbm3d(vec3 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise3(p); p *= 2.02; a *= 0.5; }
  return s;
}
float fbm2d(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise2(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;
