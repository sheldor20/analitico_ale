import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Analítico | Gestão Comercial",
  description: "Metas, resultados e ações das centrais Bahia e Nordeste.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
