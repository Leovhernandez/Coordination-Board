"use client";

/**
 * A submit button that asks for confirmation before letting its form submit.
 * Used for destructive admin actions (e.g. deleting an account) so a stray tap
 * can't wipe a business.
 */
export function ConfirmSubmit({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
