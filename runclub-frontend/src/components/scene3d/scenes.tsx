import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
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
  | "lattice" // events / calendar / tickets — floating date tiles
  | "towers" // leaderboard / polls / dashboard — extruded bars
  | "orb" // about / profile — a slowly turning wireframe solid
  | "frames" // gallery — drifting photo planes
  | "knot"; // forum / misc — an interlinked torus knot

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

/* ── Dispatcher ───────────────────────────────────────────── */

const CAMERA: Record<SceneVariant, [number, number, number]> = {
  ribbon: [0, 0.8, 8.2],
  lattice: [0, 0, 7.6],
  towers: [0, 0.4, 7.2],
  orb: [0, 0, 6.4],
  frames: [0, 0.5, 6.8],
  knot: [0, 0, 6.2],
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

      <ParallaxRig calm={calm}>
        <Contents variant={variant} calm={calm} />
        <Motes calm={calm} count={variant === "ribbon" ? 240 : 140} />
      </ParallaxRig>
    </Canvas>
  );
}
