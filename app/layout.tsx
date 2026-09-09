import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sicoob | Gestão Comercial",
  description:
    "Acompanhamento comercial Sicoob: centrais, cooperativas, PAs, metas e produção realizada.",
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
