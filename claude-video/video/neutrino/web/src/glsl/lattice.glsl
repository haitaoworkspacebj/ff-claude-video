// S6 — "it rarely touches matter". Inside a lattice of atoms (electron haze +
// point nucleus), traversed exactly with a 3D-DDA. Three encounters on the beat:
//   photon   -> strikes an atom and scatters (sparks)
//   charged  -> kinks atom to atom, ionising, then stops
//   neutrino -> straight through, nothing happens
// while the lattice empties until only black and one faint blue point remain.
uniform float uFill;                 // fraction of lattice sites occupied
uniform vec3  uPA0, uPA1, uPAr;      // photon: start, hit atom, scatter dir
uniform float uPAt;                  // photon clock: 0..1 travel, >1 seconds after hit
uniform vec3  uPB0, uPB1, uPB2, uPB3;// charged particle polyline (ends absorbed)
uniform float uPBt;                  // 0..3 along polyline, >3 = stopped
uniform vec3  uNA, uNB;              // neutrino segment
uniform float uNBright;

vec3 lineGlow(vec3 ro, vec3 rd, vec3 a, vec3 b, vec3 col, float w){
  float s, t; float d = segRay(ro, rd, a, b, s, t);
  if (t <= 0.0) return vec3(0);
  float px = d/t*pxScale();
  return col*exp(-px*px/(w*w))*(0.9/w)*s;
}
bool forced(vec3 id){
  return length(id - uPA1) < 0.1 || length(id - uPB1) < 0.1 || length(id - uPB2) < 0.1 || length(id - uPB3) < 0.1;
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  vec3 col = vec3(0);
  // --- lattice by voxel traversal (cells centred on integer coords)
  vec3 p = ro + 0.5, id = floor(p), st = sign(rd);
  vec3 tD = abs(1.0/rd), tM = (id - p + 0.5 + 0.5*st)*(1.0/rd);
  float hitGlow = (uPAt > 1.0) ? exp(-(uPAt - 1.0)*3.0) : 0.0;
  for (int i = 0; i < 56; i++){
    vec3 c = id;
    float rnd = h13(c*1.7 + 3.1);
    bool f = forced(c);
    if (rnd < uFill || f){
      vec3 oc = c - ro; float tc = dot(oc, rd);
      if (tc > 0.05){
        float b = length(oc - rd*tc);
        float fade = exp(-tc*0.1) * (f ? 1.0 : smoothstep(uFill, uFill - 0.08, rnd));
        float px = b/tc*pxScale();
        float boost = (length(c - uPA1) < 0.1) ? 1.0 + hitGlow*8.0 : 1.0;
        col += vec3(0.32, 0.36, 0.44)*exp(-b*b*90.0)*0.05*fade*boost;     // electron haze (inside cell)
        col += SILVER*exp(-px*px*0.7)*0.6*fade*boost;                      // nucleus
      }
    }
    vec3 m = step(tM, tM.yzx)*step(tM, tM.zxy);
    tM += m*tD; id += m*st;
  }
  // --- photon: travels, strikes, scatters
  if (uPAt > 0.0){
    vec3 dir = normalize(uPA1 - uPA0);
    if (uPAt <= 1.0){
      vec3 h = mix(uPA0, uPA1, uPAt);
      col += lineGlow(ro, rd, h - dir*0.6, h, vec3(1.0, 0.98, 0.95)*1.4, 1.1);
    } else {
      float k = uPAt - 1.0;
      for (int i = 0; i < 18; i++){
        vec3 sd = normalize(h33(vec3(float(i), 1.0, 2.0)) - 0.5 + uPAr*0.6);
        float r0 = 0.05 + k*2.4, r1 = r0 + 0.25;
        col += lineGlow(ro, rd, uPA1 + sd*r0, uPA1 + sd*r1, SILVER*exp(-k*3.0)*1.6, 1.0);
      }
      col += pointGlow(ro, rd, uPA1, 0.15, vec3(1.0, 0.97, 0.92)*exp(-k*5.0)*3.0);    // impact flash
      col += lineGlow(ro, rd, uPA1 + uPAr*(k*5.0), uPA1 + uPAr*(k*5.0 + 0.6), vec3(1.0, 0.98, 0.95)*exp(-k*1.5), 1.1);
    }
  }
  // --- charged particle: kinked path, ionisation flashes, stops
  if (uPBt > 0.0){
    vec3 P[4] = vec3[4](uPB0, uPB1, uPB2, uPB3);
    for (int i = 0; i < 3; i++){
      float u = clamp(uPBt - float(i), 0.0, 1.0);
      if (u <= 0.0) break;
      col += lineGlow(ro, rd, P[i], mix(P[i], P[i+1], u), vec3(0.55, 0.62, 0.72)*0.5, 0.8);
      float since = uPBt - float(i) - 1.0;
      if (since > 0.0) col += pointGlow(ro, rd, P[i+1], 0.01, SILVER*exp(-since*2.5)*1.2);
    }
  }
  // --- neutrino: straight through everything, no reaction
  if (uNBright > 0.0){
    col += trail(ro, rd, uNA, uNB, 1e9, 0.01, uNBright, 0.25);
    col += pointGlow(ro, rd, uNB, 0.01, CBLUE*uNBright);
  }
  return col;
}
