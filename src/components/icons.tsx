// Stroke icons (24px grid, currentColor) used across the app.

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

export const LockIcon = (p: IconProps) => (
  <Icon {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>
);
export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18" /></Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></Icon>
);
/** The "points" coin: a ring with a filled centre. */
export const CoinIcon = ({ size = 14, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden {...p}>
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="3.5" fill="currentColor" />
  </svg>
);
export const ArrowRightIcon = (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const ArrowLeftIcon = (p: IconProps) => <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
export const ArrowUpRightIcon = (p: IconProps) => <Icon {...p}><path d="M7 17 17 7M8 7h9v9" /></Icon>;
export const ChevronRightIcon = (p: IconProps) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>;
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="M5 12.5 10 17.5 19 7" /></Icon>;
export const CheckCheckIcon = (p: IconProps) => <Icon {...p}><path d="M2 12.5 7 17.5 16 7M13 16l1.5 1.5L23 7" /></Icon>;
export const TrendingUpIcon = (p: IconProps) => <Icon {...p}><path d="m3 17 6-6 4 4 8-8M15 7h6v6" /></Icon>;
export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.5 11.8 8.2 16.5 10 11.8 11.8 10 16.5 8.2 11.8 3.5 10 8.2 8.2Z" />
    <circle cx="18.5" cy="5" r="1.5" />
  </Icon>
);
export const FlameIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 22c4 0 7-2.7 7-6.8 0-4.4-3.6-6.8-4.5-11.2-2.4 1.6-3.6 3.9-3.6 6.2-1-1-1.6-2-1.8-3.2C6.5 9.3 5 12 5 15.2 5 19.3 8 22 12 22Z" /></Icon>
);
export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3 5 6v5.5c0 4.2 2.9 7.9 7 9.5 4.1-1.6 7-5.3 7-9.5V6Z" /><path d="m9 12 2 2 4-4" /></Icon>
);
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;

// Bottom navigation
export const HomeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1Z" /></Icon>
);
export const CompassIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></Icon>
);
export const PlusCircleIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></Icon>;
export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15.5 14.2c3 .2 5.5 2.6 5.5 5.8" />
  </Icon>
);
export const UserIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></Icon>;
