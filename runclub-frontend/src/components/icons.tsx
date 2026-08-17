/**
 * Line icons drawn on a 24px grid at 1.7 stroke, so they sit at the same
 * optical weight as the rest of the UI. All inherit currentColor.
 */

type IconProps = { className?: string };

const S = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-4"} aria-hidden {...S}>
      {children}
    </svg>
  );
}

/* ── Disciplines ──────────────────────────────────────────── */

export function RunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="14.5" cy="4.5" r="1.8" />
      <path d="M12.4 8.2 9 10.6l1.6 3.2-1.2 2.9M12.4 8.2l3.1 1.1 1.2 3.4M10.6 13.8l3.4.9 1.3 4.6M6.2 12.1l2.8-1.5M4.8 20l2.6-3.3" />
    </Svg>
  );
}

export function CycleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5.5" cy="17" r="3.2" />
      <circle cx="18.5" cy="17" r="3.2" />
      <path d="m8.4 16 3.4-6.6 3 6.4M9.3 9.4h4.4M14.6 5.6h2.1l1.6 3.6-2.9 4" />
    </Svg>
  );
}

export function SwimIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="16.6" cy="7.4" r="1.7" />
      <path d="m3 12.3 2.6-1.6 3 1.8 3.1-1.9 2.8 1.7M4.6 8.1l3.9-2.2 4 2.3" />
      <path d="M3 17.4c1.8-1.3 3.4-1.3 5.2 0s3.4 1.3 5.2 0 3.4-1.3 5.2 0" />
    </Svg>
  );
}

export function RaceIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 21V4M6 4h11l-1.6 3.6L17 11H6" />
      <path d="M6 7.5h11M10.2 4v7" />
    </Svg>
  );
}

export function TrainingIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
    </Svg>
  );
}

export function SocialIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8.5" r="2.8" />
      <path d="M3.5 19.5c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
      <path d="M16.2 6.2a2.8 2.8 0 0 1 0 5.3M18 14.6c1.7.7 2.9 2.4 2.9 4.4" />
    </Svg>
  );
}

export function PartyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 20.5 9 8l7 7-12.5 5.5Z" />
      <path d="M13 7.5c.6-1.5 2-2.2 3.4-1.7M17 3.2v1.6M20.4 6.4l-1.4.7M20.8 11.4l-1.5-.4M15.5 11l1.8 1.8" />
    </Svg>
  );
}

const DISCIPLINE_ICONS: Record<string, (p: IconProps) => JSX.Element> = {
  run: RunIcon,
  cycle: CycleIcon,
  swim: SwimIcon,
  race: RaceIcon,
  training: TrainingIcon,
  social: SocialIcon,
  party: PartyIcon,
};

/** Falls back to the run icon for an unrecognised discipline. */
export function DisciplineIcon({ type, className }: { type: string; className?: string }) {
  const Icon = DISCIPLINE_ICONS[type.toLowerCase()] ?? RunIcon;
  return <Icon className={className} />;
}

/* ── UI ───────────────────────────────────────────────────── */

export function PinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </Svg>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l3 1.8" />
    </Svg>
  );
}

export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.4" />
      <path d="M3.4 10h17.2M8.4 3.4v3.4M15.6 3.4v3.4" />
    </Svg>
  );
}

export function TicketIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.4 9.2V7a1.6 1.6 0 0 1 1.6-1.6h14a1.6 1.6 0 0 1 1.6 1.6v2.2a2.8 2.8 0 0 0 0 5.6V17a1.6 1.6 0 0 1-1.6 1.6H5A1.6 1.6 0 0 1 3.4 17v-2.2a2.8 2.8 0 0 0 0-5.6Z" />
      <path d="M12 8.6v6.8" strokeDasharray="1.6 2" />
    </Svg>
  );
}

export function ShareIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 15.5V3.8M12 3.8 8.2 7.6M12 3.8l3.8 3.8" />
      <path d="M4.5 13.6V19a1.4 1.4 0 0 0 1.4 1.4h12.2a1.4 1.4 0 0 0 1.4-1.4v-5.4" />
    </Svg>
  );
}

export function DownloadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.8v11.7M12 15.5 8.2 11.7M12 15.5l3.8-3.8" />
      <path d="M4.5 13.6V19a1.4 1.4 0 0 0 1.4 1.4h12.2a1.4 1.4 0 0 0 1.4-1.4v-5.4" />
    </Svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function ChartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20h16M7.5 20v-6M12 20V7.5M16.5 20v-9" />
    </Svg>
  );
}

export function UsersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9.2" cy="8.4" r="3" />
      <path d="M3.4 19.4c0-3.2 2.6-5.4 5.8-5.4s5.8 2.2 5.8 5.4" />
      <path d="M16.8 5.8a3 3 0 0 1 0 5.6M18.6 14.4c1.8.8 3 2.6 3 4.6" />
    </Svg>
  );
}

export function SparkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9 12 3.4Z" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" strokeWidth="2" />
    </Svg>
  );
}

export function LockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4.4" y="10.6" width="15.2" height="9.4" rx="2.2" />
      <path d="M8.2 10.6V7.8a3.8 3.8 0 0 1 7.6 0v2.8" />
    </Svg>
  );
}

/* ── Medals for the top three ─────────────────────────────── */

export function Medal({ place, className }: { place: 1 | 2 | 3; className?: string }) {
  // Gold, silver, bronze — the one place a non-brand hue is justified.
  const tone =
    place === 1
      ? { ring: "#e9b949", ink: "#3d2c00" }
      : place === 2
        ? { ring: "#c2c8d0", ink: "#2b2f34" }
        : { ring: "#c98b5e", ink: "#3a2113" };

  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-6"} aria-hidden>
      <circle cx="12" cy="12" r="8.6" fill={tone.ring} />
      <circle cx="12" cy="12" r="6.4" fill="none" stroke={tone.ink} strokeOpacity="0.22" strokeWidth="1.2" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="800"
        fill={tone.ink}
        fontFamily="inherit"
      >
        {place}
      </text>
    </svg>
  );
}

/* ── Empty-state illustration ─────────────────────────────── */

/**
 * Hero route graphic: a GPS-trace-like path that draws itself in, with distance
 * markers along the way. Decorative only.
 */
export function RouteGraphic({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 420 340"
      className={className ?? "h-full w-full"}
      aria-hidden
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* faint contour rings */}
      {[130, 96, 62].map((r, i) => (
        <circle
          key={r}
          cx="232"
          cy="168"
          r={r}
          stroke="currentColor"
          strokeOpacity={0.05 + i * 0.02}
          strokeWidth="1"
        />
      ))}

      {/* the route */}
      <path
        d="M46 288C46 288 74 214 118 206c44-8 58 44 104 30s52-84 96-84c30 0 44 22 52 44"
        stroke="var(--color-gold)"
        strokeOpacity="0.18"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        className="draw-path"
        pathLength={1}
        d="M46 288C46 288 74 214 118 206c44-8 58 44 104 30s52-84 96-84c30 0 44 22 52 44"
        stroke="var(--color-gold)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* start / split / finish markers */}
      <circle cx="46" cy="288" r="5.5" fill="var(--color-gold)" />
      <circle cx="222" cy="236" r="3.5" fill="var(--color-gold)" fillOpacity="0.55" />
      <circle cx="318" cy="152" r="3.5" fill="var(--color-gold)" fillOpacity="0.55" />
      <circle cx="370" cy="196" r="7" fill="var(--color-gold)" />
      <circle cx="370" cy="196" r="13" stroke="var(--color-gold)" strokeOpacity="0.3" strokeWidth="1.5" />
    </svg>
  );
}

/** A stylised running track, used behind empty states. */
export function TrackGraphic({ className }: IconProps) {
  return (
    <svg viewBox="0 0 120 72" className={className ?? "h-16 w-28"} aria-hidden fill="none">
      <ellipse cx="60" cy="36" rx="52" ry="27" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.4" />
      <ellipse cx="60" cy="36" rx="40" ry="19" stroke="currentColor" strokeOpacity="0.24" strokeWidth="1.4" />
      <ellipse cx="60" cy="36" rx="28" ry="11" stroke="currentColor" strokeOpacity="0.34" strokeWidth="1.4" />
      <path
        d="M60 9c22 0 40 12 40 27"
        stroke="var(--color-gold)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="100" cy="36" r="3.2" fill="var(--color-gold)" />
    </svg>
  );
}
