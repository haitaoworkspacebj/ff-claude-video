// S2 — the flight. Camera tracks beside the thread at enormous speed:
// world-fixed interstellar dust streams past (motion blur does the streaks),
// stars stay put (they are far). On the bass dip the world racks out of focus
// and darkens — only the thread stays sharp. A soft moon drifts through.
uniform float uHead;   // head position along +z
uniform float uRack;   // 0 sharp .. 1 everything but the thread defocused/dimmed
uniform vec3  uMoon;   // moon centre (world)
uniform float uMoonR;
uniform vec3  uSun;

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  float dim = 1.0 - 0.85*uRack;
  vec3 col = stars(rd, 0.9, uRack*5.0) * dim;

  // dust: sparse world-fixed wisps, cool grey (never blue: blue is the neutrino's)
  float T = 1.0; vec3 dust = vec3(0);
  float t = 0.4;
  for (int i = 0; i < 28; i++){
    vec3 p = ro + rd*t;
    float n = fbm(p*vec3(0.35, 0.35, 0.12) + vec3(3.1, 0.0, 0.0), 4);
    float d = smoothstep(0.6, 0.9, n) * 0.5;
    dust += T * vec3(0.06, 0.065, 0.075)*d*0.35;
    T *= 1.0 - d*0.06;
    t *= 1.16;
  }
  col += dust * dim;
  // grains: analytic point particles in a wrapping volume around the camera.
  // world-fixed, so at this speed the shutter turns them into streaks.
  for (int i = 0; i < 70; i++){
    vec3 r = h33(vec3(float(i), 7.0, 1.0));
    vec3 q = vec3((r.xy - 0.5)*vec2(14.0, 8.0), r.z*60.0);
    q.z = ro.z - 6.0 + mod(q.z - ro.z + 6.0, 60.0);
    float br = 0.15 + 0.85*pow(h11(float(i)*3.7), 3.0);
    col += pointGlow(ro, rd, q, 0.0, vec3(0.75, 0.78, 0.85)*br*0.6)*dim;
  }

  // moon: soft, defocused disc, lit from the side
  vec3 oc = uMoon - ro; float tc = dot(oc, rd);
  if (tc > 0.0){
    float b = length(oc - rd*tc);
    float w = uMoonR*(0.04 + 0.5*uRack);
    float cover = smoothstep(uMoonR + w, uMoonR - w, b);
    if (cover > 0.0){
      vec3 p = ro + rd*(tc - sqrt(max(uMoonR*uMoonR - b*b, 0.0)));
      vec3 n = normalize(p - uMoon);
      float mare = fbm(n*3.0, 4);
      float lit = smoothstep(-0.05, 0.4, dot(n, uSun));
      vec3 m = vec3(0.55, 0.56, 0.58) * (0.6 + 0.5*mare) * lit;
      col = mix(col, m*dim, cover);
    }
  }
  // the thread: hairline, sharp, the only thing that survives the rack focus
  col += trail(ro, rd, vec3(0, 0, uHead - 400.0), vec3(0, 0, uHead), 1e9, 0.02, 1.4, 0.25);
  col += pointGlow(ro, rd, vec3(0, 0, uHead), 0.02, CBLUE*1.2);
  return col;
}
