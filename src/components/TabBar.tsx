import { useLayoutEffect, useRef } from 'react';
import { TAB_CONFIG, type TabId } from '../data/tabs.ts';
import { TAB_ICONS } from './tabIcons.ts';

interface TabBarProps {
  activeTab: TabId;
  onSetTab: (tab: TabId) => void;
  disabled?: boolean;
}

export default function TabBar({ activeTab, onSetTab, disabled }: TabBarProps) {
  const barRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const active = activeRef.current;
    if (!bar || !active || bar.scrollWidth <= bar.clientWidth) return;
    const viewport = bar.getBoundingClientRect();
    const target = active.getBoundingClientRect();
    if (target.left < viewport.left) bar.scrollLeft -= viewport.left - target.left;
    else if (target.right > viewport.right) bar.scrollLeft += target.right - viewport.right;
  }, [activeTab]);

  return (
    <nav ref={barRef} aria-label="Estate sections" className="tab-nav w-full flex overflow-x-auto bg-bg-deepest">
      {TAB_CONFIG.map(({ id, label }) => {
        const isActive = activeTab === id;
        const Icon = TAB_ICONS[id];
        return (
          <button key={id} ref={isActive ? activeRef : null} onClick={() => onSetTab(id)}
            disabled={disabled} title={label}
            className={`tab-button flex flex-col lg:flex-row items-center justify-center gap-1 flex-none lg:flex-1 min-w-[80px] lg:min-w-max min-h-[50px] px-2 py-3 text-center border-b-2 font-heading cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed motion-safe:transition-colors motion-safe:duration-200 ${isActive
              ? 'bg-bg-card border-gold text-gold shadow-[0_-2px_8px_rgba(196,162,74,0.15)]'
              : 'bg-transparent border-transparent text-tan enabled:hover:bg-bg-card enabled:hover:text-tan-light enabled:hover:border-gold/40'}`}
            aria-label={`${label} tab${isActive ? ' (active)' : ''}`} aria-current={isActive ? 'page' : undefined}>
            <Icon size={16} className="shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold uppercase tracking-wide whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
