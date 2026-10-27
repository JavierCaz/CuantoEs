import * as THREE from 'three';
import { centered, type Reference, type ReferenceSpec } from './shared';

const HEIGHT = 1.7;

// A 1.70 m adult built from primitives, facing +Z (toward the entrance).
// Proportions follow the usual drawing rules: the head is ~1/7.5 of the height,
// the legs about half, and the fingertips reach mid-thigh.
function build(): Reference {
  const skin = new THREE.MeshStandardMaterial({ color: 0xc68a5e, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xe0a33a, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.8 });
  const group = new THREE.Group();

  // A capsule spanning from `bottom` to `top` (caps included). CapsuleGeometry's
  // second argument is only the straight middle section, so subtract both caps.
  const limb = (radius: number, bottom: number, top: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, top - bottom - radius * 2, 4, 10), material);
    mesh.position.y = (top + bottom) / 2;
    group.add(mesh);
    return mesh;
  };

  for (const side of [-1, 1]) {
    limb(0.068, 0.05, 0.93, pants).position.x = side * 0.09; // leg

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.26), dark);
    shoe.position.set(side * 0.09, 0.035, 0.03); // toes stick out forward
    group.add(shoe);

    // Arms pivot at the shoulder: put the capsule in a group placed at the shoulder,
    // then rotating the group swings the arm out like a real joint.
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 1.42, 0);
    shoulder.rotation.z = side * 0.09;
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.5, 4, 10), shirt);
    arm.position.y = -0.29;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), skin);
    hand.position.y = -0.6;
    shoulder.add(arm, hand);
    group.add(shoulder);
  }

  const hips = limb(0.14, 0.84, 1.0, pants);
  hips.scale.set(1.05, 1, 0.62);
  const torso = limb(0.17, 0.9, 1.5, shirt);
  torso.scale.set(1.05, 1, 0.65); // flatten front-to-back: bodies are wider than deep
  limb(0.05, 1.44, 1.53, skin); // neck

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skin);
  head.scale.set(0.92, 1.15, 1); // slightly egg-shaped
  head.position.y = HEIGHT - 0.115;
  // Hair: the top of a slightly bigger sphere, sharing the head's center. Offsetting it would
  // let the head poke through where the two surfaces cross, in a jagged line.
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.108, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), dark);
  hair.rotation.x = -0.3; // tilt back: hair reaches lower behind the head than over the forehead
  head.add(hair); // child of the head, so it inherits the head's position and scale
  group.add(head);

  return { object: group, label: 'Persona · 1.70 m', labelHeight: HEIGHT, solids: [centered(0.5, 0.5)] };
}

export const persona: ReferenceSpec = { footprint: { w: 0.5, d: 0.5, h: HEIGHT }, build };
