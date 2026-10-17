"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
          credentials: "include",
        });
        setIsAuthenticated(res.ok);
        if (res.ok) {
          const data = await res.json();
          setUserEmail(data.email || null);
        }
      } catch {
        setIsAuthenticated(false);
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
      setIsAuthenticated(false);
      setUserEmail(null);
      window.location.href = "/login";
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <nav className="w-full flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
      <div className="text-xl font-bold tracking-tight">
        <Link href="/">Recapit</Link>
      </div>
      <div className="flex gap-4 items-center">
        {isAuthenticated ? (
          <>
            <Link href="/dashboard" className="hover:underline text-indigo-300">
              Dashboard
            </Link>

            <div className="relative" ref={ref}>
              <button
                onClick={() => setOpen((s) => !s)}
                className="flex items-center gap-2 rounded-full bg-slate-800/60 px-3 py-1 text-sm text-slate-100"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-white font-semibold">
                  {userEmail ? userEmail.charAt(0).toUpperCase() : "U"}
                </span>
                <span className="hidden sm:inline">Account</span>
              </button>

              {open ? (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-white/10 bg-slate-900 p-3 shadow-lg z-30">
                  <div className="text-xs text-slate-400 mb-2">Signed in as</div>
                  <div className="mb-3 font-medium text-white">{userEmail}</div>
                  <div className="border-t border-white/6 pt-2">
                    <button className="w-full text-left px-2 py-2 text-sm text-slate-200 hover:bg-white/2 rounded">Settings</button>
                    <button className="w-full text-left px-2 py-2 text-sm text-slate-200 hover:bg-white/2 rounded">Preferences</button>
                    <button onClick={handleLogout} className="w-full text-left px-2 py-2 text-sm text-rose-300 hover:bg-white/2 rounded">Logout</button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <Link href="/login" className="hover:underline">
              Login
            </Link>
            <Link href="/signup" className="hover:underline">
              Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
