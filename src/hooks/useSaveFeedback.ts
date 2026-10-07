import { useCallback, useEffect, useState } from 'react';

export interface SaveRecovery {
  readonly raw: string;
  readonly kind: 'v2' | 'legacy';
}
export type SaveSuccessKind = 'saved' | 'loaded';
export type SaveNoticeKind = 'imported' | 'recovered';
export type SaveFeedback =
  | Readonly<{ kind: SaveSuccessKind }>
  | Readonly<{ kind: 'error'; message: string; recovery: SaveRecovery | null }>
  | Readonly<{ kind: SaveNoticeKind; message: string }>
  | null;

/** One current status owns its expiry; errors and explicit notices remain until replaced. */
export function useSaveFeedback() {
  const [feedback, setFeedback] = useState<SaveFeedback>(null);
  useEffect(() => {
    if (!feedback || (feedback.kind !== 'saved' && feedback.kind !== 'loaded')) return;
    const handle = window.setTimeout(() => {
      // A stale callback cannot erase a newer status even if it was already queued.
      setFeedback(current => current === feedback ? null : current);
    }, 2000);
    return () => window.clearTimeout(handle);
  }, [feedback]);
  const reportError = useCallback((message: string, recovery: SaveRecovery | null = null) => {
    setFeedback({ kind: 'error', message, recovery });
  }, []);
  const reportSuccess = useCallback((kind: SaveSuccessKind) => { setFeedback({ kind }); }, []);
  const reportNotice = useCallback((kind: SaveNoticeKind, message: string) => { setFeedback({ kind, message }); }, []);
  const clear = useCallback(() => { setFeedback(null); }, []);
  return { feedback, reportError, reportSuccess, reportNotice, clear };
}
