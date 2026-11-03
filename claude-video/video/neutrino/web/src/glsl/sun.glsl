// S5c — the Sun's limb, seen as if through a solar filter (so the thread can
// read against it): granulation, limb darkening, faint coronal streamers.
// The thread goes in one side and out the other — the Sun doesn't stop it.
uniform vec3  uA, uB;
uniform float uBright;

float gran(vec3 n){
  vec3 p = n*38.0; vec3 i = floor(p), f = fract(p); float m = 1.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(x, y, z), o = h33(i + g);
    o = 0.5 + 0.45*sin(uTime*0.4 + 6.28*o);
    m = min(m, length(g + o - f));
  }
  return m;
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  vec3 col = vec3(0);
  vec2 h = sphIntersect(ro, rd, vec3(0), 1.0);
  vec3 oc = -ro; float tc = dot(oc, rd); float b = length(oc - rd*tc);
  float tEntry = 1e9;
  if (h.y > 0.0){
    tEntry = h.x;
    vec3 n = normalize(ro + rd*h.x);
    float mu = max(dot(n, -rd), 0.0);
    float limb = 0.35 + 0.65*pow(mu, 0.55);
    float g = gran(n);
    float cell = smoothstep(0.05, 0.6, g);                      // bright cells, dark lanes
    float act = smoothstep(0.55, 0.8, fbm(n*5.0 + 2.0, 4));      // faculae-ish
    col = vec3(0.88, 0.88, 0.86)*limb*(0.55 + 0.35*(1.0 - cell) + 0.25*act) * 0.9;
  } else {
    vec3 lp = normalize(ro + rd*tc);
    float alt = b - 1.0;
    float str = ridged(vec3(lp*4.0) + vec3(0, 0, alt*0.6), 4);
    col = SILVER*(exp(-alt*9.0)*0.35 + exp(-alt*2.5)*pow(str, 3.0)*0.25);
    col += stars(rd, 0.5, 0.0)*smoothstep(0.3, 1.2, alt);
  }
  // in front of the disc it is plain; behind it we show it continuing (ghostly)
  vec3 tf = trail(ro, rd, uA, uB, tEntry, 0.004, uBright, 0.3);
  vec3 ta = trail(ro, rd, uA, uB, 1e9, 0.004, uBright, 0.3);
  col += tf + (ta - tf)*0.55;
  col += pointGlow(ro, rd, uB, 0.004, CBLUE*uBright);
  return col;
}
