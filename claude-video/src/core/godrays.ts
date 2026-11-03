import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Screen-space crepuscular rays. The sun sits low behind the island, so the
 * bright halo and the cloud tops feed a radial blur that reads as light
 * shafts breaking through the cloud deck. Fades out on dark pixels (the
 * island itself) so it does not paint beams over the silhouette.
 */
export const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSunUv: { value: new THREE.Vector2(0.3, 0.1) },
    uIntensity: { value: 0.28 },
    uDecay: { value: 0.965 },
    uSamples: { value: 48 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunUv;
    uniform float uIntensity;
    uniform float uDecay;
    uniform float uSamples;
    varying vec2 vUv;

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;

      vec2 delta = (uSunUv - vUv) / uSamples;
      vec2 pos = vUv;
      vec3 accum = vec3(0.0);
      float w = 1.0;
      float wsum = 0.0;
      for (int i = 0; i < 48; i++) {
        if (float(i) >= uSamples) break;
        pos += delta;
        vec3 c = texture2D(tDiffuse, pos).rgb;
        // only the bright sky / lit clouds cast shafts
        float m = smoothstep(0.45, 1.0, luma(c));
        accum += c * m * w;
        wsum += w;
        w *= uDecay;
      }
      accum /= max(wsum, 1e-4);

      float d = length((vUv - uSunUv) * vec2(1.0, 1.25));
      float falloff = smoothstep(1.05, 0.0, d);
      vec3 rays = accum * uIntensity * falloff * vec3(1.0, 0.83, 0.62);

      // keep the shafts out of the dark island silhouette
      base += rays * smoothstep(0.12, 0.45, luma(base));
      gl_FragColor = vec4(base, 1.0);
    }
  `,
};

export function createGodRaysPass() {
  return new ShaderPass(GodRaysShader);
}
