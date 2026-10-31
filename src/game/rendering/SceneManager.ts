import * as THREE from 'three';

export class SceneManager {
  readonly scene = new THREE.Scene();

  constructor() {
    this.scene.background = new THREE.Color(0x0a0a1a);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    this.scene.add(sun);
  }

  add(...objects: THREE.Object3D[]): void {
    this.scene.add(...objects);
  }

  remove(...objects: THREE.Object3D[]): void {
    this.scene.remove(...objects);
  }

  dispose(): void {
    this.scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => m.dispose());
    });
  }
}
