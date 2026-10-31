// Smoke-test: verifies THREE and Cesium imports resolve at build time.
// Not loaded by the main Travel Mode app; imported only by adventure entry points.
import * as THREE from 'three';
import * as Cesium from 'cesium';

export function mountTestCanvas(container: HTMLElement): () => void {
  // THREE basic scene
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth || 400, container.clientHeight || 300);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 1000);
  camera.position.z = 3;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshNormalMaterial()
  );
  scene.add(mesh);

  let raf = 0;
  function animate() {
    raf = requestAnimationFrame(animate);
    mesh.rotation.x += 0.01;
    mesh.rotation.y += 0.01;
    renderer.render(scene, camera);
  }
  animate();

  // Cesium viewer (mounts to a separate div if CESIUM_BASE_URL is set)
  console.info('[adventure] THREE r' + THREE.REVISION + ' OK');
  console.info('[adventure] Cesium ' + (Cesium as unknown as { VERSION: string }).VERSION + ' OK');

  return () => {
    cancelAnimationFrame(raf);
    renderer.dispose();
  };
}
