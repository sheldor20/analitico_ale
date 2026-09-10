"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { ADMIN_BOOTSTRAP_EVENT } from "@/lib/supabase";

export default function AdminAccessNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(ADMIN_BOOTSTRAP_EVENT, show);
    return () => window.removeEventListener(ADMIN_BOOTSTRAP_EVENT, show);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        width: "min(680px, calc(100% - 32px))",
      }}
    >
      <div className="message success">
        <CheckCircle2 size={18} />
        <span>
          <strong>Primeiro acesso criado.</strong> Confirme o e-mail enviado e,
          depois, entre novamente com a mesma senha.
        </span>
        <button aria-label="Fechar mensagem" onClick={() => setVisible(false)}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
