type IconName =
  | 'menu' | 'sun' | 'moon' | 'play' | 'pause' | 'reset' | 'minus' | 'plus'
  | 'close' | 'edit' | 'duplicate' | 'trash' | 'plusCircle'
  | 'heart' | 'heartFilled' | 'more' | 'list' | 'users' | 'star' | 'check';

const PATHS: Record<IconName, string> = {
  menu:        'M4 6h16M4 12h16M4 18h16',
  sun:         'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  moon:        'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  play:        'M7 5v14l12-7z',
  pause:       'M7 5h4v14H7zM13 5h4v14h-4z',
  reset:       'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  minus:       'M5 12h14',
  plus:        'M12 5v14M5 12h14',
  close:       'M6 6l12 12M6 18L18 6',
  edit:        'M4 20h4l11-11-4-4L4 16zM14 5l4 4',
  duplicate:   'M9 9h11v11H9zM5 15V4h11',
  trash:       'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  plusCircle:  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8',
  heart:       'M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z',
  heartFilled: 'M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z',
  more:        'M5 12h.01M12 12h.01M19 12h.01',
  list:        'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  users:       'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  star:        'M12 2l3 7 7 .8-5.2 4.8 1.5 7-6.3-3.7-6.3 3.7 1.5-7L2 9.8 9 9z',
  check:       'M5 12l5 5L20 7',
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  fill?: boolean;
}

export function Icon({ name, size = 18, className, fill = false }: Props) {
  const path = PATHS[name];
  const filled = fill || name === 'play' || name === 'pause' || name === 'heartFilled' || name === 'star';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
