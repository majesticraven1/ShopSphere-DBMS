import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopSphere | Hybrid SQL + NoSQL E-Commerce Platform",
  description:
    "DBMS Experiential Learning Level 3 Project — PostgreSQL Transactional Backbone + MongoDB Review-Driven Product Recommendations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
