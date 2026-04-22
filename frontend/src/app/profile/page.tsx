"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, ShieldAlert, User, LogOut, ChevronRight, Loader2 } from "lucide-react";

export default function ProfilePage() {
    const [role, setRole] = useState<string | null>(null);
    const [isVerified, setIsVerified] = useState(false); // Should fetch from API
    const [userId, setUserId] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [govtId, setGovtId] = useState("");

    useEffect(() => {
        const r = localStorage.getItem("user_role");
        const u = localStorage.getItem("user_id");
        setRole(r);
        setUserId(u);

        // In a real app, we would fetch user details here to check verification status
        // For MVP demo, we start unverified unless simulated
    }, []);

    const handleVerify = async () => {
        if (!govtId) return alert("Enter Govt ID Number");
        if (!userId) return;

        setVerifying(true);
        try {
            const formData = new FormData();
            formData.append("govt_id", govtId);

            const res = await fetch(`http://localhost:8000/users/${userId}/verify`, {
                method: "POST",
                body: formData
            });

            const data = await res.json();
            if (data.status === "verified") {
                setIsVerified(true);
                alert("Verification Successful!");
            } else {
                alert(data.message);
            }
        } catch (e) {
            console.error(e);
            alert("Verification Error");
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <nav className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
                <div className="container mx-auto flex justify-between items-center">
                    <Link href="/" className="font-bold text-slate-900 flex items-center gap-2">
                        <User className="h-5 w-5" />
                        <span>My Profile</span>
                    </Link>
                    <Link href="/" className="text-sm text-slate-500 hover:text-red-600 flex items-center gap-1">
                        <LogOut className="h-4 w-4" /> Sign Out
                    </Link>
                </div>
            </nav>

            <main className="container mx-auto p-4 py-8 max-w-2xl">
                {/* Profile Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                    <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">Dhanush (Test User)</h1>
                            <p className="opacity-80 capitalize">{role || "Citizen"} • ID: {userId}</p>
                        </div>
                        {isVerified ? (
                            <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> Verified
                            </div>
                        ) : (
                            <div className="bg-amber-500/20 text-amber-400 border border-amber-500/50 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                                <ShieldAlert className="h-3 w-3" /> Unverified
                            </div>
                        )}
                    </div>

                    <div className="p-6">
                        {!isVerified ? (
                            <div className="space-y-4">
                                <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg">
                                    <h3 className="font-bold text-amber-900 mb-1">Action Required: Verify Identity</h3>
                                    <p className="text-sm text-amber-800">
                                        To access sensitive case files or file legal motions, you must verify your identity with a government-issued ID.
                                    </p>
                                </div>

                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Enter Aadhaar / Govt ID"
                                        className="flex-1 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={govtId}
                                        onChange={(e) => setGovtId(e.target.value)}
                                    />
                                    <button
                                        onClick={handleVerify}
                                        disabled={verifying}
                                        className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {verifying ? "Verifying..." : "Verify Now"}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 italic">
                                    * Demo: Use any number NOT ending in '000' to pass.
                                </p>
                            </div>
                        ) : (
                            <div className="text-center py-8 space-y-4">
                                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
                                    <CheckCircle className="h-10 w-10" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900">You are Digitally Verified</h2>
                                <p className="text-slate-500 max-w-sm mx-auto">
                                    Your digital identity has been cryptographically signed and linked to your government records. You now have full access.
                                </p>
                                <div className="grid grid-cols-2 gap-4 mt-6">
                                    <Link href="/file-case" className="block p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left group">
                                        <div className="font-bold text-indigo-900 group-hover:text-indigo-700">File New Case</div>
                                        <div className="text-xs text-slate-500">Camera-based filing</div>
                                    </Link>
                                    <Link href="/search-case" className="block p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left group">
                                        <div className="font-bold text-emerald-900 group-hover:text-emerald-700">Search Cases</div>
                                        <div className="text-xs text-slate-500">Track status</div>
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
