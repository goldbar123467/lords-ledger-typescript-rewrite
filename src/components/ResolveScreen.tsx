import type { Ref } from 'react';

interface ResolveScreenProps {
  onContinue: () => void;
  buttonText?: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

export default function ResolveScreen({ onContinue, buttonText, buttonRef }: ResolveScreenProps) {
  return (
    <div className="w-full max-w-xl mx-auto text-center mt-4">
      <button ref={buttonRef} onClick={onContinue}
        className="px-8 py-4 rounded-md border-2 border-gold text-gold-bright font-heading font-semibold text-base uppercase tracking-wider cursor-pointer transition-all duration-200 min-h-[44px] bg-[linear-gradient(135deg,#8b1a1a,#c62828)] hover:bg-[linear-gradient(135deg,#a02020,#e03030)]">
        {buttonText || 'Continue'}
      </button>
    </div>
  );
}
