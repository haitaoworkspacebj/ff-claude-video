// S1 — the source. Supermassive black hole in Schwarzschild units (rs = 1):
// photon paths integrated with the exact null-geodesic acceleration
// a = -1.5 h² r̂/r⁴, so the far side of the disk lenses up over the shadow.
// A relativistic jet, and one hairline neutrino thread fired from the core.
uniform float uFire;      // seconds since the thread was emitted (<0 = not yet)
uniform float uCore;      // emission gain (anticipation swell)
uniform vec3  uDir;       // thread direction
uniform float uShake;
uniform vec3  uLA, uLB;   // arrival line (Act V: the reconstructed direction reaching the source)
uniform float uLOn;

const float R_IN = 3.0, R_OUT = 15.0;

vec4 diskSample(vec3 p, vec3 rd){
  float r = length(p.xz);
  if (r < R_IN || r > R_OUT) return vec4(0);
  float th = 0.05 + 0.025*r;
  float d = exp(-(p.y*p.y)/(th*th));
  if (d < 0.02) return vec4(0);
  vec2 q = rot(3.0*pow(r, -1.5)*(uTime*2.0 + 30.0)) * p.xz;    // Keplerian shear
  float ang = atan(q.y, q.x);
  float n = fbm(vec3(q*0.55, p.y*1.5), 5);
  float lanes = fbm(vec3(r*2.2, ang*1.5, 1.7), 3);
  float dens = d * smoothstep(0.25, 0.75, n*0.55 + lanes*0.6) * smoothstep(R_OUT, 6.0, r) * smoothstep(R_IN, 3.6, r);
  vec3 v = normalize(vec3(-p.z, 0.0, p.x));
  float beta = 0.55/sqrt(r/3.0);
  float dop = 1.0/(1.0 - beta*dot(v, -rd));                      // relativistic doppler
  float beam = pow(dop, 3.0);
  float heat = pow(R_IN/r, 1.6);
  vec3 col = mix(vec3(0.42, 0.48, 0.62), vec3(1.0, 0.96, 0.90), heat) * heat * 0.9;
  col *= mix(vec3(1.0, 0.92, 0.86), vec3(0.85, 0.93, 1.1), clamp(dop - 0.6, 0.0, 1.0));   // red/blue shift tint (subtle)
  return vec4(col*beam*uCore, dens*1.6);
}

vec3 jetSample(vec3 p){
  float y = p.y, rho = length(p.xz);
  if (y < 1.0) return vec3(0);
  float w = 0.3 + 0.06*y;
  float d = exp(-(rho*rho)/(w*w)) * exp(-y*0.03);
  if (d < 0.01) return vec3(0);
  float knots = fbm(vec3(p.xz*1.2, y*0.25 - uTime*3.0), 4);
  return SILVER*vec3(0.85, 0.92, 1.05) * d * (0.15 + smoothstep(0.45, 0.85, knots)) * 0.08 * uCore;
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  vec3 col = vec3(0); float T = 1.0;
  vec3 p = ro, dir = rd;
  float h2 = dot(cross(p, dir), cross(p, dir));
  bool swallowed = false;
  for (int i = 0; i < 220; i++){
    float r = length(p);
    if (r < 1.0){ swallowed = true; break; }
    if (r > 80.0 && dot(p, dir) > 0.0) break;
    float dt = clamp(0.06*r, 0.03, 1.2);
    if (abs(p.y) < 1.2 && length(p.xz) < R_OUT + 1.0) dt = min(dt, 0.12);   // fine steps in the disk
    vec4 ds = diskSample(p, dir);
    float a = 1.0 - exp(-ds.a*dt);
    col += T*(ds.rgb*a + jetSample(p)*dt);
    T *= 1.0 - a;
    if (T < 0.01) break;
    vec3 acc = -1.5*h2*p/pow(r, 5.0);
    dir = normalize(dir + acc*dt);
    p += dir*dt;
  }
  if (!swallowed){
    col += T*(stars(dir, 1.1, 0.0) + vec3(0.012, 0.014, 0.02)*smoothstep(0.45, 0.85, fbm(dir*2.5 + 2.0, 4)));
  }
  if (uFire > 0.0){
    vec3 a = vec3(0, 0.3, 0), hd = a + uDir*uFire*60.0;
    col += trail(ro, rd, a, hd, 1e9, 0.08, 1.7, 0.25);
    col += pointGlow(ro, rd, hd, 0.08, CBLUE*2.0);
    // emission flash: a hard white core pulse plus a short ring wave in the disk plane
    vec3 oc = -ro; float b = length(oc - rd*dot(oc, rd));
    col += vec3(0.9, 0.95, 1.0)*exp(-uFire*5.0)*exp(-b*b*0.6)*3.0;
  }
  if (uLOn > 0.0){
    col += trail(ro, rd, uLA, uLB, 1e9, 0.15, uLOn*1.6, 0.0);
    col += pointGlow(ro, rd, uLB, 0.15, CBLUE*uLOn*2.0);
  }
  return col;
}
