// S3/S5b — Earth. Sunlit planet that turns to "x-ray glass" so the thread is
// seen passing through crust, mantle, outer core and inner core.
// Flux mode: a rain of parallel solar-neutrino threads passing straight through.
uniform vec3  uSun;
uniform float uXray;   // 0 opaque .. 1 interior visible
uniform vec3  uA;      // thread tail
uniform vec3  uB;      // thread head
uniform float uBright;
uniform float uRain;   // flux-mode intensity (0 = off)
uniform float uRainT;

const float R_IC = 0.19, R_CMB = 0.546;

vec3 surface(vec3 n){
  float c = fbm(n*2.2 + 4.0, 5);
  float land = smoothstep(0.50, 0.53, c);
  vec3 base = mix(vec3(0.015, 0.03, 0.06), vec3(0.20, 0.20, 0.17)*(0.7 + 0.6*fbm(n*9.0, 3)), land);
  base = mix(base, vec3(0.85, 0.9, 0.95), smoothstep(0.78, 0.86, abs(n.y)));  // ice caps
  float cl = smoothstep(0.5, 0.75, fbm(n*3.5 + vec3(uTime*0.01, 0, 0), 5));
  return mix(base, vec3(0.9), cl*0.85);
}

vec3 interior(vec3 ro, vec3 rd, vec2 h){
  vec3 col = vec3(0);
  float t0 = max(h.x, 0.0), dt = (h.y - t0)/48.0;
  for (int i = 0; i < 48; i++){
    vec3 p = ro + rd*(t0 + dt*(float(i) + 0.5));
    float r = length(p);
    vec3 e;
    if (r > R_CMB){             // mantle: slow convection plumes, faint heat
      float pl = ridged(p*3.0 + vec3(0, uTime*0.02, 0), 4);
      e = vec3(0.10, 0.11, 0.13)*0.06 + vec3(0.55, 0.50, 0.46)*pow(pl, 5.0)*0.22*smoothstep(0.99, 0.6, r);
    } else if (r > R_IC){       // liquid outer core: swirling
      vec3 q = p; q.xz = rot(uTime*0.05 + r*6.0)*q.xz;
      e = vec3(0.75, 0.72, 0.68)*(0.05 + 0.35*pow(fbm(q*7.0, 4), 2.0));
    } else {                    // solid inner core: dense, bright, small
      e = vec3(1.0, 0.98, 0.95)*1.1;
    }
    col += e*dt;
  }
  // shell boundaries: fine limb-lit lines at each discontinuity
  vec3 oc = -ro; float b = length(oc - rd*dot(oc, rd));
  col += SILVER*(exp(-abs(b - 0.995)*160.0)*0.6 + exp(-abs(b - R_CMB)*220.0)*0.5 + exp(-abs(b - R_IC)*260.0)*0.4);
  return col;
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  vec3 col = stars(rd, 0.7, 0.0);
  vec2 h = sphIntersect(ro, rd, vec3(0), 1.0);
  vec3 oc = -ro; float b = length(oc - rd*dot(oc, rd));
  float tEntry = 1e9;
  if (h.y > 0.0){
    tEntry = max(h.x, 0.0);
    vec3 p = ro + rd*tEntry, n = normalize(p);
    float diff = max(dot(n, uSun), 0.0);
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
    vec3 surf = surface(n)*(diff*1.4 + 0.004) + ICE*fres*diff*0.6;
    vec3 glass = interior(ro, rd, h)*0.9 + SILVER*fres*0.25 + surface(n)*diff*0.12;
    col = mix(surf, glass, uXray);
  }
  // atmosphere: thin pale limb, sunward
  float atm = exp(-max(b - 1.0, 0.0)*45.0) * smoothstep(0.96, 1.0, b);
  vec3 lp = normalize(ro + rd*dot(oc, rd));
  col += vec3(0.55, 0.72, 1.0)*atm*smoothstep(-0.3, 0.6, dot(lp, uSun))*0.5;

  // the thread: hidden behind the opaque planet, visible through it in x-ray
  vec3 tf = trail(ro, rd, uA, uB, tEntry, 0.01, uBright, 0.3);
  vec3 ta = trail(ro, rd, uA, uB, 1e9, 0.01, uBright, 0.3);
  col += tf + (ta - tf)*uXray;
  col += pointGlow(ro, rd, uB, 0.01, CBLUE*uBright)*mix(step(length(uB - ro), tEntry + 0.001), 1.0, uXray);

  if (uRain > 0.0){           // solar neutrinos: everything passes straight through
    vec3 d = -uSun, u = normalize(cross(d, vec3(0, 1, 0))), v = cross(d, u);
    for (int i = 0; i < 26; i++){
      vec3 rr = h33(vec3(float(i), 3.0, 7.0));
      vec2 o = (rr.xy - 0.5)*2.6;
      float ph = fract(uRainT*(0.35 + rr.z*0.3) + rr.z);
      vec3 c0 = u*o.x + v*o.y - d*3.0 + d*ph*6.0;
      col += trail(ro, rd, c0 - d*1.2, c0, 1e9, 0.006, uRain*0.55, 0.6);
    }
  }
  return col;
}
