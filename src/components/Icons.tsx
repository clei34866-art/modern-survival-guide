interface IconProps {
  size?: number;
  class?: string;
}

const baseProps = (size: number, cls?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.75,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
  'aria-hidden': 'true' as const,
  class: cls ? `ui-icon ${cls}` : 'ui-icon',
});

export function IconSun({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M3 12h2M19 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconBranches({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M6 8.5v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2M12 13.5v2" />
    </svg>
  );
}

export function IconCards({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <rect x="4" y="6" width="14" height="12" rx="2.5" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h9A1.5 1.5 0 0 1 20 4.5v9a1.5 1.5 0 0 1-1.5 1.5H18" />
      <path d="M8 11h6M8 14h4" />
    </svg>
  );
}

export function IconBriefcase({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
    </svg>
  );
}

export function IconFlask({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M9 3h6M10 3v6l-5.2 8.7A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.3L14 9V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

export function IconMonitor({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export function IconSprout({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M12 21V10" />
      <path d="M12 13c-4.5 0-7-2.6-7-6.5 4.2 0 7 2.2 7 6.5Z" />
      <path d="M12 10.5c4.2 0 6.5-2.3 6.5-6-3.8 0-6.5 2-6.5 6Z" />
    </svg>
  );
}

export function IconCheck({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

export function IconLock({ size = 15, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

export function IconArrowLeft({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function IconArrowRight({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconExternal({ size = 14, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M14 4h6v6M20 4 10 14M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

export function IconPlay({ size = 15, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <polygon points="7 5 19 12 7 19 7 5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPause({ size = 15, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconReplay({ size = 15, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7" />
      <path d="M4 4v4.7h4.7" />
    </svg>
  );
}

export function IconChevron({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconFlip({ size = 15, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M17 3l4 4-4 4" />
      <path d="M3 11V9a2 2 0 0 1 2-2h16" />
      <path d="M7 21l-4-4 4-4" />
      <path d="M21 13v2a2 2 0 0 1-2 2H3" />
    </svg>
  );
}

export function IconShield({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="M12 8v4M12 15.5h.01" />
    </svg>
  );
}

export function IconMenu({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconClose({ size = 18, class: cls }: IconProps) {
  return (
    <svg {...baseProps(size, cls)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
