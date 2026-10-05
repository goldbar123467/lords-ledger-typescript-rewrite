interface SaveRecoveryNoticeProps { onRecover: () => void }

export default function SaveRecoveryNotice({ onRecover }: SaveRecoveryNoticeProps) {
  return (
    <div className="my-3 rounded border border-amber-400/60 bg-stone-950 p-4 text-left text-sm text-amber-100">
      <p className="mb-3">
        Restarting discards only the damaged copying attempt. Estate resources and progress are kept.
        Stored saves stay unchanged until you choose Save game.
      </p>
      <button type="button" onClick={onRecover}
        className="rounded border border-amber-300 bg-amber-950 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200">
        Restart manuscript and load
      </button>
    </div>
  );
}
