"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale, BrainCircuit, Activity, FileSearch, ShieldCheck } from "lucide-react";

export default function AppSidebar() {
    const pathname = usePathname();

    const links = [
        { href: "/inconsistency", label: "Inconsistency Detector", icon: FileSearch },
        { href: "/legal-qa", label: "Legal Q&A (BNS/BNSS/BSA)", icon: BrainCircuit },
        { href: "/api-explorer", label: "API Explorer", icon: Activity },
        { href: "/judge-dashboard", label: "Judge Dashboard", icon: Scale },
    ];

    return (
        <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex shrink-0 min-h-screen">
            <div className="p-6 border-b border-slate-800 flex items-center gap-2 text-white font-bold text-xl">
                <ShieldCheck className="h-6 w-6 text-indigo-500" /> Legal-TechAI
            </div>
            <nav className="flex-1 p-4 space-y-2">
                {links.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    return (
                        <Link 
                            key={link.href} 
                            href={link.href}
                            className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                                isActive 
                                ? "bg-indigo-600 text-white font-medium" 
                                : "hover:bg-slate-800 text-slate-400 hover:text-white"
                            }`}
                        >
                            <Icon className="h-5 w-5" />
                            {link.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t border-slate-800">
                <Link href="/" className="text-sm font-medium text-slate-500 hover:text-white transition-colors">
                    ← Back to Home
                </Link>
            </div>
        </aside>
    );
}
