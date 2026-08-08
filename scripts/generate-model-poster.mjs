import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);
const projectDirectory = resolve(scriptDirectory, "..");
const modelPath = join(projectDirectory, "public/models/myself.glb");
const posterPath = join(projectDirectory, "public/images/myself-poster.webp");
const manifestPath = join(scriptDirectory, "model-poster-manifest.json");
const dracoSourceDirectory = join(projectDirectory, "node_modules/three/examples/jsm/libs/draco/gltf");
const dracoPublicDirectory = join(projectDirectory, "public/draco");
const dracoFiles = ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"];
const posterSize = 1024;

const contentTypes = new Map([
  [".glb", "model/gltf-binary"],
  [".js", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"]
]);

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function syncDracoDecoder() {
  await mkdir(dracoPublicDirectory, { recursive: true });
  let changed = false;

  for (const file of dracoFiles) {
    const source = await readFile(join(dracoSourceDirectory, file));
    const destination = join(dracoPublicDirectory, file);
    let current = null;

    try {
      current = await readFile(destination);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    if (current?.equals(source)) continue;
    await writeFile(destination, source);
    changed = true;
  }

  if (changed) console.log("Synchronized Draco decoder assets.");
}

async function executableExists(path) {
  if (!path) return false;

  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findBrowserExecutable() {
  const configuredPath = process.env.MODEL_POSTER_BROWSER;
  const candidates = [
    configuredPath,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.env.PROGRAMFILES
      ? join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe")
      : null
  ];

  for (const candidate of candidates) {
    if (await executableExists(candidate)) return candidate;
  }

  if (configuredPath) {
    throw new Error(`MODEL_POSTER_BROWSER is not executable: ${configuredPath}`);
  }

  throw new Error(
    "A Chromium-based browser is required to regenerate the model poster. "
    + "Install Chrome/Chromium or set MODEL_POSTER_BROWSER to its executable path."
  );
}

function createPosterDocument() {
  return String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body, canvas {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }
      canvas { display: block; }
    </style>
    <script type="importmap">
      {
        "imports": {
          "three": "/node_modules/three/build/three.module.js",
          "three/addons/": "/node_modules/three/examples/jsm/"
        }
      }
    </script>
  </head>
  <body>
    <canvas id="poster"></canvas>
    <script type="module">
      import * as THREE from "three";
      import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
      import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

      function createContactShadow(size) {
        const shadowCanvas = document.createElement("canvas");
        shadowCanvas.width = 128;
        shadowCanvas.height = 128;

        const context = shadowCanvas.getContext("2d");
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

      function prepareModel(model, renderer) {
        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

        model.traverse((object) => {
          if (!object.isMesh) return;
          if (!object.geometry.getAttribute("normal")) object.geometry.computeVertexNormals();

          const materials = Array.isArray(object.material) ? object.material : [object.material];
          const preparedMaterials = materials.map((sourceMaterial) => {
            const material = sourceMaterial.clone();
            if (material.isMeshStandardMaterial) {
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

      async function renderPoster() {
        const canvas = document.querySelector("#poster");
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          canvas,
          powerPreference: "high-performance",
          premultipliedAlpha: true,
          preserveDrawingBuffer: true
        });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(1);
        renderer.setSize(${posterSize}, ${posterSize}, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.16;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
        camera.position.set(0, 0.025, 2.5);
        const cameraTarget = new THREE.Vector3(0, 0.02, 0);

        const stage = new THREE.Group();
        scene.add(stage);

        const hemisphereLight = new THREE.HemisphereLight(0xfffdf5, 0x405149, 2.7);
        const keyLight = new THREE.DirectionalLight(0xfff2d9, 4.2);
        const fillLight = new THREE.DirectionalLight(0x9fd8ff, 2.2);
        const rimLight = new THREE.DirectionalLight(0xd9ff9a, 2.8);
        keyLight.position.set(3.5, 4.5, 4.5);
        fillLight.position.set(-4, 1.2, 2.4);
        rimLight.position.set(1, 2.8, -4.5);
        scene.add(hemisphereLight, keyLight, fillLight, rimLight);

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("/draco/");
        dracoLoader.setWorkerLimit(1);

        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        const gltf = await loader.loadAsync("/models/myself.glb");
        const model = gltf.scene;
        prepareModel(model, renderer);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const modelSize = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        stage.add(model, createContactShadow(modelSize));

        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2));
        const heightDistance = modelSize.y / (2 * Math.tan(verticalFov / 2));
        const widthDistance = modelSize.x / (2 * Math.tan(horizontalFov / 2));
        const distance = Math.max(heightDistance, widthDistance) * 1.1 + modelSize.z * 0.46;
        const direction = camera.position.clone().sub(cameraTarget).normalize();
        camera.position.copy(cameraTarget).add(direction.multiplyScalar(distance));
        camera.near = Math.max(0.01, distance / 100);
        camera.far = distance * 50;
        camera.lookAt(cameraTarget);
        camera.updateProjectionMatrix();

        renderer.render(scene, camera);
        await new Promise((resolveFrame) => requestAnimationFrame(() => {
          renderer.render(scene, camera);
          resolveFrame();
        }));
      }

      renderPoster()
        .then(() => { document.documentElement.dataset.posterState = "ready"; })
        .catch((error) => {
          document.documentElement.dataset.posterState = "error";
          document.documentElement.dataset.posterError = error instanceof Error ? error.message : String(error);
        });
    </script>
  </body>
</html>`;
}

function resolveRequestPath(requestPath) {
  if (requestPath === "/models/myself.glb") return modelPath;
  if (requestPath.startsWith("/draco/")) {
    const resolvedPath = resolve(dracoPublicDirectory, `.${requestPath.slice("/draco".length)}`);
    return resolvedPath.startsWith(`${dracoPublicDirectory}${sep}`) ? resolvedPath : null;
  }
  if (!requestPath.startsWith("/node_modules/")) return null;

  const resolvedPath = resolve(projectDirectory, `.${requestPath}`);
  const nodeModulesPath = join(projectDirectory, "node_modules");
  return resolvedPath.startsWith(`${nodeModulesPath}${sep}`) ? resolvedPath : null;
}

async function startPosterServer() {
  const document = createPosterDocument();
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/" || requestUrl.pathname === "/poster/") {
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8"
        });
        response.end(document);
        return;
      }

      const assetPath = resolveRequestPath(decodeURIComponent(requestUrl.pathname));
      if (!assetPath) {
        response.writeHead(404).end();
        return;
      }

      const asset = await readFile(assetPath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": String(asset.byteLength),
        "Content-Type": contentTypes.get(extname(assetPath)) ?? "application/octet-stream"
      });
      response.end(asset);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end();
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start the poster render server.");

  return {
    server,
    url: `http://127.0.0.1:${address.port}/poster/`
  };
}

async function stopServer(server) {
  if (!server) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

async function waitForDebuggingPort(profileDirectory, browserProcess) {
  const portFile = join(profileDirectory, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (browserProcess.exitCode !== null) {
      throw new Error(`The poster browser exited with code ${browserProcess.exitCode}.`);
    }

    try {
      const [port] = (await readFile(portFile, "utf8")).trim().split("\n");
      if (port) return Number(port);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    await delay(50);
  }

  throw new Error("Timed out while starting the poster browser.");
}

async function createPageTarget(port, pageUrl) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`,
    { method: "PUT" }
  );
  if (!response.ok) throw new Error(`Unable to create a poster page: HTTP ${response.status}`);
  return response.json();
}

async function connectToPage(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pendingMessages = new Map();
  let nextMessageId = 1;

  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pendingMessages.has(message.id)) return;

    const { resolveMessage, rejectMessage } = pendingMessages.get(message.id);
    pendingMessages.delete(message.id);
    if (message.error) rejectMessage(new Error(message.error.message));
    else resolveMessage(message.result);
  });

  socket.addEventListener("close", () => {
    for (const { rejectMessage } of pendingMessages.values()) {
      rejectMessage(new Error("The poster browser connection closed unexpectedly."));
    }
    pendingMessages.clear();
  });

  return {
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextMessageId++;
      return new Promise((resolveMessage, rejectMessage) => {
        pendingMessages.set(id, { resolveMessage, rejectMessage });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

async function waitForPoster(page) {
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    const evaluation = await page.send("Runtime.evaluate", {
      expression: `({
        state: document.documentElement.dataset.posterState ?? "loading",
        error: document.documentElement.dataset.posterError ?? ""
      })`,
      returnByValue: true
    });
    const result = evaluation.result?.value;

    if (result?.state === "ready") return;
    if (result?.state === "error") {
      throw new Error(`Unable to render the model poster: ${result.error || "unknown browser error"}`);
    }

    await delay(100);
  }

  throw new Error("Timed out while rendering the model poster.");
}

async function stopBrowser(browserProcess) {
  if (!browserProcess || browserProcess.exitCode !== null) return;
  browserProcess.kill("SIGTERM");

  const exited = await Promise.race([
    new Promise((resolveExit) => browserProcess.once("exit", () => resolveExit(true))),
    delay(3_000).then(() => false)
  ]);

  if (!exited && browserProcess.exitCode === null) browserProcess.kill("SIGKILL");
}

async function renderPoster(browserExecutable, pageUrl, temporaryDirectory) {
  const profileDirectory = join(temporaryDirectory, "chrome-profile");
  const browserProcess = spawn(browserExecutable, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-sync",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    `--window-size=${posterSize},${posterSize}`,
    "about:blank"
  ], {
    stdio: "ignore"
  });

  let page;
  try {
    const port = await waitForDebuggingPort(profileDirectory, browserProcess);
    const target = await createPageTarget(port, pageUrl);
    page = await connectToPage(target.webSocketDebuggerUrl);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: posterSize,
      height: posterSize,
      deviceScaleFactor: 1,
      mobile: false
    });
    await page.send("Emulation.setDefaultBackgroundColorOverride", {
      color: { r: 0, g: 0, b: 0, a: 0 }
    });
    await page.send("Page.navigate", { url: pageUrl });
    await waitForPoster(page);

    const screenshot = await page.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true
    });
    if (!screenshot.data) throw new Error("The poster browser returned an empty screenshot.");
    return Buffer.from(screenshot.data, "base64");
  } finally {
    page?.close();
    await stopBrowser(browserProcess);
  }
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function main() {
  const force = process.argv.includes("--force");
  await syncDracoDecoder();
  const [model, rendererSource] = await Promise.all([
    readFile(modelPath),
    readFile(scriptPath)
  ]);
  const modelSha256 = createHash("sha256").update(model).digest("hex");
  const rendererSha256 = createHash("sha256").update(rendererSource).digest("hex");
  const manifest = await readManifest();

  const isCurrent = manifest?.modelSha256 === modelSha256
    && manifest?.rendererSha256 === rendererSha256
    && manifest?.width === posterSize
    && manifest?.height === posterSize
    && await exists(posterPath);

  if (isCurrent && !force) {
    console.log("Model poster is current.");
    return;
  }

  const browserExecutable = await findBrowserExecutable();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "biumbiu-model-poster-"));
  let server;

  try {
    const posterServer = await startPosterServer();
    server = posterServer.server;
    const png = await renderPoster(browserExecutable, posterServer.url, temporaryDirectory);
    const poster = await sharp(png)
      .resize(posterSize, posterSize, { fit: "fill" })
      .webp({ alphaQuality: 100, effort: 6, quality: 86, smartSubsample: true })
      .toBuffer();

    const metadata = await sharp(poster).metadata();
    if (metadata.width !== posterSize || metadata.height !== posterSize || metadata.hasAlpha !== true) {
      throw new Error("Generated poster must be a transparent 1024 x 1024 WebP image.");
    }

    await writeFile(posterPath, poster);
    await writeFile(manifestPath, `${JSON.stringify({
      modelSha256,
      rendererSha256,
      width: posterSize,
      height: posterSize
    }, null, 2)}\n`);
    console.log(`Generated ${posterPath}`);
  } finally {
    await stopServer(server);
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
