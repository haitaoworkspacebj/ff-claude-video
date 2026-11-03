// S4/S5a — the ghost. Macro on the thread itself: shallow depth of field,
// defocused bokeh space behind, three faint sub-filaments braided around the
// core (a quiet nod to flavour oscillation — never labelled, just felt).
// Also used head-on: the thread flies straight through the lens ("through you").
uniform vec3  uA, uB;      // thread tail / head
uniform float uFocus;      // focus distance
uniform float uCoc;        // circle-of-confusion gain
uniform float uBright;
uniform float uBraid;      // 0..1
uniform float uBokeh;      // background bokeh amount
uniform float uPass;       // 0..1 flash as the head crosses the lens plane

vec3 bokeh(vec3 rd){
  vec3 c = vec3(0);
  for (int l = 0; l < 2; l++){
    float sc = 7.0 + float(l)*5.0;
    vec3 p = rd*sc, id = floor(p), f = fract(p) - 0.5;
    vec3 r = h33(id + float(l)*7.3);
    if (r.x > 0.12) continue;
    vec3 o = (h33(id*2.1 + 1.0) - 0.5)*0.3;
    float d = length(f - o);
    float R = 0.12 + 0.12*r.y;
    float disc = smoothstep(R, R - 0.02, d);
    float rim = smoothstep(R - 0.035, R - 0.01, d)*disc;          // lens-ish rim
    vec3 tint = mix(vec3(0.55, 0.65, 0.85), vec3(0.85, 0.88, 0.95), r.z);
    c += tint*(disc*0.05 + rim*0.05)*(0.3 + r.y);
  }
  return c;
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  vec3 col = bokeh(rd)*uBokeh + stars(rd, 0.25, 3.0)*uBokeh;
  col += trailDOF(ro, rd, uA, uB, 1e9, 0.004, uBright, 0.25, uFocus, uCoc);
  if (uBraid > 0.0){
    vec3 D = normalize(uB - uA), e1 = normalize(cross(D, vec3(0.2, 1, 0.1))), e2 = cross(D, e1);
    float L = length(uB - uA);
    for (int i = 0; i < 3; i++){
      float s, t; segRay(ro, rd, uA, uB, s, t);
      float x = s*L, ph = float(i)*2.094 + uTime*1.3;
      vec3 off = (e1*cos(x*2.2 + ph) + e2*sin(x*2.2 + ph))*0.035;
      vec3 tint = (i == 0) ? vec3(0.9, 1.0, 1.1) : (i == 1 ? vec3(0.7, 0.85, 1.2) : vec3(1.0, 0.95, 1.05));
      col += trailDOF(ro, rd, uA + off, uB + off, 1e9, 0.002, uBright*0.22*uBraid, 0.4, uFocus, uCoc)*tint;
    }
  }
  vec3 hp = uB - ro;
  if (dot(hp, rd) > 0.0) col += pointGlow(ro, rd, uB, 0.006, CBLUE*uBright*0.8);
  col += CBLUE*uPass*0.6 + vec3(0.8, 0.9, 1.0)*uPass*uPass*0.6;   // crossing the lens
  return col;
}
