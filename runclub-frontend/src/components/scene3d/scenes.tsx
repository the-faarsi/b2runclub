import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { useCalmMotion } from "../../lib/motion";

/**
 * Every 3D scene in the app lives in this one module, so three.js is downloaded
 * exactly once and shared across routes rather than duplicated per page.
 *
 * All geometry is procedural — there are no model files — and every scene is
 * deliberately low-poly: these are ambient backdrops, not the subject, and one
 * runs on nearly every page.
 */

/* Brand palette, mirrored from index.css. */
const GOLD = "#e9b949";
const GOLD_DEEP = "#c89a2c";
const GOLD_DIM = "#7a5f1a";

export type SceneVariant =
  | "ribbon" // landing — the running route
  | "lattice" // events admin — floating date tiles
  | "towers" // dashboard — extruded bars
  | "orb" // about / profile — a slowly turning wireframe solid
  | "frames" // gallery — drifting photo planes
  | "knot" // 404 — an interlinked torus knot
  | "terrain" // calendar / event detail — elevation profile ridge
  | "helix" // leaderboard — twin climbing spirals
  | "constellation" // forum / members — a network of linked nodes
  | "pulse" // polls / race day — concentric start-line rings
  | "shards"; // tickets / collaborators — scattered angled planes

/* ── Shared rig ───────────────────────────────────────────── */

/** Eases the scene toward the pointer and drifts when idle. */
function ParallaxRig({
  children,
  calm,
  strength = 90,
}: {
  children: ReactNode;
  calm: boolean;
  strength?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  useFrame((state, delta) => {
    if (!group.current) return;
    const tx = calm ? 0 : (state.pointer.y * viewport.height) / strength - 0.12;
    const ty = calm ? 0 : (state.pointer.x * viewport.width) / strength;
    const idle = calm ? 0 : Math.sin(state.clock.elapsedTime * 0.15) * 0.08;

    const k = 1 - Math.pow(0.001, delta); // framerate-independent easing
    group.current.rotation.x += (tx - group.current.rotation.x) * k;
    group.current.rotation.y += (ty + idle - group.current.rotation.y) * k;
  });

  return <group ref={group}>{children}</group>;
}

/** Drifting motes, shared by every scene for depth. */
function Motes({ calm, count = 180 }: { calm: boolean; count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 7;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    if (calm || !ref.current) return;
    ref.current.rotation.y += delta * 0.018;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.12;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={GOLD}
        size={0.03}
        sizeAttenuation
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ── 1. Ribbon — the running route (landing) ───────────────── */

function useRouteCurve() {
  return useMemo(() => {
    const pts = [
      [-3.4, -0.5, 0.9],
      [-2.2, 0.35, -0.7],
      [-0.6, -0.25, -1.5],
      [0.9, 0.6, -0.5],
      [2.3, -0.1, 0.8],
      [3.3, 0.75, -0.2],
      [2.1, -0.7, -1.2],
      [0.2, 0.15, 1.4],
      [-1.7, -0.85, 1.2],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.6);
  }, []);
}

function Ribbon({ calm }: { calm: boolean }) {
  const curve = useRouteCurve();
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 380, 0.052, 12, true), [curve]);
  const total = geometry.index ? geometry.index.count : 0;
  const progress = useRef(0);

  const runner = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (calm) {
      geometry.setDrawRange(0, total);
    } else {
      progress.current = Math.min(1, progress.current + delta * 0.42);
      geometry.setDrawRange(0, Math.floor(total * progress.current));

      t.current = (t.current + delta * 0.075) % 1;
      const p = curve.getPointAt(t.current);
      runner.current?.position.copy(p);
      glow.current?.position.copy(p);
    }
  });

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={GOLD}
          emissive={GOLD_DEEP}
          emissiveIntensity={0.55}
          roughness={0.28}
          metalness={0.85}
        />
      </mesh>

      <mesh ref={runner}>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshStandardMaterial color="#fff6da" emissive={GOLD} emissiveIntensity={2.4} />
      </mesh>
      <mesh ref={glow}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshBasicMaterial
          color={GOLD}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <pointLight color={GOLD} intensity={5} distance={3.4} />

      <TrackRings calm={calm} />
    </group>
  );
}

function TrackRings({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!calm && group.current) group.current.rotation.z += delta * 0.045;
  });
  return (
    <group ref={group} rotation={[-Math.PI / 2.35, 0, 0]}>
      {[2.1, 2.9, 3.7, 4.5].map((r, i) => (
        <mesh key={r}>
          <torusGeometry args={[r, 0.006, 5, 110]} />
          <meshBasicMaterial
            color={GOLD_DIM}
            transparent
            opacity={0.5 - i * 0.09}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── 2. Lattice — floating tiles (events, calendar, tickets) ─ */

function Lattice({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);

  // A 5×4 grid of cards, each bobbing on its own phase.
  const tiles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        return {
          key: i,
          x: (col - 2) * 1.35,
          y: (row - 1.5) * 1.15,
          z: (Math.random() - 0.5) * 1.6,
          phase: Math.random() * Math.PI * 2,
          lit: Math.random() > 0.72, // a few glow, like booked days
        };
      }),
    [],
  );

  useFrame((state, delta) => {
    if (calm || !group.current) return;
    group.current.rotation.z += delta * 0.012;
    group.current.children.forEach((child, i) => {
      const tile = tiles[i];
      if (!tile) return;
      child.position.y = tile.y + Math.sin(state.clock.elapsedTime * 0.5 + tile.phase) * 0.14;
      child.rotation.z = Math.sin(state.clock.elapsedTime * 0.3 + tile.phase) * 0.08;
    });
  });

  return (
    <group ref={group} rotation={[0.34, -0.42, 0.1]}>
      {tiles.map((t) => (
        <mesh key={t.key} position={[t.x, t.y, t.z]}>
          <boxGeometry args={[0.9, 0.9, 0.055]} />
          {t.lit ? (
            <meshStandardMaterial
              color={GOLD}
              emissive={GOLD_DEEP}
              emissiveIntensity={0.7}
              metalness={0.8}
              roughness={0.3}
            />
          ) : (
            <meshStandardMaterial
              color="#1d2027"
              emissive={GOLD_DIM}
              emissiveIntensity={0.06}
              metalness={0.5}
              roughness={0.62}
            />
          )}
        </mesh>
      ))}
    </group>
  );
}

/* ── 3. Towers — extruded bars (leaderboard, polls, admin) ─── */

function Towers({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);

  const bars = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        key: i,
        x: (i - 4) * 0.72,
        target: 0.7 + Math.abs(Math.sin(i * 1.7)) * 2.6,
        phase: i * 0.5,
      })),
    [],
  );

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const bar = bars[i];
      if (!bar) return;
      // Grow in, then breathe very slightly.
      const breathe = calm ? 0 : Math.sin(state.clock.elapsedTime * 0.6 + bar.phase) * 0.07;
      const h = bar.target + breathe;
      const eased = calm ? h : THREE.MathUtils.lerp(child.scale.y, h, 1 - Math.pow(0.004, delta));
      child.scale.y = eased;
      child.position.y = eased / 2 - 1.4;
    });
    if (!calm) group.current.rotation.y += delta * 0.055;
  });

  return (
    <group ref={group} rotation={[0.16, -0.3, 0]}>
      {bars.map((b, i) => (
        <mesh key={b.key} position={[b.x, 0, 0]} scale={[1, 0.001, 1]}>
          <boxGeometry args={[0.4, 1, 0.4]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? GOLD : "#26282f"}
            emissive={i % 3 === 0 ? GOLD_DEEP : GOLD_DIM}
            emissiveIntensity={i % 3 === 0 ? 0.55 : 0.1}
            metalness={0.82}
            roughness={0.32}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── 4. Orb — wireframe solid (about, profile) ─────────────── */

function Orb({ calm }: { calm: boolean }) {
  const solid = useRef<THREE.Mesh>(null);
  const wire = useRef<THREE.LineSegments>(null);

  const wireGeo = useMemo(
    () => new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.35, 1)),
    [],
  );

  useFrame((state, delta) => {
    if (calm) return;
    if (solid.current) {
      solid.current.rotation.y += delta * 0.11;
      solid.current.rotation.x += delta * 0.045;
    }
    if (wire.current) {
      wire.current.rotation.y -= delta * 0.07;
      wire.current.rotation.z += delta * 0.03;
      const s = 1 + Math.sin(state.clock.elapsedTime * 0.4) * 0.02;
      wire.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      <mesh ref={solid}>
        <icosahedronGeometry args={[1.55, 0]} />
        <meshStandardMaterial
          color={GOLD}
          emissive={GOLD_DEEP}
          emissiveIntensity={0.4}
          metalness={0.9}
          roughness={0.24}
          flatShading
        />
      </mesh>
      <lineSegments ref={wire} geometry={wireGeo}>
        <lineBasicMaterial color={GOLD} transparent opacity={0.26} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

/* ── 5. Frames — drifting planes (gallery) ─────────────────── */

function Frames({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);

  const frames = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        return {
          key: i,
          radius: 2.7,
          angle,
          y: (Math.random() - 0.5) * 1.9,
          w: 0.95 + Math.random() * 0.5,
          h: 0.7 + Math.random() * 0.45,
          phase: Math.random() * Math.PI * 2,
        };
      }),
    [],
  );

  useFrame((state, delta) => {
    if (calm || !group.current) return;
    group.current.rotation.y += delta * 0.085;
    group.current.children.forEach((child, i) => {
      const f = frames[i];
      if (!f) return;
      child.position.y = f.y + Math.sin(state.clock.elapsedTime * 0.45 + f.phase) * 0.16;
    });
  });

  return (
    <group ref={group} rotation={[0.2, 0, 0.04]}>
      {frames.map((f) => (
        <group
          key={f.key}
          position={[Math.cos(f.angle) * f.radius, f.y, Math.sin(f.angle) * f.radius]}
          rotation={[0, -f.angle + Math.PI / 2, 0]}
        >
          {/* Plate */}
          <mesh>
            <boxGeometry args={[f.w, f.h, 0.03]} />
            <meshStandardMaterial
              color="#1b1e24"
              emissive={GOLD_DIM}
              emissiveIntensity={0.1}
              metalness={0.6}
              roughness={0.5}
            />
          </mesh>
          {/* Gold edge */}
          <mesh>
            <boxGeometry args={[f.w + 0.045, f.h + 0.045, 0.018]} />
            <meshBasicMaterial color={GOLD} transparent opacity={0.28} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── 6. Knot — interlinked torus knot (forum) ──────────────── */

function Knot({ calm }: { calm: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (calm || !mesh.current) return;
    mesh.current.rotation.x += delta * 0.13;
    mesh.current.rotation.y += delta * 0.09;
    mesh.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.03);
  });

  return (
    <mesh ref={mesh}>
      <torusKnotGeometry args={[1.5, 0.2, 128, 14, 2, 3]} />
      <meshStandardMaterial
        color={GOLD}
        emissive={GOLD_DEEP}
        emissiveIntensity={0.45}
        metalness={0.92}
        roughness={0.22}
      />
    </mesh>
  );
}

/* ── 7. Runner — animated GLB figure ("who it's for") ──────
 * The one variant here that loads real assets instead of procedural
 * geometry, so it's the one scene that pays a network cost beyond the
 * shared three.js chunk. `useLoader` suspends, which is why it's safe to
 * call directly — PageScene already wraps <Scene> in a <Suspense> that
 * shows the flat fallback while the files download.
 *
 * Carousel notes:
 *  - All four GLBs are requested together via useLoader's array form, so
 *    the component only suspends once — swapping between them afterwards
 *    is instant, not a re-fetch/re-suspend per model.
 *  - A plain setInterval advances the active index every ROTATE_MS. This
 *    is a hard cut, not a crossfade — simplest thing that satisfies "cycle
 *    through the four models automatically."
 *  - Each model gets its own recentre/rescale (source units/pivots differ
 *    per file) and its own AnimationMixer, torn down when the index
 *    changes so a previous model's clips don't keep ticking in the
 *    background.
 *
 * Animation notes:
 *  - We play ALL clips in the active GLB so the figure animates regardless
 *    of which clip index or name the authoring tool chose.
 *  - mixer.update(delta) runs even when `calm` is true — reduced motion
 *    only suppresses the slow rotation, not the skeletal animation itself,
 *    because a motionless figure in the bind pose looks broken rather than
 *    calm. The canvas frameloop stays "always" for the runner variant so
 *    the mixer actually ticks every frame.
 *  - The group is NOT inside ParallaxRig (see dispatcher below) — parallax
 *    pointer tracking fights the slow y-rotation and makes the figure
 *    appear to jitter. Runner gets its own gentle idle sway instead.
 */

const RUNNER_MODEL_URLS = [
  "/models/runner.glb",
  "/models/cycling.glb",
  "/models/swimming.glb",
  "/models/trekking.glb",
];
/** How long each model stays on screen before the carousel advances. */
const RUNNER_ROTATE_MS = 1500;
/** Target size (largest dimension) in scene units, so each model reads at a
 *  consistent scale regardless of whether it's authored upright (runner,
 *  cyclist, trekker) or lying flat (swimmer) — scaling by height alone
 *  would over-scale a horizontal pose whose vertical extent is small. */
const RUNNER_TARGET_HEIGHT = 3.2;

function Runner({ calm }: { calm: boolean }) {
  const gltfs = useLoader(GLTFLoader, RUNNER_MODEL_URLS);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const group = useRef<THREE.Group>(null);
  const [active, setActive] = useState(0);

  // Advance the carousel on a timer. Paused while `calm` (reduced motion)
  // so the figure doesn't keep changing under someone who asked for less
  // motion — it just holds on the first model.
  useEffect(() => {
    if (calm || gltfs.length <= 1) return;
    const id = setInterval(() => {
      setActive((i) => (i + 1) % gltfs.length);
    }, RUNNER_ROTATE_MS);
    return () => clearInterval(id);
  }, [calm, gltfs.length]);

  const gltf = gltfs[active];

  // Recentre on the origin and normalise scale on load — the source file's
  // own units/pivot are unknown ahead of time, so this is computed rather
  // than hard-coded. Recomputed per active model since each GLB was
  // authored independently.
  const scene = useMemo(() => {
    // Regular Object3D.clone(true) does NOT re-link SkinnedMesh -> Skeleton
    // bone bindings, so a rigged/animated model would render in its bind
    // pose forever even though the mixer is updating. SkeletonUtils.clone
    // rebuilds the skeleton correctly on the cloned hierarchy.
    const cloned = SkeletonUtils.clone(gltf.scene);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const scale = RUNNER_TARGET_HEIGHT / (Math.max(size.x, size.y, size.z) || 1);
    cloned.scale.setScalar(scale);

    // `position` is applied in the parent's space, outside this object's own
    // `scale` — so the offset has to be pre-multiplied by `scale` here rather
    // than added afterwards. This is what actually plants every model's
    // feet (box.min.y) on the same ground line regardless of the size or
    // pivot each GLB was authored with; mixing scaled/unscaled offsets is
    // what previously made each model land at a different height.
    cloned.position.x = -center.x * scale;
    cloned.position.z = -center.z * scale;
    cloned.position.y = -box.min.y * scale - RUNNER_TARGET_HEIGHT / 2;
    if (gltf === gltfs[2]) cloned.position.y += 1.8; // swimming.glb is index 2 in RUNNER_MODEL_URLS
    return cloned;
  }, [gltf]);

  useEffect(() => {
    // Guard: nothing to do if the active GLB has no animation tracks at all.
    if (gltf.animations.length === 0) return;

    const mixer = new THREE.AnimationMixer(scene);

    // Play every clip in the file — avoids the silent failure when the
    // relevant animation isn't at index 0 or has an unexpected name.
    gltf.animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    });

    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      mixerRef.current = null;
    };
  }, [gltf, scene]);

  useFrame((state, delta) => {
    // Always tick the mixer — skeletal animation runs regardless of calm.
    // Clamp delta so a tab that was backgrounded doesn't jump the pose.
    mixerRef.current?.update(Math.min(delta, 0.05));

    if (!group.current) return;

    if (calm) {
      // Reduced motion: face forward, gentle idle breath only.
      group.current.rotation.y = 0;
    } else {
      // Slow continuous y-rotation so all sides of the figure are seen.
      group.current.rotation.y += delta * 0.12;
      // Subtle idle sway on x so the figure feels alive even when the
      // animation clip is very short.
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.4) * 0.03;
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} />
      {/* Key fill from the front so the figure is never silhouetted */}
      <pointLight color={GOLD} intensity={2.8} distance={6} position={[0, 2.5, 3]} />
      {/* Rim light from behind for depth separation */}
      <pointLight color={GOLD_DEEP} intensity={1.4} distance={5} position={[-1.5, 1.5, -2.5]} />
    </group>
  );
}

/* ── Dispatcher ───────────────────────────────────────────── */

/* ── 7. Terrain — an elevation ridge (calendar, event detail) ── */

function Terrain({ calm }: { calm: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);

  /**
   * A plane displaced by layered sine waves, drawn as wireframe so it reads as a
   * route profile rather than solid ground. The displacement is baked once —
   * animating vertices every frame would cost far more than this earns.
   */
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(13, 7, 46, 22);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h =
        Math.sin(x * 0.55) * 0.62 +
        Math.sin(x * 1.3 + y * 0.7) * 0.28 +
        Math.cos(y * 0.9) * 0.22;
      pos.setZ(i, h);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    if (calm) return;
    if (mesh.current) mesh.current.rotation.z += delta * 0.02;
    // A marker running the ridge, like a position along a route.
    if (glow.current) {
      const t = (state.clock.elapsedTime * 0.34) % (Math.PI * 2);
      const x = Math.sin(t) * 5.2;
      glow.current.position.set(x, Math.cos(t * 0.6) * 1.4, Math.sin(x * 0.55) * 0.62 + 0.3);
    }
  });

  return (
    <group rotation={[-1.02, 0, 0.34]}>
      <mesh ref={mesh} geometry={geometry}>
        <meshBasicMaterial color={GOLD_DEEP} wireframe transparent opacity={0.42} />
      </mesh>
      <mesh ref={glow}>
        <sphereGeometry args={[0.13, 14, 14]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={2.4} />
      </mesh>
    </group>
  );
}

/* ── 8. Helix — twin climbing spirals (leaderboard) ─────────── */

function Helix({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);

  // Two offset strands, so it reads as competition rather than one rising line.
  const nodes = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => {
        const strand = i % 2;
        const step = Math.floor(i / 2);
        const t = step * 0.46 + strand * Math.PI;
        return {
          key: i,
          x: Math.cos(t) * 1.85,
          y: step * 0.42 - 4.4,
          z: Math.sin(t) * 1.85,
          // The leading strand glows; the trailing one sits back.
          lit: strand === 0,
          size: strand === 0 ? 0.17 : 0.13,
        };
      }),
    [],
  );

  useFrame((_, delta) => {
    if (calm || !group.current) return;
    group.current.rotation.y += delta * 0.22;
  });

  return (
    <group ref={group} rotation={[0.12, 0, 0.16]}>
      {nodes.map((n) => (
        <mesh key={n.key} position={[n.x, n.y, n.z]}>
          <boxGeometry args={[n.size, n.size, n.size]} />
          <meshStandardMaterial
            color={n.lit ? GOLD : "#242832"}
            emissive={n.lit ? GOLD_DEEP : GOLD_DIM}
            emissiveIntensity={n.lit ? 1.1 : 0.1}
            metalness={0.75}
            roughness={0.32}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── 9. Constellation — a linked network (forum, members) ───── */

function Constellation({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);

  const { points, lines } = useMemo(() => {
    const pts = Array.from({ length: 26 }, () => ({
      x: (Math.random() - 0.5) * 9,
      y: (Math.random() - 0.5) * 6,
      z: (Math.random() - 0.5) * 4,
      phase: Math.random() * Math.PI * 2,
    }));

    // Join near neighbours only, which is what makes it read as a network
    // instead of a cloud. Capped so the line count stays small.
    const segs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z);
        if (d < 2.6) segs.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    return { points: pts, lines: geo };
  }, []);

  useEffect(() => () => lines.dispose(), [lines]);

  useFrame((state, delta) => {
    if (calm || !group.current) return;
    group.current.rotation.y += delta * 0.05;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.16) * 0.09;
  });

  return (
    <group ref={group}>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color={GOLD_DEEP} transparent opacity={0.3} />
      </lineSegments>
      {points.map((pt, i) => (
        <mesh key={i} position={[pt.x, pt.y, pt.z]}>
          <sphereGeometry args={[i % 5 === 0 ? 0.15 : 0.08, 12, 12]} />
          <meshStandardMaterial
            color={i % 5 === 0 ? GOLD : "#3a4150"}
            emissive={i % 5 === 0 ? GOLD_DEEP : GOLD_DIM}
            emissiveIntensity={i % 5 === 0 ? 1.6 : 0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── 10. Pulse — concentric start-line rings (polls, race day) ─ */

function Pulse({ calm }: { calm: boolean }) {
  const rings = useRef<THREE.Group>(null);
  const COUNT = 6;

  useFrame((state) => {
    if (calm || !rings.current) return;
    rings.current.children.forEach((child, i) => {
      // Each ring expands and fades on a staggered loop, like a countdown.
      const t = (state.clock.elapsedTime * 0.34 + i / COUNT) % 1;
      const scale = 0.4 + t * 3.4;
      child.scale.setScalar(scale);
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - t) * 0.5;
    });
  });

  return (
    <group rotation={[-1.16, 0, 0]}>
      <group ref={rings}>
        {Array.from({ length: COUNT }, (_, i) => (
          <mesh key={i}>
            <ringGeometry args={[1.32, 1.4, 72]} />
            <meshBasicMaterial color={GOLD} transparent opacity={0.4} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      {/* A still marker at the centre so the rings have an origin. */}
      <mesh>
        <circleGeometry args={[0.3, 32]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ── 11. Shards — scattered angled planes (tickets, partners) ── */

function Shards({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);

  const cards = useMemo(
    () =>
      Array.from({ length: 13 }, (_, i) => ({
        key: i,
        x: (Math.random() - 0.5) * 8.5,
        y: (Math.random() - 0.5) * 5.5,
        z: (Math.random() - 0.5) * 3.2,
        rx: (Math.random() - 0.5) * 0.9,
        ry: (Math.random() - 0.5) * 1.2,
        rz: (Math.random() - 0.5) * 0.6,
        spin: (Math.random() - 0.5) * 0.16,
        lit: i % 4 === 0,
      })),
    [],
  );

  useFrame((state, delta) => {
    if (calm || !group.current) return;
    group.current.rotation.y += delta * 0.04;
    group.current.children.forEach((child, i) => {
      const c = cards[i];
      if (!c) return;
      child.rotation.z = c.rz + Math.sin(state.clock.elapsedTime * 0.4 + i) * 0.12;
      child.position.y = c.y + Math.sin(state.clock.elapsedTime * 0.35 + i) * 0.16;
    });
  });

  return (
    <group ref={group} rotation={[0.16, -0.3, 0]}>
      {cards.map((c) => (
        <mesh key={c.key} position={[c.x, c.y, c.z]} rotation={[c.rx, c.ry, c.rz]}>
          {/* Ticket-shaped: wider than tall. */}
          <planeGeometry args={[1.5, 0.78]} />
          <meshStandardMaterial
            color={c.lit ? GOLD : "#20242c"}
            emissive={c.lit ? GOLD_DEEP : GOLD_DIM}
            emissiveIntensity={c.lit ? 0.85 : 0.08}
            metalness={0.6}
            roughness={0.4}
            transparent
            opacity={c.lit ? 0.9 : 0.66}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}


const CAMERA: Record<SceneVariant, [number, number, number]> = {
  ribbon: [0, 0.8, 8.2],
  lattice: [0, 0, 7.6],
  towers: [0, 0.4, 7.2],
  orb: [0, 0, 6.4],
  frames: [0, 0.5, 6.8],
  knot: [0, 0, 6.2],
  terrain: [0, 0.2, 8.6],
  helix: [0, 0, 8.4],
  constellation: [0, 0, 8.0],
  pulse: [0, 0.6, 7.4],
  shards: [0, 0, 7.8],
};

function Contents({ variant, calm }: { variant: SceneVariant; calm: boolean }) {
  switch (variant) {
    case "lattice":
      return <Lattice calm={calm} />;
    case "towers":
      return <Towers calm={calm} />;
    case "orb":
      return <Orb calm={calm} />;
    case "frames":
      return <Frames calm={calm} />;
    case "knot":
      return <Knot calm={calm} />;
          case "terrain":
      return <Terrain calm={calm} />;
    case "helix":
      return <Helix calm={calm} />;
    case "constellation":
      return <Constellation calm={calm} />;
    case "pulse":
      return <Pulse calm={calm} />;
    case "shards":
      return <Shards calm={calm} />;
    case "ribbon":
    default:
      return <Ribbon calm={calm} />;
  }
}

export default function Scene({ variant = "ribbon" }: { variant?: SceneVariant }) {
  const calm = useCalmMotion();
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden,
  );

  // Stop rendering entirely while the tab is in the background.
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Runner must always tick so the AnimationMixer updates every frame.
  // For every other variant, pause when calm or backgrounded to save GPU.
  const isRunner = variant === "runner";
  const frameloop = isRunner
    ? visible ? "always" : "demand"
    : calm || !visible ? "demand" : "always";

  return (
    <Canvas
      frameloop={calm || !visible ? "demand" : "always"}
      dpr={[1, 1.6]}
      camera={{ position: CAMERA[variant], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
      onCreated={({ gl, invalidate }) => {
        // Browsers cap concurrent WebGL contexts, and navigating quickly between
        // pages churns them — Chrome will drop one under load. Calling
        // preventDefault() on the loss event is what permits a restore; without
        // it the canvas stays blank for good.
        const canvas = gl.domElement;
        const onLost = (e: Event) => {
          e.preventDefault();
        };
        const onRestored = () => invalidate();
        canvas.addEventListener("webglcontextlost", onLost, false);
        canvas.addEventListener("webglcontextrestored", onRestored, false);
      }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} color="#fff2cf" />
      <directionalLight position={[-5, -2, -4]} intensity={0.5} color={GOLD_DEEP} />

      {isRunner ? (
        // Runner bypasses ParallaxRig — pointer parallax fights the figure's
        // own y-rotation and causes visible jitter. The Runner component
        // handles its own gentle idle motion internally.
        <>
          <Contents variant={variant} calm={calm} />
          <Motes calm={calm} count={70} />
        </>
      ) : (
        <ParallaxRig calm={calm}>
          <Contents variant={variant} calm={calm} />
          <Motes calm={calm} count={variant === "ribbon" ? 240 : 140} />
        </ParallaxRig>
      )}
    </Canvas>
  );
}