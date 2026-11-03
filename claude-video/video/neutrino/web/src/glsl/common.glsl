// ---- shared library: hashing, noise, stars, the neutrino trail ----------
#define PI 3.14159265
const vec3 CBLUE = vec3(0.22, 0.52, 1.00);   // Cherenkov blue: the only accent
const vec3 ICE   = vec3(0.70, 0.86, 1.00);
const vec3 SILVER= vec3(0.86, 0.90, 0.96);

float h11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float h13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
vec3  h33(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33);
                   return fract((p.xxy+p.yxx)*p.zyx); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i), h13(i+vec3(1,0,0)), f.x),
                 mix(h13(i+vec3(0,1,0)), h13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i+vec3(0,0,1)), h13(i+vec3(1,0,1)), f.x),
                 mix(h13(i+vec3(0,1,1)), h13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++){ if (i >= oct) break; s += a*noise(p); p = p*2.03 + 17.1; a *= 0.5; }
  return s;
}
// ridged fbm: filaments (cosmic web, cracks, plumes)
float ridged(vec3 p, int oct){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++){ if (i >= oct) break; float n = 1.0-abs(noise(p)*2.0-1.0);
    s += a*n*n; p = p*2.11 + 11.3; a *= 0.5; }
  return s;
}

// pixels per radian at the current focal length
float pxScale(){ return uRes.y * uFocal; }

// directional starfield; blur>0 defocuses (rack focus), keeps energy
vec3 stars(vec3 rd, float amt, float blur){
  vec3 c = vec3(0);
  for (int l = 0; l < 3; l++){
    float sc = 90.0 + float(l)*110.0;
    vec3 p = rd*sc, id = floor(p), f = fract(p)-0.5;
    vec3 r = h33(id + float(l)*19.7);
    if (r.x > 0.05) continue;
    vec3 o = (h33(id*1.3+5.1)-0.5)*0.6;
    float d = length(f-o) / sc * pxScale();          // distance in pixels
    float w = 0.75 + blur;
    float b = pow(r.y, 5.0) * 3.0 + 0.04;
    vec3 tint = mix(vec3(0.75,0.85,1.0), vec3(1.0,0.97,0.92), r.z);
    c += tint * b * exp(-d*d/(w*w)) * (0.75/w)*(0.75/w);
  }
  return c * amt;
}

// closest approach between view ray and segment a->b.  s: 0 tail .. 1 head
float segRay(vec3 ro, vec3 rd, vec3 a, vec3 b, out float s, out float t){
  vec3 ba = b-a, oa = ro-a;
  float baba = dot(ba,ba), bard = dot(ba,rd), baoa = dot(ba,oa), rdoa = dot(rd,oa);
  float den = max(baba - bard*bard, 1e-7);
  s = clamp((baoa - rdoa*bard)/den, 0.0, 1.0);
  t = max(s*bard - rdoa, 0.0);
  s = clamp(dot(ro + rd*t - a, ba)/baba, 0.0, 1.0);
  return length(a + ba*s - ro - rd*t);
}

// THE visual DNA: a hairline blue-white neutrino trail.
// coreW in pixels (angular, stays hairline), haloR in world units,
// focus/coc give depth of field (energy conserving), tmax = occlusion depth.
vec3 trailDOF(vec3 ro, vec3 rd, vec3 a, vec3 b, float tmax, float haloR,
              float bright, float tailPow, float focus, float coc){
  float s, t; float d = segRay(ro, rd, a, b, s, t);
  if (t > tmax || t <= 0.0) return vec3(0);
  float px = d/t * pxScale();
  float w = 0.85 + coc*abs(t-focus)/max(t, 1e-3);
  float core = exp(-px*px/(w*w)) * (0.85/w);
  float halo = haloR*haloR/(d*d + haloR*haloR);
  float fade = pow(s, tailPow);
  vec3 col = mix(CBLUE, vec3(0.80,0.92,1.0), 0.75)*core*3.0 + CBLUE*halo*0.22;
  // shimmer travelling along the trail (fast, subtle)
  col *= 0.85 + 0.15*sin(s*900.0 - uTime*60.0);
  return col*fade*bright;
}
vec3 trail(vec3 ro, vec3 rd, vec3 a, vec3 b, float tmax, float haloR, float bright, float tailPow){
  return trailDOF(ro, rd, a, b, tmax, haloR, bright, tailPow, 1.0, 0.0);
}
// glowing point (head of trail, single DOM hit, faint dot)
vec3 pointGlow(vec3 ro, vec3 rd, vec3 p, float r, vec3 col){
  vec3 op = p - ro; float t = max(dot(op, rd), 1e-4);
  float d = length(op - rd*t);
  float px = d/t*pxScale();
  return col*(exp(-px*px*0.6) + r*r/(d*d + r*r)*0.25);
}
vec2 sphIntersect(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c; float b = dot(oc, rd), q = dot(oc, oc) - r*r, h = b*b - q;
  if (h < 0.0) return vec2(-1.0); h = sqrt(h); return vec2(-b-h, -b+h);
}
