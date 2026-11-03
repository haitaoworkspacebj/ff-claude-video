// Act VI · "a new window". Three messengers leave one distant source:
//   light (white, bent and absorbed by dust), gravitational waves (grey
//   ripple rings), neutrinos (the blue thread — straight, unstopped).
// Then the frame becomes a window: a rounded aperture onto the deep sky.
uniform vec3  uSrc;          // source position
uniform float uLight, uGW, uNu;   // per-channel visibility
uniform float uFlowT;        // flow clock
uniform float uDust;         // dust cloud that blocks the light path
uniform float uWin;          // 0..1: window aperture opening
uniform float uWinR;         // aperture half-size (screen units)

uniform float uMap;          // neutrino sky map (screen-space, Mollweide-style ellipse)
uniform float uMapT;         // map clock: events accumulate
uniform float uGal;          // Galactic-plane glow (2023 result)
uniform float uHot;          // hotspots (TXS 0506+056, NGC 1068)

float sdRoundBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

// all-sky map in uv (y up): ellipse half-size 0.6 × 0.3, q in "Mollweide units"
vec3 skyMap(vec2 uv){
  vec2 q = uv/0.3;                                   // ellipse: q.x²/4 + q.y² ≤ 1
  float e = q.x*q.x/4.0 + q.y*q.y;
  float px = 1.0/(0.3*uRes.y);                       // one pixel in q units
  vec3 col = vec3(0);
  float inside = smoothstep(1.0 + px*2.0, 1.0 - px*2.0, e);
  col += vec3(0.02, 0.035, 0.06)*inside;             // map background
  col += ICE*exp(-pow((sqrt(e) - 1.0)/(px*1.2), 2.0))*0.7;   // outline
  // graticule: parallels and meridians
  for (int i = -2; i <= 2; i++){
    if (i != 0) col += ICE*0.10*exp(-pow((q.y - float(i)*0.33)/(px*0.9), 2.0))*inside;
    float mx = float(i)*0.5*sqrt(max(1.0 - q.y*q.y, 0.0))*2.0;   // meridian curves
    col += ICE*0.10*exp(-pow((q.x - mx)/(px*0.9), 2.0))*inside;
  }
  col += ICE*0.18*exp(-pow(q.y/(px*0.9), 2.0))*inside;            // celestial equator
  // Galactic plane: an S-curve across the equatorial map
  float gy = 0.55*sin(q.x*1.55 + 0.45);
  float gd = abs(q.y - gy);
  col += CBLUE*exp(-gd*gd/0.004)*inside*uGal*(0.5 + 0.5*fbm(vec3(q*6.0, 1.0), 3))*1.4;
  // events: atmospheric (dim white, many) + astrophysical (blue, few)
  for (int i = 0; i < 90; i++){
    vec3 r = h33(vec3(float(i), 11.0, 5.0));
    if (r.z*90.0 > uMapT) continue;                  // appear over time
    vec2 p = vec2((r.x*2.0 - 1.0)*2.0, r.y*2.0 - 1.0);
    p.x *= sqrt(max(1.0 - p.y*p.y, 0.0));
    float d = length(q - p)/px;
    bool astro = h11(float(i)*7.7) > 0.86;
    col += (astro ? CBLUE*1.6 : vec3(0.65, 0.7, 0.8)*0.5)*exp(-d*d/(astro ? 5.0 : 2.0));
  }
  // hotspots: TXS 0506+056 and NGC 1068 (approximate map positions)
  vec2 h1 = vec2(1.14, 0.063), h2 = vec2(1.55, -0.02);
  float d1 = length(q - h1)/px, d2 = length(q - h2)/px;
  col += CBLUE*(exp(-d1*d1/30.0)*2.0 + exp(-pow((d1 - 9.0)/1.2, 2.0))*0.8)*uHot;
  col += CBLUE*(exp(-d2*d2/30.0)*2.0 + exp(-pow((d2 - 9.0)/1.2, 2.0))*0.8)*uHot;
  return col;
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  if (uMap > 0.0) return stars(rd, 0.25, 0.0) + skyMap(uv)*uMap;
  vec3 col = stars(rd, 0.8, 0.0);
  // the source: a distant galaxy with a bright core
  float dist = length(ro - uSrc), sep = dist*0.07;
  col += pointGlow(ro, rd, uSrc, sep*0.6, vec3(0.75, 0.78, 0.86)*0.5);
  vec3 toCam = normalize(ro - uSrc);
  vec3 side = normalize(cross(toCam, vec3(0, 1, 0))), up = cross(side, toCam);
  // three lanes leave the source and fan toward the viewer
  vec3 aL = uSrc + up*sep*0.5, aN = uSrc - up*sep*0.5;
  vec3 end = ro - toCam*dist*0.08;                     // just in front of the lens
  vec3 bL = end + up*sep*1.4 + side*sep*0.4, bN = end - up*sep*0.9 - side*sep*0.2;
  // dust cloud on the light lane (absorbs light, transparent to neutrinos)
  vec3 dc = mix(aL, bL, 0.5);
  if (uDust > 0.0){
    vec3 oc = dc - ro; float tc = dot(oc, rd), b = length(oc - rd*tc);
    float d = smoothstep(sep*2.2, 0.0, b)*(0.4 + fbm((ro + rd*tc)*(1.5/sep), 5));
    col = mix(col, vec3(0.045, 0.04, 0.035)*(0.4 + d), clamp(d*1.3, 0.0, 1.0)*uDust);
  }
  // LIGHT: photon dashes, warm white; stop at the dust when uDust = 1
  if (uLight > 0.0){
    vec3 bb = mix(bL, dc, uDust);
    for (int i = 0; i < 7; i++){
      float ph = fract(uFlowT*0.5 + float(i)/7.0);
      vec3 h = mix(aL, bb, ph);
      col += trail(ro, rd, mix(aL, bb, max(ph - 0.07, 0.0)), h, 1e9, sep*0.02, 0.55*uLight, 0.5)*vec3(1.3, 1.0, 0.7);
    }
    col += pointGlow(ro, rd, dc, sep*0.3, vec3(0.9, 0.75, 0.55)*0.3*uLight*uDust);   // scattered, lost
  }
  // GRAVITATIONAL WAVES: expanding grey rings in the plane facing the camera
  if (uGW > 0.0){
    vec3 oc = uSrc - ro; float tc = dot(oc, rd);
    float r = length(oc - rd*tc);
    for (int i = 0; i < 4; i++){
      float R = fract(uFlowT*0.25 + float(i)*0.25)*sep*5.0;
      col += SILVER*exp(-pow((r - R)/(sep*0.05), 2.0))*0.22*uGW*(1.0 - R/(sep*5.0));
    }
  }
  // NEUTRINOS: the straight blue thread, through everything, to the viewer
  if (uNu > 0.0){
    float ph = fract(uFlowT*0.35);
    col += trail(ro, rd, aN, bN, 1e9, sep*0.03, 1.6*uNu, 0.0);
    col += pointGlow(ro, rd, mix(aN, bN, ph), sep*0.04, CBLUE*1.5*uNu);
  }
  // the window: aperture outside of which the frame is dark glass
  if (uWin > 0.0){
    float d = sdRoundBox(uv, vec2(uWinR*1.6, uWinR), 0.04);
    float inside = smoothstep(0.004, -0.004, d);
    float rim = exp(-abs(d)*260.0);
    col = mix(col*0.12, col, inside*uWin + (1.0 - uWin));
    col += ICE*rim*0.6*uWin;
  }
  return col;
}
