"use client";

/** Wraps a submit button inside an existing <form action={serverAction}>
 * with a native confirm() prompt — enough friction for a deactivate/
 * reopen action without building a full modal dialog for a single
 * internal user. */
export function ConfirmSubmitButton({
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
