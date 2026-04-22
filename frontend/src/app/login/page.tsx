"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, Gavel, Shield } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleLogin = (role: "citizen" | "judge") => {
        setLoading(true);
        // Simulating login by saving role to localStorage
        // In a real app, this would token exchange
        localStorage.setItem("user_role", role);
        localStorage.setItem("user_id", "1"); // Hardcoded ID 1 for now

        setTimeout(() => {
            router.push("/profile");
        }, 800);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <Link href="/" className="mb-8 flex items-center gap-2 text-indigo-900">
                <Shield className="h-8 w-8" />
                <span className="text-2xl font-bold tracking-tight">Legal-TechAI</span>
            </Link>

            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="p-8 text-center border-b border-slate-100">
                    <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
                    <p className="text-slate-500 mt-2">Select your role to access the judicial system</p>
                </div>

                <div className="p-8 space-y-4">
                    <button
                        onClick={() => handleLogin("citizen")}
                        disabled={loading}
                        className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <User className="h-6 w-6" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-slate-900">Citizen</h3>
                                <p className="text-sm text-slate-500">File cases, track status</p>
                            </div>
                        </div>
                        <div className="h-2 w-2 rounded-full bg-slate-300 group-hover:bg-indigo-500"></div>
                    </button>

                    <button
                        onClick={() => handleLogin("judge")}
                        disabled={loading}
                        className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50 transition-all group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                <Gavel className="h-6 w-6" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-slate-900">Judicial Officer</h3>
                                <p className="text-sm text-slate-500">Review cases, verify evidence</p>
                            </div>
                        </div>
                        <div className="h-2 w-2 rounded-full bg-slate-300 group-hover:bg-amber-500"></div>
                    </button>
                </div>

                <div className="p-4 bg-slate-50 text-center text-xs text-slate-400">
                    SECURE • ENCRYPTED • OFFICIAL
                </div>
            </div>
        </div>
    );
}
