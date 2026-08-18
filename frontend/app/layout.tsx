import { AuthProvider } from "@/context/AuthContext";
import LoadingBar from "./components/LoadingBar";
import PwaRegistry from "./components/PwaRegistry";
import "./globals.css";

export const metadata = {
  title: "Inventory System",
  description: "Multi-branch inventory and sales management",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    title: "Inventory System",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LoadingBar />
        <AuthProvider>
          <PwaRegistry />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
