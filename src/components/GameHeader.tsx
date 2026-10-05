import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Keep resource/navigation chrome pinned only when it leaves room to read and focus content. */
export default function GameHeader({ children }: { children: ReactNode }) {
  const headerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => setPinned(header.getBoundingClientRect().height <= window.innerHeight * 0.4);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return <div ref={headerRef} className="game-header sticky top-0 z-40" data-pinned={pinned}>
    {children}
  </div>;
}
