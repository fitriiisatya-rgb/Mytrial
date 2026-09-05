"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <main className="min-h-screen flex items-center justify-center bg-navy">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-lg font-bold text-navy mb-1">Amor Partnership Finance</h1>
        <p className="text-sm text-gray-500 mb-6">Masuk untuk melanjutkan</p>

        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 mb-4 text-sm"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 mb-4 text-sm"
        />

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-navy text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}
