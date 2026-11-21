import '@esri/calcite-components/dist/components/calcite-button';
import '@esri/calcite-components/dist/components/calcite-loader';
import { CalciteButton, CalciteLoader } from "@esri/calcite-components-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  Box3, BufferGeometry, Color, DirectionalLight, GridHelper, Group,
  HemisphereLight, LoadingManager, Material, Mesh, MeshStandardMaterial, NeutralToneMapping,
  PerspectiveCamera, PMREMGenerator, Scene, Texture, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { Object3D, WebGLRenderTarget } from "three";

async function readModel(file: File): Promise<Object3D> {
  if (/\.stl$/i.test(file.name)) {
    const geometry = new STLLoader().parse(await file.arrayBuffer());
    return new Mesh(geometry, new MeshStandardMaterial({ color: 0xe4ecf5, roughness: 0.75 }));
  }
  if (!/\.glb$/i.test(file.name)) throw new Error("Choose a GLB or STL file.");

  const data = await file.arrayBuffer();
  if (data.byteLength < 12 || new DataView(data).getUint32(0, true) !== 0x46546c67) {
    throw new Error("Invalid GLB header.");
  }
  const manager = new LoadingManager().setURLModifier((url) => {
    if (/^(blob:|data:)/i.test(url)) return url;
    throw new Error("The GLB must contain its own textures and buffers.");
  });
  const gltf = await new GLTFLoader(manager).parseAsync(data, "");
  return gltf.scene;
}

function disposeModel(model: Object3D) {
  const resources = new Set<BufferGeometry | Material | Texture>();
  const images = new Set<ImageBitmap>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (!(value instanceof Texture)) continue;
        resources.add(value);
        if (value.image instanceof ImageBitmap) images.add(value.image);
      }
    }
  });
  resources.forEach((resource) => resource.dispose());
  images.forEach((image) => image.close());
}

type ViewState = "loading" | "ready" | "invalid" | "unavailable";

export default function ModelViewport({ file }: { file: File }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reset = useRef<(() => void) | undefined>(undefined);
  const helpId = useId();
  const [status, setStatus] = useState<ViewState>("loading");
  const [zUp, setZUp] = useState(false);
  const isStl = /\.stl$/i.test(file.name);
  const rotateStl = isStl && zUp;

  useEffect(() => {
    const container = host.current;
    const surface = canvas.current;
    if (!container || !surface) return;
    setStatus("loading");
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas: surface, antialias: true });
    } catch {
      setStatus("unavailable");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = NeutralToneMapping;
    const scene = new Scene();
    scene.background = new Color(0x182233);
    scene.add(new HemisphereLight(0xeaf4ff, 0x536171, 2.1));
    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 6, 4);
    scene.add(keyLight);
    const grid = new GridHelper(3.6, 18, 0x536881, 0x354559);
    grid.visible = false;
    scene.add(grid);
    const camera = new PerspectiveCamera(38, 1, 0.01, 100);
    const controls = new OrbitControls(camera, surface);
    controls.minDistance = 0.15;
    controls.maxDistance = 30;
    controls.listenToKeyEvents(container);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const zoomWithKeyboard = (event: KeyboardEvent) => {
      if (!reset.current || !["+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      const factor = event.key === "-" ? 1.15 : 1 / 1.15;
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
      controls.update();
    };
    container.addEventListener("keydown", zoomWithKeyboard);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let disposed = false;
    let loadedModel: Object3D | undefined;
    let environmentMap: WebGLRenderTarget | undefined;
    void readModel(file).then((model) => {
      if (disposed) {
        disposeModel(model);
        return;
      }
      loadedModel = model;
      const centered = new Group();
      centered.add(model);
      if (rotateStl) centered.rotation.x = -Math.PI / 2;
      const box = new Box3().setFromObject(centered);
      const diagonal = box.getSize(new Vector3()).length();
      if (!diagonal || !Number.isFinite(diagonal)) throw new Error("The file has no usable geometry.");
      if (!isStl) {
        const environment = new RoomEnvironment();
        const generator = new PMREMGenerator(renderer);
        try {
          environmentMap = generator.fromScene(environment, 0.04);
          scene.environment = environmentMap.texture;
        } finally {
          environment.dispose();
          generator.dispose();
        }
      }
      const scale = 2 / diagonal;
      centered.scale.setScalar(scale);
      centered.position.copy(box.getCenter(new Vector3())).multiplyScalar(-scale);
      scene.add(centered);
      grid.position.y = box.min.y * scale + centered.position.y - 0.016;
      grid.visible = true;

      reset.current = () => {
        const vertical = camera.fov * Math.PI / 360;
        const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
        const distance = 1.12 / Math.sin(Math.min(vertical, horizontal));
        camera.position.set(1, 0.86, 1.25).setLength(distance);
        controls.target.set(0, 0, 0);
        controls.update();
        render();
      };
      reset.current();
      setStatus("ready");
    }).catch(() => {
      if (!disposed) setStatus("invalid");
    });

    return () => {
      disposed = true;
      reset.current = undefined;
      container.removeEventListener("keydown", zoomWithKeyboard);
      observer.disconnect();
      controls.dispose();
      if (loadedModel) disposeModel(loadedModel);
      environmentMap?.dispose();
      grid.dispose();
      renderer.dispose();
    };
  }, [file, isStl, rotateStl]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-all font-medium">{file.name}</p>
        <div className="flex flex-wrap gap-2">
          {isStl && status === "ready" && (
            <CalciteButton appearance="outline" scale="s" onClick={() => setZUp(!zUp)}>
              {zUp ? "Use Y-up" : "Use Z-up"}
            </CalciteButton>
          )}
          <CalciteButton appearance="outline" scale="s" disabled={status !== "ready"} onClick={() => reset.current?.()}>
            Reset view
          </CalciteButton>
        </div>
      </div>
      <div
        className="relative h-[clamp(15rem,50vh,32rem)] overflow-hidden rounded bg-slate-900"
      >
        <div
          ref={host}
          className="h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-300"
          role="application"
          aria-label="Interactive 3D model"
          aria-describedby={helpId}
          aria-hidden={status !== "ready"}
          tabIndex={status === "ready" ? 0 : -1}
        >
          <canvas ref={canvas} className="block h-full w-full" />
        </div>
        {status !== "ready" && (
          <div className="absolute inset-0 grid place-items-center bg-slate-900 px-4 text-center text-white" role="status">
            {status === "loading" && <CalciteLoader className="calcite-mode-dark" label="Loading model" />}
            {status === "invalid" && "Could not read this model. Choose a self-contained GLB or a valid STL file."}
            {status === "unavailable" && "The 3D viewer needs WebGL 2 in this browser."}
          </div>
        )}
      </div>
      <p id={helpId} className="text-xs text-[var(--calcite-color-text-2)]">
        Drag to rotate, right-drag to pan, and scroll or pinch to zoom.
        Use arrow keys to pan, Shift + arrows to rotate, and + or − to zoom.
      </p>
    </div>
  );
}
