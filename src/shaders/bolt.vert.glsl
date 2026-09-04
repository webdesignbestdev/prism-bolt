attribute float aArc;
attribute float aU;
attribute float aWall;

varying vec3  vWorldNormal;
varying vec3  vViewNormal;
varying vec3  vEyeWorld;
varying vec3  vEyeView;
varying float vArc;
varying float vU;
varying float vWall;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec4 viewPos  = viewMatrix * worldPos;

  // World space drives the lighting, so the bolt tumbles through a fixed light.
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vEyeWorld    = normalize(worldPos.xyz - cameraPosition);

  // View space drives the refraction: only there does the .xy of a refracted
  // vector map onto a screen-space offset into the frame buffer texture.
  vViewNormal = normalize(normalMatrix * normal);
  vEyeView    = normalize(viewPos.xyz);

  vArc  = aArc;
  vU    = aU;
  vWall = aWall;

  gl_Position = projectionMatrix * viewPos;
}
