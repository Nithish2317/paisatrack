import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaisaTrack — Personal Finance",
  description: "Track income, expenses, budgets and savings."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
