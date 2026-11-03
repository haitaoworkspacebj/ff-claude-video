// Act II · the ice. One shader, three modes driven by uniforms:
//   uMode 0: polar descent — the Earth from orbit to the South Pole surface
//   uMode 1: ice dive — volumetric ice: bubbles, crystal sparkle, banding,
//            light falling off with depth until only black remains
//   uMode 2: the array — IceCube strings + DOMs in the dark ice
#include "icecube.glsl"
uniform float uMode;
uniform float uSurfLight;   // daylight on the ice (falls off with depth)
uniform float uDepth;       // camera depth (100 m units, positive down) for the readout & light
uniform vec3  uSun;
uniform vec3  uNuA, uNuB;   // neutrino crossing (dim, the "trace" of cue 11/12)
uniform float uNuOn;
uniform float uStarUp;      // stars visible above the ice (mode 2 look-up)
uniform float uNight;       // night at the pole: starlit snow, Milky Way, lit lab windows
uniform float uCut;         // cutaway: see the array through the snow from above

vec3 nuThread(vec3 ro, vec3 rd){
  if (uNuOn <= 0.0) return vec3(0);
  return trail(ro, rd, uNuA, uNuB, 1e9, 0.02, uNuOn, 0.25) + pointGlow(ro, rd, uNuB, 0.02, CBLUE*uNuOn);
}

// IceCube Lab (ICL) on the surface, ≈ 50 × 12 × 20 m, in 100 m units
const vec3 LAB_C = vec3(0.4, 0.06, 0.1), LAB_H = vec3(0.25, 0.06, 0.1);
vec2 boxHit(vec3 ro, vec3 rd, vec3 h, out vec3 n){
  vec3 m = 1.0/rd, k = abs(m)*h, nn = -m*ro;
  vec3 t1 = nn - k, t2 = nn + k;
  float tN = max(max(t1.x, t1.y), t1.z), tF = min(min(t2.x, t2.y), t2.z);
  n = vec3(0);
  if (tN > tF || tF < 0.0) return vec2(-1.0);
  n = -sign(rd)*step(t1.yzx, t1.xyz)*step(t1.zxy, t1.xyz);
  return vec2(tN, tF);
}

vec3 earthFromSpace(vec3 ro, vec3 rd){
  vec3 col = stars(rd, 0.7, 0.0);
  vec2 h = sphIntersect(ro, rd, vec3(0), 1.0);
  if (h.y > 0.0){
    vec3 n = normalize(ro + rd*h.x);
    float c = fbm(n*2.2 + 4.0, 5);
    float land = smoothstep(0.50, 0.53, c);
    vec3 base = mix(vec3(0.015, 0.03, 0.06), vec3(0.2, 0.2, 0.17), land);
    float cap = smoothstep(-0.72, -0.82, n.y);                    // Antarctica (south)
    base = mix(base, vec3(0.88, 0.92, 0.97)*(0.85 + 0.15*fbm(n*20.0, 3)), cap);
    float cl = smoothstep(0.55, 0.78, fbm(n*3.5, 5));
    base = mix(base, vec3(0.9), cl*0.7*(1.0 - cap*0.5));
    float diff = max(dot(n, uSun), 0.0);
    col = base*(diff*1.3 + 0.01) + ICE*pow(1.0 - max(dot(-rd, n), 0.0), 3.0)*diff*0.4;
  }
  vec3 oc = -ro; float b = length(oc - rd*dot(oc, rd));
  col += vec3(0.55, 0.72, 1.0)*exp(-max(b - 1.0, 0.0)*45.0)*smoothstep(0.96, 1.0, b)*0.45;
  return col;
}

// the ice volume around the camera (y < 0)
vec3 iceVolume(vec3 ro, vec3 rd, float tmax, float light){
  vec3 col = vec3(0);
  float t = 0.02, T = 1.0;
  for (int i = 0; i < 40; i++){
    if (t > tmax) break;
    vec3 p = ro + rd*t;
    float depthHere = max(-p.y, 0.0);
    float L = light*exp(-depthHere*0.22);                         // light dies with depth
    // annual layers / dust bands (horizontal), slight warp
    float band = smoothstep(0.55, 0.95, sin((p.y + fbm(p*0.6, 3)*0.25)*38.0)*0.5 + 0.5);
    float dust = 0.15 + 0.85*smoothstep(0.4, 0.8, fbm(vec3(p.xz*0.4, p.y*3.0), 3));
    vec3 scat = mix(vec3(0.20, 0.42, 0.72), vec3(0.55, 0.75, 0.95), exp(-depthHere*2.0));
    // brighter toward the surface (light comes from above)
    float up = 0.6 + 0.4*rd.y;
    col += T*scat*L*up*(0.16 + 0.14*band*dust)*min(t*0.4 + 0.05, 0.3);
    T *= 0.985;
    t *= 1.18;
  }
  // bubbles & crystal sparkle: point sprites in a wrapping cell grid around ro
  for (int l = 0; l < 2; l++){
    float sc = 22.0 + float(l)*30.0;
    vec3 base = floor(ro*sc);
    for (int k = 0; k < 24; k++){
      vec3 r = h33(vec3(float(k), float(l), 3.0));
      vec3 cell = base + floor((r - 0.5)*vec3(10.0, 14.0, 10.0));
      vec3 q = (cell + h33(cell))/sc;
      if (q.y > 0.0) continue;
      float tq = dot(q - ro, rd);
      if (tq <= 0.0 || tq > tmax) continue;
      float L = light*exp(-max(-q.y, 0.0)*0.22);
      float tw = 0.4 + 0.6*pow(h13(cell + floor(uTime*8.0)), 8.0);  // crystal glints
      col += pointGlow(ro, rd, q, 0.0, mix(vec3(0.7, 0.85, 1.0), vec3(1.0), tw)*L*0.8*exp(-tq*0.5));
    }
  }
  return col;
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  if (uMode < 0.5) return earthFromSpace(ro, rd);
  vec3 col = vec3(0);
  // above the surface: sky + the ice sheet (day or night) + the IceCube Lab
  if (ro.y > 0.0){
    float th = rd.y < 0.0 ? -ro.y/rd.y : 1e9;
    vec3 bn; vec2 bx = boxHit(ro - LAB_C, rd, LAB_H, bn);
    if (bx.x > 0.0 && bx.x < th){
      vec3 p = ro + rd*bx.x - LAB_C;
      float sky = 0.5 + 0.5*bn.y;
      col = vec3(0.035, 0.038, 0.045)*(sky*(uSurfLight + uNight*0.25) + 0.15);
      // lit windows: one band along each long side, plus a warm door light
      if (abs(bn.z) > 0.5 || abs(bn.x) > 0.5){
        float u = abs(bn.z) > 0.5 ? p.x : p.z;
        float win = step(0.004, p.y)*step(p.y, 0.022)*step(0.35, fract(u*34.0));
        col += vec3(1.0, 0.93, 0.82)*win*(0.6 + 1.4*uNight);
      }
      return col;
    }
    if (th < 1e8){
      vec3 p = ro + rd*th;
      float sn = fbm(vec3(p.xz*3.0, 0.0), 5);
      float sastrugi = sin(p.x*40.0 + sn*6.0)*0.5 + 0.5;          // wind-carved snow ridges
      vec3 snow = vec3(0.80, 0.87, 0.95)*(0.75 + 0.2*sn + 0.08*sastrugi);
      col = snow*(uSurfLight*0.5 + uNight*0.028)*exp(-th*0.004);
      col += SILVER*pow(h13(floor(vec3(p.xz*900.0, 1.0))), 60.0)*uNight*0.6*exp(-th*2.0);   // frost glints
      // light pool from the lab windows on the snow
      col += vec3(1.0, 0.93, 0.82)*exp(-length(p.xz - LAB_C.xz)*9.0)*0.06*uNight;
      // cutaway: the snow turns to glass and the array glows 1.5 km below
      if (uCut > 0.0){
        float tH;
        vec3 arr = iceCube(p - rd*0.001, rd, 60.0, uLit, 0.6, tH);
        col = col*(1.0 - 0.8*uCut) + arr*uCut + vec3(0.01, 0.025, 0.05)*uCut*0.3;
      }
    } else {
      float hz = exp(-max(rd.y, 0.0)*7.0);
      col = mix(vec3(0.02, 0.03, 0.06), vec3(0.45, 0.58, 0.78), hz)*uSurfLight + stars(rd, 0.5*(1.0 - uSurfLight) + uNight, 0.0);
      col += vec3(1.0, 0.9, 0.75)*pow(max(dot(rd, uSun), 0.0), 900.0)*8.0*uSurfLight;
      if (uNight > 0.0){                                            // the Milky Way over the pole
        float g = dot(rd, normalize(vec3(0.55, 0.35, 0.75)));
        float band = exp(-g*g/0.018)*(0.4 + 0.8*fbm(rd*7.0, 5));
        float lane = smoothstep(0.5, 0.75, fbm(rd*11.0 + 3.0, 4))*exp(-g*g/0.003);
        col += vec3(0.80, 0.82, 0.86)*band*(1.0 - 0.8*lane)*0.12*uNight;
        col += vec3(0.08, 0.10, 0.14)*hz*0.4*uNight;                // faint horizon glow
      }
    }
    return col + nuThread(ro, rd);
  }
  // under the ice
  float tHit;
  float tmax = 40.0;
  if (rd.y > 0.0) tmax = min(tmax, -ro.y/rd.y);
  col = iceVolume(ro, rd, tmax, uSurfLight);
  if (uMode > 1.5){
    col += iceCube(ro, rd, tmax, uLit, 1.0, tHit);
  }
  // looking up through the ice toward the sky: a faint disk of light/stars
  if (rd.y > 0.0 && uStarUp > 0.0) col += stars(rd, uStarUp, 1.5)*exp(-(-ro.y)*0.05);
  if (uNuOn > 0.0){
    col += trail(ro, rd, uNuA, uNuB, 1e9, 0.02, uNuOn, 0.25);
    col += pointGlow(ro, rd, uNuB, 0.02, CBLUE*uNuOn);
  }
  return col;
}
