"use client";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { useEffect, useState } from "react";

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState("");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    api.get("/auth/profile").then(r => {
      setProfile(r.data);
      setName(r.data.name);
      setEmail(r.data.email);
      setPhone(r.data.phone || "");
    });
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.put("/auth/profile", { name, email, phone });
    setEditing(false);
    setSaved("Profile updated");
    setTimeout(() => setSaved(""), 2000);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg("");
    try {
      await api.put("/auth/profile/password", { currentPassword: currentPw, newPassword: newPw });
      setPwMsg("Password changed!");
      setCurrentPw(""); setNewPw("");
    } catch (err: any) {
      setPwMsg(err.response?.data?.message || "Failed");
    }
    setTimeout(() => setPwMsg(""), 3000);
  };

  if (!profile) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Profile</h1>

      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold">
            {profile.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-lg">{profile.name}</p>
            <p className="text-sm text-gray-500">{profile.role?.name}</p>
          </div>
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <p><span className="text-gray-400">Email:</span> {profile.email}</p>
          {profile.phone && <p><span className="text-gray-400">Phone:</span> {profile.phone}</p>}
          {profile.location && <p><span className="text-gray-400">Location:</span> {profile.location.name}</p>}
        </div>

        <button onClick={() => setEditing(!editing)} className="text-blue-600 text-sm hover:underline">
          {editing ? "Cancel" : "Edit Profile"}
        </button>

        {editing && (
          <form onSubmit={saveProfile} className="space-y-3 pt-2 border-t">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="border p-2 rounded-lg w-full text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="border p-2 rounded-lg w-full text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                className="border p-2 rounded-lg w-full text-sm" />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              Save
            </button>
            {saved && <span className="text-green-600 text-sm ml-2">{saved}</span>}
          </form>
        )}
      </div>

      {user?.isSuperuser && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Change Password</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Current Password</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
              className="border p-2 rounded-lg w-full text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">New Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)}
                className="border p-2 rounded-lg w-full text-sm pr-10" required />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
            Change Password
          </button>
          {pwMsg && <span className={pwMsg.includes("changed") ? "text-green-600" : "text-red-500"}>{pwMsg}</span>}
        </form>
        </div>
      )}
    </div>
  );
}