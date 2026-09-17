"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function RobotMascot() {
  return (
    <svg viewBox="0 0 160 160" className="w-40 h-40 sm:w-48 sm:h-48" aria-hidden="true">
      <circle cx="115" cy="60" r="5" fill="#93c5fd" />
      <circle cx="128" cy="100" r="6" fill="#c4b5fd" />
      <circle cx="30" cy="110" r="4" fill="#67e8f9" />
      <rect x="72" y="18" width="4" height="14" rx="2" fill="#0f172a" />
      <circle cx="74" cy="16" r="5" fill="#22d3ee" />
      <rect x="35" y="32" width="78" height="60" rx="26" fill="#0f172a" />
      <circle cx="58" cy="60" r="9" fill="#22d3ee" />
      <circle cx="90" cy="60" r="9" fill="#22d3ee" />
      <path d="M58 76 Q74 86 90 76" stroke="#22d3ee" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="18" y="55" width="10" height="22" rx="5" fill="#0f172a" />
      <rect x="120" y="55" width="10" height="22" rx="5" fill="#0f172a" />
      <rect x="48" y="96" width="52" height="34" rx="16" fill="#0f172a" />
      <circle cx="74" cy="113" r="7" fill="#f8fafc" />
      <circle cx="74" cy="113" r="4" fill="#22d3ee" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-indigo-50 to-purple-50 p-4 sm:p-8">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl overflow-hidden grid md:grid-cols-2">
        {/* Left panel */}
        <div className="relative bg-gradient-to-br from-sky-50 to-indigo-50 p-8 sm:p-10 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-500 flex items-center justify-center shadow-md shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-slate-900 leading-tight">Kang Ridwan Official</p>
              <p className="text-[11px] tracking-widest text-slate-400 font-semibold uppercase">
                AI-Powered Content Workspace
              </p>
            </div>
          </div>

          <div className="mt-10">
            <p className="text-xs font-bold tracking-widest text-teal-600 uppercase mb-3">
              Content Command Center
            </p>
            <h1 className="text-4xl sm:text-[2.75rem] leading-[1.1] font-extrabold text-slate-900">
              Satukan kerja untuk ide yang bergerak lebih jauh.
            </h1>
            <p className="mt-4 text-slate-500 max-w-sm">
              Rencanakan, kolaborasikan, dan pahami performa konten bersama SORA dalam satu dashboard.
            </p>
          </div>

          <div className="relative flex justify-center py-8">
            <div className="absolute -top-2 right-6 bg-white rounded-2xl rounded-br-sm shadow-md px-4 py-2 text-sm font-medium text-slate-700">
              Halo! Senang bertemu kamu.
            </div>
            <RobotMascot />
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 bg-white rounded-full px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm">
              <span aria-hidden="true">▶</span> Content
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white rounded-full px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm">
              <span aria-hidden="true">~</span> Analytics
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white rounded-full px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm">
              <span aria-hidden="true">+</span> SORA
            </span>
          </div>
        </div>

        {/* Right panel */}
        <div className="p-8 sm:p-10 flex flex-col justify-center">
          <p className="text-xs font-bold tracking-widest text-teal-600 uppercase mb-3">
            Content Dashboard
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
            Selamat datang kembali
          </h2>
          <p className="mt-3 text-slate-500">
            Masuk untuk melanjutkan ke Kang Ridwan Official Content Dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              placeholder="nama@kangridwan.com"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 mb-5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
            />

            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">Password</label>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                {showPassword ? "Sembunyikan" : "Lihat"}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder="Masukkan password"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 mb-5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
            />

            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-teal-500 to-indigo-500 text-white rounded-xl py-3.5 text-sm font-bold shadow-lg shadow-indigo-200 hover:opacity-95 transition disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Masuk ke Dashboard"}
            </button>

            <p className="mt-4 text-center text-xs text-slate-400">
              Akses terbatas untuk anggota tim yang berwenang.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
