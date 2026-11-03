// Act III/IV · the capture. IceCube array (icecube.glsl) plus:
//   macro zoom ice → H₂O → oxygen nucleus (uMacro; camera at the origin)
//   interaction vertex + hadronic sparks, the muon, its Cherenkov cone,
//   DOM hits in causal light-arrival order (icecube.glsl), fit line, arrow,
//   atmospheric-muon background raining from above (uBg)
// Colour semantics: blue = neutrino / Cherenkov light, silver = charged particles.
#include "icecube.glsl"
uniform float uMacro, uMacroNu;
uniform vec3  uVtx;
uniform float uVertex, uMuon, uCone, uNuIn, uNuHead, uFit, uArrow, uBg, uBgT;

vec3 grey(vec3 c){ return vec3(dot(c, vec3(0.333))); }

// Cherenkov wavefront with the muon head at L: a cone trailing the head,
// r = (L − s)·cot θc, θc ≈ 40° in ice (n ≈ 1.31). Volumetric shell + grain.
vec3 coneLight(vec3 ro, vec3 rd, vec3 A, vec3 D, float L){
  vec3 col = vec3(0);
  float w = 0.02 + L*0.015;                        // thin shell: reads as a cone, not a fog
  float t = 0.02*(0.5 + h13(vec3(gl_FragCoord.xy, uTime)));
  for (int i = 0; i < 80; i++){
    float dt = 0.004 + t*0.07;
    vec3 p = ro + rd*t, q = p - A;
    float s = dot(q, D), r = length(q - D*s);
    float front = (L - s)*1.18;
    float shell = exp(-pow((r - front)/w, 2.0))*step(0.0, s)*step(s, L);
    float grain = 0.35 + 0.65*h13(floor(p*60.0));  // photons scattering in the ice
    col += CBLUE*shell*exp(-r*0.6)*grain*dt/w*0.12;
    t += dt;
    if (t > 40.0) break;
  }
  return col;
}

vec3 macroLayer(vec3 rd, float m){
  vec3 col = vec3(0);
  vec2 uv0 = rd.xy/rd.z;
  if (m < 0.4){                                    // ice crystal grains + glints
    float k = 1.0 - smoothstep(0.2, 0.4, m);
    vec2 uv = uv0*mix(3.0, 18.0, smoothstep(0.0, 0.4, m));
    vec2 hx = vec2(uv.x + uv.y*0.577, uv.y*1.155), f = fract(hx) - 0.5;
    float edge = smoothstep(0.47, 0.5, max(abs(f.x), abs(f.y)));
    float fac = h13(vec3(floor(hx), 1.0));
    // dark clear ice: faint grain boundaries, a few glints, depth falloff off-centre
    float vig = exp(-dot(uv0, uv0)*1.2);
    float tw = pow(h13(vec3(floor(hx), floor(uTime*6.0))), 30.0);
    col += (ICE*edge*0.03*(0.3 + fac) + SILVER*step(0.992, fac)*exp(-dot(f, f)*30.0)*0.4 + SILVER*tw*exp(-dot(f, f)*60.0)*0.8)*k*vig;
  }
  if (m < 0.66){                                   // H₂O lattice, zooming onto one oxygen
    float k = smoothstep(0.15, 0.4, m)*(1.0 - smoothstep(0.55, 0.66, m));
    vec2 uv = uv0*mix(16.0, 0.9, smoothstep(0.15, 0.66, m));
    vec2 f = fract(uv*vec2(1.0, 1.1547) + 0.5) - 0.5;
    col += SILVER*exp(-dot(f, f)*120.0)*0.8*k;
    col += vec3(0.6, 0.7, 0.85)*(exp(-length(f - vec2(0.18, 0.12))*40.0) + exp(-length(f - vec2(-0.18, 0.12))*40.0))*0.4*k;
  }
  if (m > 0.5){                                    // oxygen nucleus: 8 protons + 8 neutrons
    float k = smoothstep(0.55, 0.8, m);
    for (int i = 0; i < 16; i++){
      vec3 c = vec3(0, 0, 4.0) + (h33(vec3(float(i), 2.0, 9.0)) - 0.5)*0.6;
      vec2 hh = sphIntersect(vec3(0), rd, c, 0.17);
      if (hh.x > 0.0){
        vec3 nn = normalize(rd*hh.x - c);
        float lit = 0.25 + 0.75*max(dot(nn, normalize(vec3(-0.4, 0.6, -0.6))), 0.0);
        col = max(col, ((i % 2 == 0) ? vec3(0.95, 0.96, 1.0) : vec3(0.62, 0.66, 0.74))*lit*k);
      }
    }
  }
  return col;
}

vec3 sparks(vec3 ro, vec3 rd, vec3 c, float k, float size){
  vec3 col = vec3(0);
  for (int i = 0; i < 10; i++){
    vec3 d = normalize(h33(vec3(float(i), 4.0, 1.0)) - 0.5);
    float r0 = min(k, 1.0)*size;
    col += grey(trail(ro, rd, c + d*r0, c + d*(r0 + size*0.3), 1e9, size*0.05, 1.0, 0.0))*exp(-k*2.0);
  }
  return col;
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  if (uMacro > 0.02){
    vec3 col = macroLayer(rd, uMacro);
    vec3 a = vec3(-5.0, 1.8, 7.0), c = vec3(0, 0, 4.0);
    if (uMacroNu > 0.0) col += trail(vec3(0), rd, a, mix(a, c, uMacroNu), 1e9, 0.01, 1.4, 0.2);
    if (uVertex > 0.0)
      col += vec3(0.9, 0.95, 1.0)*exp(-uVertex*6.0)*0.8*exp(-length(rd.xy/rd.z)*20.0) + sparks(vec3(0), rd, c, uVertex, 1.5)*0.35;
    return col;
  }
  vec3 col = vec3(0);
  if (rd.y > 0.0){ float ts = -ro.y/rd.y; col += vec3(0.10, 0.20, 0.34)*0.35*exp(-ts*0.03)*smoothstep(0.0, 0.3, rd.y); }
  // above the ice (Act V ride-out): night sky
  if (ro.y > 0.0) col = stars(rd, 0.9, 0.0)*step(0.0, rd.y) + vec3(0.03, 0.035, 0.045)*step(rd.y, 0.0);
  col += vec3(0.010, 0.022, 0.040)*exp(-max(-ro.y, 0.0)*0.05);
  // bedrock under the ice sheet (2,800 m): dark, faintly textured floor
  if (rd.y < 0.0){
    float tb = (-28.0 - ro.y)/rd.y;
    vec3 pb = ro + rd*tb;
    col += vec3(0.020, 0.019, 0.018)*(0.5 + fbm(vec3(pb.xz*0.3, 0.0), 4))*exp(-tb*0.02);
  }
  float tHit;
  col += iceCube(ro, rd, 60.0, uLit, 1.0, tHit);
  vec3 D = normalize(uEvB - uEvA);
  if (uNuIn > 0.0 && uNuHead > -60.0)
    col += trail(ro, rd, uVtx - D*60.0, uVtx + D*min(uNuHead, 0.0), 1e9, 0.01, uNuIn, 0.0);
  if (uVertex > 0.0){
    col += pointGlow(ro, rd, uVtx, 0.02, vec3(0.9, 0.95, 1.0)*exp(-uVertex*3.0)*3.0);
    col += sparks(ro, rd, uVtx, uVertex, 0.06);
  }
  if (uMuon > 0.0){
    col += grey(trail(ro, rd, uVtx, uVtx + D*uMuon, 1e9, 0.004, 1.0, 0.0));
    col += pointGlow(ro, rd, uVtx + D*uMuon, 0.004, SILVER*1.2);
    if (uCone > 0.0) col += coneLight(ro, rd, uVtx, D, uMuon)*uCone;
  }
  if (uFit > 0.0) col += grey(trail(ro, rd, uVtx - D*0.5, uVtx + D*mix(0.0, 12.0, uFit), 1e9, 0.02, 1.2, 0.0));
  if (uArrow != 0.0){
    // uArrow > 0: drawn back along −D (Act IV reveal); < 0: along +D, the
    // reconstructed source direction for an up-going track (Act V)
    vec3 b = uVtx - D*uArrow;
    col += trail(ro, rd, uVtx, b, 1e9, 0.05, 1.8, 0.0) + pointGlow(ro, rd, b, 0.08, CBLUE*2.2);
  }
  if (uBg > 0.0){
    for (int i = 0; i < 12; i++){
      vec3 r = h33(vec3(float(i), 8.0, 3.0));
      float y = 2.0 - fract(uBgT*(0.35 + r.z*0.2) + r.z)*34.0;
      vec3 h = vec3((r.x - 0.5)*12.0, y, (r.y - 0.5)*12.0);
      col += grey(trail(ro, rd, h + vec3(0.03, 5.0, 0.0), h, 1e9, 0.01, uBg, 0.4))*0.7;
    }
  }
  return col;
}
