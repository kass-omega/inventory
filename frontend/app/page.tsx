"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) router.push("/dashboard");
      else router.push("/login");
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <p className="text-gray-500 text-lg">Loading System...</p>
    </div>
  );
}
