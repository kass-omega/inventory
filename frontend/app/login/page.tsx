"use client";

import { useAuth } from "@/context/AuthContext";
import api, { markHandled } from "@/lib/api";
import Loading from "../components/Loading";
import { useState } from "react";

interface DemoAccount {
  email: string;
  role: "Owner" | "Storekeeper" | "Shopkeeper" | "Standalone Shop";
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "owner@inventory.com", role: "Owner" },
  { email: "storekeeper@inventory.com", role: "Storekeeper" },
  { email: "cablestore@inventory.com", role: "Storekeeper" },
  { email: "shopkeeper1@inventory.com", role: "Shopkeeper" },
  { email: "shopkeeper2@inventory.com", role: "Shopkeeper" },
  { email: "shopkeeper3@inventory.com", role: "Shopkeeper" },
  { email: "standalone@inventory.com", role: "Standalone Shop" },
];

const DEMO_PASSWORD = "password123";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("access_token", res.data.access_token);
      login(res.data.user);
    } catch (err: any) {
      markHandled(err);
      if (err?.response?.status === 401) {
        setError("Invalid credentials. Please try again.");
      } else {
        setError(
          "Cannot reach the server. Please check your connection and try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const selectAccount = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError("");
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case "Owner":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "Storekeeper":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "Shopkeeper":
        return "bg-green-100 text-green-700 border-green-200";
      case "Standalone Shop":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-8">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="bg-white shadow-lg rounded-xl p-6 sm:p-8 border border-gray-200 mb-6">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
              Inventory System
            </h1>
            <p className="text-gray-500 mt-2 text-sm sm:text-base">Sign in to your account</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded mb-4 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 sm:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2.5 sm:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-sm pr-10"
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white p-2.5 sm:p-3 rounded-lg hover:bg-blue-700 font-semibold transition shadow-md text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loading size="sm" />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Demo Accounts Section (development only) */}
        {process.env.NODE_ENV === "development" && (
          <div>
            <p className="text-xs text-gray-400 text-center mb-3 uppercase tracking-wider font-medium">
              Demo Accounts — Click to fill form
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  onClick={() => selectAccount(account)}
                  className={`text-left p-3 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                    email === account.email
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <span className="text-xs font-medium text-gray-700 truncate">
                    {account.email.split("@")[0]}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${roleBadge(account.role)}`}
                  >
                    {account.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
