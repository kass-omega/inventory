"use client";
import { useAuth } from "@/context/AuthContext";
import { User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmProvider } from "../components/ConfirmProvider";
import NotificationBell from "../components/NotificationBell";
import NotificationToast from "../components/NotificationToast";
import InstallAppButton from "../components/InstallAppButton";
import Loading from "../components/Loading";
import { ToastProvider } from "../components/ToastProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, isLoading, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [user, isLoading, router]);
  if (isLoading || !user)
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <Loading />
      </div>
    );

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/products", label: "Products", permission: "products.view" },
    { href: "/dashboard/locations", label: "Locations", permission: "locations.manage" },
    { href: "/dashboard/requests", label: "Stock Requests", permission: "requests.view" },
    { href: "/dashboard/sales", label: "Sales", permission: "sales.view" },
    { href: "/dashboard/purchases", label: "Quick Purchases", permission: "purchases.view" },
    { href: "/dashboard/users", label: "Manage Users", permission: "users.view" },
    { href: "/dashboard/roles", label: "Roles & Permissions", permission: "roles.manage" },
    { href: "/dashboard/restock", label: "Restock", permission: "restock.create" },
    { href: "/dashboard/prices", label: "Price History", permission: "prices.view" },
    { href: "/dashboard/credits", label: "Credits", permission: "credits.view" },
    { href: "/dashboard/reports", label: "Reports", permission: "reports.view" },
  ].filter((link) => !link.permission || hasPermission(link.permission));

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex h-screen bg-gray-100 overflow-hidden">
          {/* Persistent notification toast */}
          <NotificationToast />

          {/* Mobile Overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-30 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            ></div>
          )}

          {/* Sidebar */}
          <aside
            className={`w-64 bg-gray-900 text-white flex flex-col h-full fixed z-40 transition-transform shrink-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:static lg:translate-x-0`}
          >
            <div className="p-6 text-xl font-bold border-b border-gray-800">
              Inventory Management Sys.
            </div>
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`block py-2.5 px-4 rounded text-sm font-medium ${pathname === link.href ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="p-4 border-t border-gray-800">
              <Link
                href="/dashboard/profile"
                className="flex gap-2 items-center gap-2 mb-1"
              >
                <User className="h-8 w-8 text-gray-300 flex-shrink-0" />

                <div className="flex flex-col py-2">
                  <span className="text-sm font-semibold text-gray-300 hover:text-white transition truncate">
                    {user.name}
                  </span>

                  <p className="text-xs text-gray-400 mb-2">{user.roleName}</p>
                </div>
              </Link>
              <InstallAppButton />
              <button
                onClick={logout}
                className="w-full text-left text-sm py-2 px-4 rounded text-red-400 hover:bg-gray-800"
              >
                Logout
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto h-full">
            {/* Top header bar — always visible */}
            <div className="sticky top-0 z-30 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 shadow-md">
              <div className="flex items-center justify-between px-4 py-2.5 max-w-7xl mx-auto">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden text-white p-2 rounded hover:bg-gray-700 transition"
                  aria-label="Open menu"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>

                <div className="hidden lg:flex items-center gap-2.5">
                  {/* User avatar icon */}
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold shadow-inner">
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="leading-tight">
                    <p className="text-sm font-semibold text-white">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-gray-400 font-medium">
                      {user.roleName}
                    </p>
                  </div>
                </div>

                <NotificationBell />
              </div>
            </div>

            <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
