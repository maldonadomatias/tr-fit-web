// Lucide-style stroke icons, copy-pasted path data only.
// Single source of truth — every screen reads from window.Icons.

const SvgBase = ({ size = 16, stroke = 2, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

const Icons = {
  Dumbbell: (p) => (
    <SvgBase {...p}>
      <path d="m6.5 6.5 11 11" />
      <path d="m21 21-1-1" />
      <path d="m3 3 1 1" />
      <path d="m18 22 4-4" />
      <path d="m2 6 4-4" />
      <path d="m3 10 7-7" />
      <path d="m14 21 7-7" />
    </SvgBase>
  ),
  Home: (p) => (
    <SvgBase {...p}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </SvgBase>
  ),
  Users: (p) => (
    <SvgBase {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </SvgBase>
  ),
  UserPlus: (p) => (
    <SvgBase {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </SvgBase>
  ),
  Clock: (p) => (
    <SvgBase {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </SvgBase>
  ),
  CreditCard: (p) => (
    <SvgBase {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </SvgBase>
  ),
  Activity: (p) => (
    <SvgBase {...p}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </SvgBase>
  ),
  Search: (p) => (
    <SvgBase {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </SvgBase>
  ),
  Bell: (p) => (
    <SvgBase {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </SvgBase>
  ),
  Settings: (p) => (
    <SvgBase {...p}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </SvgBase>
  ),
  LogOut: (p) => (
    <SvgBase {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </SvgBase>
  ),
  Sun: (p) => (
    <SvgBase {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </SvgBase>
  ),
  Moon: (p) => (
    <SvgBase {...p}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </SvgBase>
  ),
  ChevronRight: (p) => (
    <SvgBase {...p}><path d="m9 18 6-6-6-6" /></SvgBase>
  ),
  ChevronLeft: (p) => (
    <SvgBase {...p}><path d="m15 18-6-6 6-6" /></SvgBase>
  ),
  ChevronDown: (p) => (
    <SvgBase {...p}><path d="m6 9 6 6 6-6" /></SvgBase>
  ),
  ChevronUp: (p) => (
    <SvgBase {...p}><path d="m18 15-6-6-6 6" /></SvgBase>
  ),
  ArrowUpRight: (p) => (
    <SvgBase {...p}><path d="M7 17 17 7" /><path d="M7 7h10v10" /></SvgBase>
  ),
  ArrowDownRight: (p) => (
    <SvgBase {...p}><path d="m7 7 10 10" /><path d="M17 7v10H7" /></SvgBase>
  ),
  Check: (p) => (
    <SvgBase {...p}><path d="M20 6 9 17l-5-5" /></SvgBase>
  ),
  CheckCircle: (p) => (
    <SvgBase {...p}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </SvgBase>
  ),
  X: (p) => (
    <SvgBase {...p}><path d="M18 6 6 18M6 6l12 12" /></SvgBase>
  ),
  XCircle: (p) => (
    <SvgBase {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </SvgBase>
  ),
  AlertTriangle: (p) => (
    <SvgBase {...p}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />
      <path d="M12 9v4M12 17h.01" />
    </SvgBase>
  ),
  Mail: (p) => (
    <SvgBase {...p}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </SvgBase>
  ),
  MailCheck: (p) => (
    <SvgBase {...p}>
      <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
      <path d="m22 7-10 5L2 7" />
      <path d="m16 19 2 2 4-4" />
    </SvgBase>
  ),
  Shield: (p) => (
    <SvgBase {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </SvgBase>
  ),
  TrendingUp: (p) => (
    <SvgBase {...p}>
      <path d="m23 6-9.5 9.5-5-5L1 18" />
      <path d="M17 6h6v6" />
    </SvgBase>
  ),
  TrendingDown: (p) => (
    <SvgBase {...p}>
      <path d="m23 18-9.5-9.5-5 5L1 6" />
      <path d="M17 18h6v-6" />
    </SvgBase>
  ),
  Flame: (p) => (
    <SvgBase {...p}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </SvgBase>
  ),
  Plus: (p) => (
    <SvgBase {...p}><path d="M12 5v14M5 12h14" /></SvgBase>
  ),
  MoreHorizontal: (p) => (
    <SvgBase {...p}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </SvgBase>
  ),
  Filter: (p) => (
    <SvgBase {...p}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </SvgBase>
  ),
  Download: (p) => (
    <SvgBase {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </SvgBase>
  ),
  Calendar: (p) => (
    <SvgBase {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </SvgBase>
  ),
  Trash: (p) => (
    <SvgBase {...p}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </SvgBase>
  ),
  RefreshCw: (p) => (
    <SvgBase {...p}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </SvgBase>
  ),
  Eye: (p) => (
    <SvgBase {...p}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </SvgBase>
  ),
  Copy: (p) => (
    <SvgBase {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </SvgBase>
  ),
  Star: (p) => (
    <SvgBase {...p}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </SvgBase>
  ),
  Info: (p) => (
    <SvgBase {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </SvgBase>
  ),
  ExternalLink: (p) => (
    <SvgBase {...p}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </SvgBase>
  ),
};

window.Icons = Icons;
