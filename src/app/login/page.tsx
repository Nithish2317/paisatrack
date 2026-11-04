 "use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const supabase = getSupabase();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: name } }
        });
        if (error) throw error;
        if (!data.session) setMessage("Account created. Check your email to verify your address, then sign in.");
        else router.replace("/dashboard");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen grid place-items-center p-5">
    <section className="panel w-full max-w-md p-7">
      <div className="flex items-center gap-3 mb-7"><div className="rounded-xl bg-emerald-400/15 p-3 text-emerald-300"><Wallet/></div><div><h1 className="text-2xl font-bold">PaisaTrack</h1><p className="muted text-sm">Your money. Your control.</p></div></div>
      <h2 className="text-xl font-semibold mb-1">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
      <p className="muted text-sm mb-6">Securely manage your personal finances.</p>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && <label className="block text-sm">Full name<input className="field mt-1" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={80} required /></label>}
        <label className="block text-sm">Email<input className="field mt-1" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
        <label className="block text-sm">Password<input className="field mt-1" type="password" autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} minLength={10} required /><span className="muted text-xs">Use at least 10 characters.</span></label>
        {message && <p role="status" className="text-sm text-amber-300">{message}</p>}
        <button disabled={busy} className="btn btn-primary w-full disabled:opacity-50">{busy ? "Please wait…" : mode==="login"?"Sign in":"Create account"}</button>
      </form>
      <p className="muted text-sm mt-5 text-center">{mode==="login"?"New to PaisaTrack?":"Already have an account?"} <button className="text-emerald-300 underline" onClick={()=>{setMode(mode==="login"?"signup":"login");setMessage("");}}>{mode==="login"?"Create account":"Sign in"}</button></p>
    </section>
  </main>;
}
