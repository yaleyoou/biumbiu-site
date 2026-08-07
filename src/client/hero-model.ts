import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "/models/meselft.glb";

function createContactShadow(size: THREE.Vector3) {
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;

  const context = shadowCanvas.getContext("2d");
  if (!context) return null;

  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.42)");
  gradient.addColorStop(0.48, "rgba(0, 0, 0, 0.2)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(shadowCanvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    opacity: 0.62,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
  const geometry = new THREE.PlaneGeometry(size.x * 0.9, Math.max(size.z * 0.82, size.x * 0.28));
  const shadow = new THREE.Mesh(geometry, material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -size.y / 2 + 0.006;
  shadow.renderOrder = -1;

  return shadow;
}

function prepareModel(model: THREE.Object3D, renderer: THREE.WebGLRenderer) {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    if (!object.geometry.getAttribute("normal")) {
      object.geometry.computeVertexNormals();
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const preparedMaterials = materials.map((sourceMaterial) => {
      const material = sourceMaterial.clone();

      if (material instanceof THREE.MeshStandardMaterial) {
        material.metalness = 0;
        material.roughness = Math.max(material.roughness, 0.78);
        if (material.map) material.map.anisotropy = Math.min(8, maxAnisotropy);
      }

      material.needsUpdate = true;
      return material;
    });

    object.material = Array.isArray(object.material) ? preparedMaterials : preparedMaterials[0];
  });
}

function disposeObject(object: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
      material.dispose();
    });
  });

  textures.forEach((texture) => texture.dispose());
}

export function mountHeroModel(root: HTMLElement | null) {
  if (!root || root.dataset.modelMounted === "true") return () => {};

  const canvas = root.querySelector<HTMLCanvasElement>("[data-hero-model-canvas]");
  if (!canvas) return () => {};

  root.dataset.modelMounted = "true";
  root.dataset.state = "loading";
  root.setAttribute("aria-busy", "true");

  let renderer: THREE.WebGLRenderer;

  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
      premultipliedAlpha: true
    });
  } catch (error) {
    root.dataset.state = "error";
    root.setAttribute("aria-busy", "false");
    console.error("Unable to initialize the hero WebGL scene.", error);
    return () => {};
  }

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  camera.position.set(0, 0.025, 2.5);

  const stage = new THREE.Group();
  const modelMotion = new THREE.Group();
  stage.add(modelMotion);
  scene.add(stage);

  const hemisphereLight = new THREE.HemisphereLight(0xfffdf5, 0x405149, 2.7);
  const keyLight = new THREE.DirectionalLight(0xfff2d9, 4.2);
  const fillLight = new THREE.DirectionalLight(0x9fd8ff, 2.2);
  const rimLight = new THREE.DirectionalLight(0xd9ff9a, 2.8);
  keyLight.position.set(3.5, 4.5, 4.5);
  fillLight.position.set(-4, 1.2, 2.4);
  rimLight.position.set(1, 2.8, -4.5);
  scene.add(hemisphereLight, keyLight, fillLight, rimLight);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion.matches;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = 0.72;
  controls.autoRotate = !reducedMotion.matches;
  controls.autoRotateSpeed = 0.78;
  controls.minPolarAngle = Math.PI * 0.31;
  controls.maxPolarAngle = Math.PI * 0.69;
  controls.target.set(0, 0.02, 0);
  controls.update();

  const loader = new GLTFLoader();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let model: THREE.Object3D | null = null;
  let modelSize: THREE.Vector3 | null = null;
  let animationFrame = 0;
  let autoRotateTimer = 0;
  let destroyed = false;
  let isIntersecting = true;
  let lastFrameTime = performance.now();
  let elapsed = 0;

  const render = () => renderer.render(scene, camera);

  const fitCamera = () => {
    const bounds = root.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;

    if (modelSize) {
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const heightDistance = modelSize.y / (2 * Math.tan(verticalFov / 2));
      const widthDistance = modelSize.x / (2 * Math.tan(horizontalFov / 2));
      const distance = Math.max(heightDistance, widthDistance) * 1.1 + modelSize.z * 0.46;
      const direction = camera.position.clone().sub(controls.target).normalize();

      camera.position.copy(controls.target).add(direction.multiplyScalar(distance));
      camera.near = Math.max(0.01, distance / 100);
      camera.far = distance * 50;
    }

    camera.updateProjectionMatrix();
    controls.update();
    render();
  };

  const shouldAnimate = () => (
    Boolean(model)
    && isIntersecting
    && !document.hidden
    && !destroyed
    && !reducedMotion.matches
  );

  const animate = (time: number) => {
    animationFrame = 0;
    if (!shouldAnimate() || !modelSize) return;

    const delta = Math.min((time - lastFrameTime) / 1000, 0.05);
    lastFrameTime = time;
    elapsed += delta;

    modelMotion.position.y = Math.sin(elapsed * 1.16) * modelSize.y * 0.012;
    modelMotion.rotation.z = Math.sin(elapsed * 0.82) * 0.008;
    controls.update(delta);
    render();
    animationFrame = window.requestAnimationFrame(animate);
  };

  const syncAnimation = () => {
    if (!shouldAnimate()) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      return;
    }

    if (!animationFrame) {
      lastFrameTime = performance.now();
      animationFrame = window.requestAnimationFrame(animate);
    }
  };

  const resumeAutoRotate = () => {
    window.clearTimeout(autoRotateTimer);
    autoRotateTimer = window.setTimeout(() => {
      controls.autoRotate = !reducedMotion.matches;
      syncAnimation();
    }, 1800);
  };

  const pauseAutoRotate = () => {
    window.clearTimeout(autoRotateTimer);
    controls.autoRotate = false;
  };

  const onControlStart = () => {
    pauseAutoRotate();
    root.dataset.interacting = "true";
  };

  const onControlEnd = () => {
    delete root.dataset.interacting;
    resumeAutoRotate();
  };

  const onControlChange = () => {
    if (reducedMotion.matches) render();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
    event.preventDefault();
    pauseAutoRotate();

    if (event.key === "Home") {
      const distance = camera.position.distanceTo(controls.target);
      camera.position.set(0, controls.target.y, distance);
    } else {
      const direction = event.key === "ArrowLeft" ? 1 : -1;
      const offset = camera.position.clone().sub(controls.target).applyAxisAngle(yAxis, direction * Math.PI / 18);
      camera.position.copy(controls.target).add(offset);
    }

    controls.update();
    render();
    resumeAutoRotate();
  };

  const onMotionPreferenceChange = () => {
    controls.enableDamping = !reducedMotion.matches;
    controls.autoRotate = !reducedMotion.matches;

    if (reducedMotion.matches) {
      modelMotion.position.y = 0;
      modelMotion.rotation.z = 0;
      render();
    }

    syncAnimation();
  };

  const onVisibilityChange = () => syncAnimation();

  controls.addEventListener("start", onControlStart);
  controls.addEventListener("end", onControlEnd);
  controls.addEventListener("change", onControlChange);
  root.addEventListener("keydown", onKeydown);
  reducedMotion.addEventListener("change", onMotionPreferenceChange);
  document.addEventListener("visibilitychange", onVisibilityChange);

  const resizeObserver = new ResizeObserver(fitCamera);
  resizeObserver.observe(root);

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    isIntersecting = entry?.isIntersecting ?? true;
    syncAnimation();
  }, { threshold: 0.05 });
  intersectionObserver.observe(root);

  fitCamera();

  loader.load(
    MODEL_URL,
    (gltf) => {
      if (destroyed) {
        disposeObject(gltf.scene);
        return;
      }

      model = gltf.scene;
      prepareModel(model, renderer);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      modelSize = box.getSize(new THREE.Vector3());
      model.position.sub(center);
      modelMotion.add(model);

      const contactShadow = createContactShadow(modelSize);
      if (contactShadow) stage.add(contactShadow);

      fitCamera();
      render();
      root.dataset.state = "ready";
      root.setAttribute("aria-busy", "false");
      root.dispatchEvent(new CustomEvent("hero-model-ready"));
      syncAnimation();
    },
    (event) => {
      if (!event.total) return;
      root.style.setProperty("--model-load-progress", String(event.loaded / event.total));
    },
    (error) => {
      root.dataset.state = "error";
      root.setAttribute("aria-busy", "false");
      console.error("Unable to load the hero model.", error);
    }
  );

  return () => {
    destroyed = true;
    window.clearTimeout(autoRotateTimer);
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    reducedMotion.removeEventListener("change", onMotionPreferenceChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    root.removeEventListener("keydown", onKeydown);
    controls.removeEventListener("start", onControlStart);
    controls.removeEventListener("end", onControlEnd);
    controls.removeEventListener("change", onControlChange);
    controls.dispose();
    disposeObject(stage);
    renderer.dispose();
    delete root.dataset.modelMounted;
  };
}
