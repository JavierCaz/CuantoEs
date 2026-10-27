import * as THREE from 'three';

// GPU memory isn't garbage-collected: geometries, materials and textures must be freed by hand.
// Rooms are rebuilt every time you walk through a door, so everything a room owns goes through here.
export function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    // Sprites share one geometry across the whole app; only their material is theirs.
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) obj.geometry.dispose();
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Sprite) {
      const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    }
  });
  root.removeFromParent();
}
