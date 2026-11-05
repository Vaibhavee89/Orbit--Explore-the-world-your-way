import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Cinematic post-processing pipeline: filmic tone mapping + subtle bloom
 * (sun/highlight glow) + ambient occlusion (contact shadows at building/
 * terrain edges). Pure render-pipeline work — no extra assets required.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;

  private _composer: EffectComposer | null = null;
  private _bloomPass: UnrealBloomPass | null = null;
  private _ssaoPass: SSAOPass | null = null;
  private _composerScene: THREE.Scene | null = null;
  private _composerCamera: THREE.Camera | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Filmic tone mapping — the single biggest "cinematic vs flat" lever,
    // free of any extra assets or geometry.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  private _buildComposer(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): void {
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Subtle bloom — catches sun glare / bright highlights without
    // washing out the scene. Conservative threshold so only true
    // highlights bloom, not the whole terrain.
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.35, 0.5, 0.86);
    composer.addPass(bloom);
    this._bloomPass = bloom;

    // Ambient occlusion — adds contact shadows where props meet terrain
    // and at building corners, which reads as "grounded" rather than
    // flat-shaded primitives floating on the mesh.
    const ssao = new SSAOPass(scene, camera, width, height);
    ssao.kernelRadius = 6;
    ssao.minDistance = 0.002;
    ssao.maxDistance = 0.12;
    composer.addPass(ssao);
    this._ssaoPass = ssao;

    composer.addPass(new OutputPass());

    this._composer = composer;
    this._composerScene = scene;
    this._composerCamera = camera;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this._composer?.setSize(width, height);
    this._bloomPass?.setSize(width, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;

    if (!this._composer || this._composerScene !== scene || this._composerCamera !== camera) {
      this._buildComposer(scene, camera, width, height);
    }

    this._composer!.render();
  }

  dispose(): void {
    this._composer?.dispose();
    this.renderer.dispose();
  }
}
