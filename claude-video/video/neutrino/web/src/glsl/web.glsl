// S7 — the faint blue point, then a crash zoom into it: inside is the cosmic
// web (filaments + galaxy nodes). "Catch it, and you learn the shape of the
// universe." Ends in a cold-white exposure bloom into the chorus breath.
uniform float uDot;    // brightness of the lone point
uniform float uWeb;    // web emission
uniform float uThread; // thread through the web

float webDens(vec3 p){
  float r = ridged(p*2.2 + 5.0, 5);
  return pow(r, 7.0);
}

vec3 scene(vec3 ro, vec3 rd, vec2 uv){
  vec3 col = vec3(0);
  float R = 6.0;
  vec2 h = sphIntersect(ro, rd, vec3(0), R);
  if (h.y > 0.0 && uWeb > 0.0){
    float t0 = max(h.x, 0.0), t1 = min(h.y, t0 + 5.0);
    float dt = (t1 - t0)/64.0;
    float jit = h13(vec3(gl_FragCoord.xy, uTime))*dt;
    for (int i = 0; i < 64; i++){
      vec3 p = ro + rd*(t0 + jit + dt*float(i));
      float d = webDens(p);
      float edge = smoothstep(R, R*0.3, length(p));
      float node = step(0.9975, h13(floor(p*60.0)))*smoothstep(0.25, 0.6, d);  // galaxies
      d = pow(d, 1.6);                                   // sparser: filaments, not fog
      col += (mix(vec3(0.30, 0.36, 0.48), SILVER, smoothstep(0.1, 0.6, d))*d*0.9 + SILVER*node*2.5)*edge*dt;
    }
    col *= uWeb;
  }
  col += stars(rd, 0.35*uWeb, 0.0);
  col += pointGlow(ro, rd, vec3(0), 0.002, CBLUE*uDot);
  if (uThread > 0.0){
    vec3 a = vec3(-3.0, 0.2, -0.4), b = vec3(3.0, -0.25, 0.5);
    col += trail(ro, rd, a, b, 1e9, 0.006, uThread, 0.0);
  }
  return col;
}
