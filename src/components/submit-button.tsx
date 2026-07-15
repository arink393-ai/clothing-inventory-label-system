"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "處理中…",
  className = "btn primary",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={disabled || pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
