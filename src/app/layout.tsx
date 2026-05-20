import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "V4Stay — Smart Hotel Automation SaaS",
  description: "Register your hotel, set up services, menu & reception — get a manager dashboard and QR code instantly. Built by V4 Virtual Services.",
  keywords: "hotel automation, QR code menu, hotel management software, restaurant automation, India",
  openGraph: {
    title: "V4Stay — Smart Hotel Automation SaaS",
    description: "Automate your hotel. Generate QR codes. Manage orders live.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
