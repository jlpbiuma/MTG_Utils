import { AuthForm } from "@/components/auth-form";

export const metadata = {
  title: "Iniciar Sesión | MTG Utils",
  description: "Accede a tu cuenta de MTG Utils para gestionar tus mazos y colección.",
};

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-130px)] flex flex-col items-center justify-center px-4 py-12">
      <AuthForm />
    </div>
  );
}
