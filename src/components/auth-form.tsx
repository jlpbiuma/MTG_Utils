"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Mail, Lock, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithEmail, signUpWithEmail } from "@/actions/auth";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationNotice, setConfirmationNotice] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConfirmationNotice(false);
    setLoading(true);

    try {
      if (mode === "login") {
        const result = await signInWithEmail(email, password);
        if (result.error) {
          setError(result.error);
        } else {
          router.push("/decks");
          router.refresh();
        }
      } else {
        const result = await signUpWithEmail(email, password);
        if (result.error) {
          setError(result.error);
        } else if (result.needsConfirmation) {
          setConfirmationNotice(true);
        } else {
          // Logged in directly
          router.push("/decks");
          router.refresh();
        }
      }
    } catch (err) {
      setError("Ocurrió un error inesperado. Por favor, intenta de nuevo.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl relative overflow-hidden">
      {/* Decorative top mana line */}
      <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-sky-500 to-purple-500" />

      <CardHeader className="text-center pb-4 pt-8">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 mb-3">
          <Sparkles className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl font-black tracking-tight text-white">
          {mode === "login" ? "Acceder a MTG Utils" : "Crear Cuenta de Planeswalker"}
        </CardTitle>
        <CardDescription className="text-slate-400 text-sm">
          {mode === "login"
            ? "Inicia sesión para sincronizar tus mazos y colección con Supabase"
            : "Regístrate para guardar tu inventario y calcular qué cartas te faltan"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-2 pb-8">
        {/* Toggle Mode Switcher */}
        <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setConfirmationNotice(false);
            }}
            className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${
              mode === "login"
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
              setConfirmationNotice(false);
            }}
            className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${
              mode === "register"
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Crear Cuenta
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">Error de autenticación:</span>
              {error}
            </div>
          </div>
        )}

        {confirmationNotice && (
          <div className="p-3.5 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">¡Cuenta creada con éxito!</span>
              Hemos enviado un enlace de confirmación a tu correo. Por favor, revísalo para activar tu cuenta.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-amber-400" />
              Correo Electrónico
            </label>
            <Input
              type="email"
              placeholder="tu-correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-950/90 h-11 border-slate-700"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              Contraseña
            </label>
            <Input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-950/90 h-11 border-slate-700"
              required
            />
          </div>

          <Button
            type="submit"
            variant="mana"
            disabled={loading}
            className="w-full h-11 text-base font-bold shadow-lg shadow-amber-500/20 mt-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : mode === "login" ? (
              "Acceder a mis Mazos"
            ) : (
              "Crear Mi Cuenta"
            )}
          </Button>
        </form>

        <div className="text-center pt-2">
          <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
            Conectado de forma segura a Supabase PostgreSQL
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
