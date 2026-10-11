import { useEffect, useRef, type ReactNode } from "react";

/** A modal <dialog>: the browser traps focus inside and closes it on Escape; focus returns to whatever opened it. */
export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="cal-modal"
      aria-labelledby="cal-modal-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="cal-modal-body">
        <h2 id="cal-modal-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
