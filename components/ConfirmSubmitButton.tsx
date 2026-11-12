"use client";

// A plain submit button that asks for a browser confirmation first —
// used for irreversible actions (like permanently erasing an academy)
// where a client-side "are you sure?" is worth the extra click, on top of
// whatever server-side safety checks the action itself also does.
export default function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
