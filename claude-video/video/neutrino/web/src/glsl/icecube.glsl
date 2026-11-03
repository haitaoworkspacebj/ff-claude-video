// IceCube geometry, in units of 100 m. y = 0 at the ice surface, down is −y.
// 86 strings on a ~125 m hexagonal grid (78 standard + 8 DeepCore in the
// middle), 60 DOMs each between 1450 m and 2450 m depth (17 m spacing).
// String xz positions come in through uStr[] (built in JS).
uniform vec2  uStr[86];
uniform float uLit;        // global DOM light level (array wake-up)
uniform vec3  uEvA, uEvB;  // event track (for timing-ordered lighting)
uniform float uEvT;        // event clock in "front distance" units (100 m)
uniform float uEvOn;
uniform float uDim;        // dims idle DOMs so event hits stand out (0 = none)

const float TOP = -14.5, BOT = -24.5, DSP = 0.17;   // 1450 m, 2450 m, 17 m

// DOM brightness at a point due to the event: hits arrive in order of
// distance from the light cone sweeping along the track.
float domHit(vec3 dp){
  if (uEvOn <= 0.0) return 0.0;
  vec3 D = normalize(uEvB - uEvA);
  float along = dot(dp - uEvA, D);
  float perp = length(dp - uEvA - D*along);
  // direct Cherenkov photon arrival (ice n ≈ 1.31, θc ≈ 40°), in units of the
  // muon's path length:  c·t = along + perp·tanθc. If the emission point would
  // lie before the vertex, light comes from the vertex itself: n·distance.
  float arrive = (along - perp*1.18 >= 0.0) ? along + perp*0.846 : length(dp - uEvA)*1.31;
  float since = uEvT - arrive;
  float amp = exp(-perp*0.9) * smoothstep(0.0, 0.05, since);
  // flash on arrival, then hold a recorded glow (the hit is stored, not lost)
  return amp * (0.45 + 0.55*exp(-max(since, 0.0)*0.6)) * 3.0;
}

// returns light from strings + DOMs along the ray up to tmax
vec3 iceCube(vec3 ro, vec3 rd, float tmax, float domGlow, float cable, out float tHit){
  vec3 col = vec3(0); tHit = 1e9;
  for (int i = 0; i < 86; i++){
    vec2 s = uStr[i];
    // closest approach to vertical line x=s.x, z=s.y (in xz)
    vec2 o = ro.xz - s, d = rd.xz;
    float dd = dot(d, d);
    float t = dd > 1e-8 ? -dot(o, d)/dd : 0.0;
    if (t <= 0.0 || t > tmax) continue;
    vec3 p = ro + rd*t;
    if (p.y > TOP + 0.3 || p.y < BOT - 0.3) {
      // cable above the instrumented volume (runs to the surface)
      if (p.y > BOT && p.y < 0.0){
        float dist = length(o + d*t);
        float px = dist/t*pxScale();
        col += vec3(0.25, 0.28, 0.33)*exp(-px*px*1.5)*cable*0.06*exp(-t*0.08);
      }
      continue;
    }
    float dist = length(o + d*t);
    float px = dist/t*pxScale();
    col += vec3(0.30, 0.34, 0.40)*exp(-px*px*1.5)*cable*0.09*exp(-t*0.08);
    // DOM nearest along the string at this height (and its neighbours)
    // near strings: DOMs adjacent to the closest point. Far strings: the
    // projected DOM spacing is sub-pixel, so check more neighbours.
    float k = clamp(floor((TOP - p.y)/DSP + 0.5), 0.0, 59.0);
    for (int j = -2; j <= 2; j++){
      float kk = clamp(k + float(j), 0.0, 59.0);
      vec3 dp = vec3(s.x, TOP - kk*DSP, s.y);
      vec3 op = dp - ro; float tc = dot(op, rd);
      if (tc <= 0.0 || tc > tmax) continue;
      float b = length(op - rd*tc);
      float bpx = b/tc*pxScale();
      float R = 0.0017;                               // 33 cm sphere, in 100 m units
      float sz = max(R/tc*pxScale(), 0.6);
      float body = exp(-bpx*bpx/(sz*sz));
      // wake order: each DOM has a rank; it lights once uLit passes it.
      // uLit is driven on a log ramp so the count goes 1 → 2 → 5 → 10 → all.
      // String 40's top DOM is forced first (the one the callout points at).
      float rank = (i == 40 && kk < 0.5) ? 0.0 : h11(float(i)*61.0 + kk*7.31);
      float awake = smoothstep(rank, rank + 0.0006, domGlow);
      float hit = domHit(dp);
      // emission is drawn in screen space so far DOMs still read as points
      float w = max(sz, 1.4);
      float core = exp(-bpx*bpx/(w*w));
      float halo = exp(-bpx/(w*4.0));                                  // soft scatter in the ice
      float e = awake*0.9*(1.0 - uDim) + hit;
      vec3 c = vec3(0.55, 0.60, 0.68)*body*0.10*exp(-tc*0.06);        // dark glass sphere
      c += CBLUE*e*(core*2.2 + halo*0.12) + vec3(0.85, 0.93, 1.0)*e*core*0.9;
      col += c;
      if (b < R) tHit = min(tHit, tc);
    }
  }
  return col;
}
