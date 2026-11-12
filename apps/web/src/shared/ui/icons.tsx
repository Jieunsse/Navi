import type { ReactNode, SVGProps } from "react";

/** Lucide 아이콘(선 두께 2). 색은 글자색(currentColor)을 따른다. 크기 기본 20. */
function Icon({ size = 20, children, ...p }: { size?: number; children: ReactNode } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      {children}
    </svg>
  );
}
type P = { size?: number; className?: string };

export const MenuIcon = (p: P) => <Icon {...p}><path d="M4 12h16M4 6h16M4 18h16" /></Icon>;
export const SunIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Icon>
);
export const MoonIcon = (p: P) => <Icon {...p}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></Icon>;
export const BellIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.674C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </Icon>
);
export const VideoIcon = (p: P) => (
  <Icon {...p}>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </Icon>
);
export const RadioIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19" />
    <circle cx="12" cy="12" r="2" />
  </Icon>
);
export const EyeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const EyeOffIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143M2 2l20 20" />
  </Icon>
);
export const UserIcon = (p: P) => (
  <Icon {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);
export const HistoryIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2" />
  </Icon>
);
export const LogOutIcon = (p: P) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" /></Icon>;
export const AwardIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="6" />
    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
  </Icon>
);
export const GiftIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
  </Icon>
);
export const FlagIcon = (p: P) => <Icon {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" /></Icon>;
export const BanIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m4.9 4.9 14.2 14.2" />
  </Icon>
);
export const LayoutGridIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </Icon>
);
export const HelpIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
  </Icon>
);
export const CheckIcon = (p: P) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>;

/** Google 로고. 브랜드 규정상 색을 바꾸지 않는다. */
export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M18.8 10.208c0-.65-.058-1.275-.167-1.875H10v3.55h4.933a4.2 4.2 0 0 1-1.841 2.759v2.308h2.975c1.733-1.6 2.733-3.95 2.733-6.742Z" fill="#4285F4" />
      <path d="M10 19.167c2.475 0 4.55-.817 6.067-2.217l-2.975-2.308c-.817.55-1.859.883-3.092.883-2.383 0-4.408-1.608-5.133-3.775H1.817v2.367C3.325 17.108 6.417 19.167 10 19.167Z" fill="#34A853" />
      <path d="M4.867 11.742A5.5 5.5 0 0 1 4.575 10c0-.608.108-1.192.292-1.742V5.892H1.817A9.17 9.17 0 0 0 .833 10c0 1.483.358 2.875.984 4.108l3.05-2.366Z" fill="#FBBC05" />
      <path d="M10 4.483c1.35 0 2.55.467 3.508 1.367l2.625-2.625C14.542 1.742 12.475.833 10 .833c-3.583 0-6.675 2.058-8.183 5.059l3.05 2.366C5.592 6.092 7.617 4.483 10 4.483Z" fill="#EA4335" />
    </svg>
  );
}

/** 꿀 아이콘. 시안의 Icon/honey는 색이 고정된 그림이라 이모지로 대신한다. */
export const HoneyIcon = ({ size = 20 }: { size?: number }) => (
  <span aria-hidden style={{ fontSize: size * 0.9, lineHeight: 1 }}>
    🍯
  </span>
);
export const WalletIcon = (p: P) => (
  <Icon {...p}>
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </Icon>
);
export const ScaleIcon = (p: P) => (
  <Icon {...p}>
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
  </Icon>
);

export const ScreenShareIcon = (p: P) => (
  <Icon {...p}>
    <path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3M8 21h8M12 17v4m5-9 5-5m-5-1h5v5" />
  </Icon>
);

// 운영자 메뉴·표에 쓰는 아이콘(Lucide).
export const CreditCardIcon = (p: P) => <Icon {...p}><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></Icon>;
export const CalendarClockIcon = (p: P) => (
  <Icon {...p}>
    <path d="M16 14v2.2l1.6 1M16 2v4M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M3 10h5M8 2v4" />
    <circle cx="16" cy="16" r="6" />
  </Icon>
);
export const MessageCircleOffIcon = (p: P) => (
  <Icon {...p}>
    <path d="m2 2 20 20M4.93 4.93A10 10 0 0 0 2 12c0 1.6.38 3.1 1.04 4.44L2 22l5.56-1.04A10 10 0 0 0 12 22a10 10 0 0 0 7.07-2.93M8.35 2.69A10 10 0 0 1 21.3 15.65" />
  </Icon>
);
export const UsersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87" />
    <circle cx="9" cy="7" r="4" />
  </Icon>
);
export const PlusIcon = (p: P) => <Icon {...p}><path d="M5 12h14M12 5v14" /></Icon>;
export const PencilIcon = (p: P) => <Icon {...p}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></Icon>;
export const Trash2Icon = (p: P) => <Icon {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></Icon>;
export const ChevronDownIcon = (p: P) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>;
export const ExternalLinkIcon = (p: P) => <Icon {...p}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Icon>;

export const MicIcon = (p: P) => <Icon {...p}><path d="M12 19v3M19 10v2a7 7 0 0 1-14 0v-2" /><rect x="9" y="2" width="6" height="13" rx="3" /></Icon>;
export const MicOffIcon = (p: P) => <Icon {...p}><path d="M12 19v3M15 9.34V5a3 3 0 0 0-5.68-1.33M16.95 16.95A7 7 0 0 1 5 12v-2M18.89 13.23A7 7 0 0 0 19 12v-2M2 2l20 20M9 9v3a3 3 0 0 0 5.12 2.12" /></Icon>;
export const SwitchCameraIcon = (p: P) => <Icon {...p}><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5m3-3-3 3 3 3M6 2l3 3-3 3" /><circle cx="12" cy="12" r="3" /></Icon>;
export const MonitorIcon = (p: P) => <Icon {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></Icon>;
export const CopyIcon = (p: P) => <Icon {...p}><rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Icon>;
export const SendHorizontalIcon = (p: P) => <Icon {...p}><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904zM6 12h16" /></Icon>;
export const Volume2Icon = (p: P) => <Icon {...p}><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298zM16 9a5 5 0 0 1 0 6M19.364 18.364a9 9 0 0 0 0-12.728" /></Icon>;
export const CircleCheckIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Icon>;
export const CircleAlertIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Icon>;
export const XIcon = (p: P) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
export const LinkIcon = (p: P) => <Icon {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Icon>;
export const PlayIcon = (p: P) => <Icon {...p}><path d="M6 3 20 12 6 21z" /></Icon>;
export const EllipsisIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></Icon>;
