import * as THREE from 'three';
import type { Rect } from '../money/layout';
import { DOOR_HEIGHT, DOOR_WIDTH, VESTIBULE, WALL_THICKNESS, type Door, type RoomPlan, type Wall } from '../museum/rooms';
import { disposeObject } from './dispose';
import { DoorMist } from './DoorMist';
import { ARENA, CARBON, TERRACOTA } from './palette';

const COLUMN_SPACING = 10;

// One museum room, a bodega sized to its plan: floor with a 1 m grid, four walls and columns,
// a doorway in the walls that lead to other rooms, and a dark passage full of mist behind each.
// Built in world coordinates; the plan already has everything in meters.
export class Warehouse {
  readonly group = new THREE.Group();
  readonly width: number;
  readonly depth: number;
  private readonly mist: DoorMist;

  constructor(private readonly plan: RoomPlan) {
    const { area } = plan;
    this.width = area.maxX - area.minX;
    this.depth = area.maxZ - area.minZ;
    const doors = [plan.entry, plan.exit].filter((d): d is Door => d !== null);
    this.build(doors);
    this.mist = new DoorMist(doors);
    this.group.add(this.mist.group);
  }

  update(dt: number) {
    this.mist.update(dt);
  }

  dispose() {
    disposeObject(this.group);
  }

  private build(doors: Door[]) {
    const { area, wallHeight } = this.plan;
    const { width, depth } = this;
    const cx = (area.minX + area.maxX) / 2;
    const cz = (area.minZ + area.maxZ) / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: CARBON, roughness: 0.9 }),
    );
    // PlaneGeometry is vertical (XY) by default; lay it flat on the ground (XZ).
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    this.group.add(floor);

    const grid = floorGrid(area);
    grid.position.y = 0.002; // just above the floor to avoid z-fighting
    this.group.add(grid);

    // Each wall is a run of boxes along its center line, broken at its doors,
    // with a lintel over each opening.
    const wallMaterial = new THREE.MeshStandardMaterial({ color: ARENA, roughness: 1 });
    const T = WALL_THICKNESS;
    const piece = (wall: Wall, a: number, b: number, bottom: number, top: number) => {
      if (b - a < 0.01) return;
      const alongX = wall === 'frente' || wall === 'fondo';
      const mesh = new THREE.Mesh(
        alongX ? new THREE.BoxGeometry(b - a, top - bottom, T) : new THREE.BoxGeometry(T, top - bottom, b - a),
        wallMaterial,
      );
      const line = { frente: area.maxZ, fondo: area.minZ, derecha: area.maxX, izquierda: area.minX }[wall];
      if (alongX) mesh.position.set((a + b) / 2, (bottom + top) / 2, line);
      else mesh.position.set(line, (bottom + top) / 2, (a + b) / 2);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    const runs: Record<Wall, [number, number]> = {
      frente: [area.minX - T / 2, area.maxX + T / 2], // the front and back walls cover the corners
      fondo: [area.minX - T / 2, area.maxX + T / 2],
      derecha: [area.minZ, area.maxZ],
      izquierda: [area.minZ, area.maxZ],
    };
    for (const wall of Object.keys(runs) as Wall[]) {
      const [start, end] = runs[wall];
      let from = start;
      const along = (d: Door) => (wall === 'frente' || wall === 'fondo' ? d.x : d.z);
      for (const door of doors.filter((d) => d.wall === wall).sort((a, b) => along(a) - along(b))) {
        const center = along(door);
        piece(wall, from, center - DOOR_WIDTH / 2, 0, wallHeight);
        piece(wall, center - DOOR_WIDTH / 2, center + DOOR_WIDTH / 2, DOOR_HEIGHT, wallHeight);
        from = center + DOOR_WIDTH / 2;
      }
      piece(wall, from, end, 0, wallHeight);
    }

    // The passage behind each door: a box seen from the inside (BackSide), so its walls, floor
    // and ceiling show while the face toward the room stays invisible. It keeps you from
    // seeing past the mist's edges into the void where the next room would be.
    const passageMaterial = new THREE.MeshBasicMaterial({ color: CARBON, side: THREE.BackSide });
    for (const door of doors) {
      const passage = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH + 0.04, DOOR_HEIGHT + 0.02, VESTIBULE), passageMaterial);
      passage.rotation.y = Math.atan2(door.nx, door.nz); // box depth (Z) along the door's normal
      passage.position.set(door.x + (door.nx * VESTIBULE) / 2, DOOR_HEIGHT / 2, door.z + (door.nz * VESTIBULE) / 2);
      this.group.add(passage);
    }

    const columnGeometry = new THREE.BoxGeometry(0.5, wallHeight, 0.5);
    const columnMaterial = new THREE.MeshStandardMaterial({ color: TERRACOTA });
    const clearOfDoors = (x: number, wall: Wall) =>
      doors.every((d) => d.wall !== wall || Math.abs(d.x - x) > DOOR_WIDTH / 2 + 0.5);
    for (let x = area.minX + COLUMN_SPACING; x < area.maxX; x += COLUMN_SPACING) {
      for (const [wall, z] of [['fondo', area.minZ + 0.5], ['frente', area.maxZ - 0.5]] as const) {
        if (!clearOfDoors(x, wall)) continue;
        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        column.position.set(x, wallHeight / 2, z);
        this.group.add(column);
      }
    }
  }
}

// 1 m grid lines covering exactly the floor. (THREE.GridHelper is always square, so on a
// rectangular floor it would stick out through the walls.)
function floorGrid({ minX, maxX, minZ, maxZ }: Rect): THREE.LineSegments {
  const points: number[] = [];
  for (let x = Math.ceil(minX); x <= maxX; x++) points.push(x, 0, minZ, x, 0, maxZ);
  for (let z = Math.ceil(minZ); z <= maxZ; z++) points.push(minX, 0, z, maxX, 0, z);
  const geometry = new THREE.BufferGeometry();
  // A flat array of xyz numbers, read 3 at a time; each pair of points is one line segment.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x3d4140 }));
}
