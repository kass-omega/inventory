"use client";
import api, { markHandled } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/app/components/ConfirmProvider";
import { useToast } from "@/app/components/ToastProvider";
import { useEffect, useState } from "react";
import Modal from "../../components/Modal";

function groupPermissions(permissions: any[]) {
  const map: Record<string, any[]> = {};
  for (const p of permissions) {
    const g = p.permission?.group || "Other";
    (map[g] ||= []).push(p);
  }
  return Object.entries(map);
}

export default function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    roleId: "",
    locationId: "",
  });
  const [resetUser, setResetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetError, setResetError] = useState("");
  const [viewingRole, setViewingRole] = useState<any>(null);
  const [menuUser, setMenuUser] = useState<any>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );

  useEffect(() => {
    api.get("/users").then((res) => setUsers(res.data));
    api.get("/locations").then((res) => setLocations(res.data));
    api.get("/roles").then((res) => setRoles(res.data));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      roleId: form.roleId ? Number(form.roleId) : null,
      locationId: form.locationId ? Number(form.locationId) : null,
    };
    if (editing) {
      const { password, ...updateData } = payload;
      if (!password) delete (updateData as any).password;
      await api.put(`/users/${editing.id}`, updateData);
    } else {
      await api.post("/auth/register", payload);
    }
    setShowForm(false);
    setEditing(null);
    setForm({
      name: "",
      email: "",
      password: "",
      roleId: "",
      locationId: "",
    });
    api.get("/users").then((res) => setUsers(res.data));
  };

  const startEdit = (u: any) => {
    setEditing(u);
    setShowForm(true);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      roleId: u.roleId ? String(u.roleId) : "",
      locationId: u.locationId ? String(u.locationId) : "",
    });
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm("Delete this user?");
    if (!ok) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success("User deleted");
      api.get("/users").then((res) => setUsers(res.data));
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to delete user");
    }
  };

  const openResetPassword = (u: any) => {
    setResetUser(u);
    setNewPassword("");
    setResetMsg("");
    setResetError("");
  };

  const openMenu = (u: any, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuUser(u);
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg("");
    setResetError("");
    try {
      await api.put(`/users/${resetUser.id}/password`, {
        password: newPassword,
      });
      setResetMsg("Password updated");
      setNewPassword("");
      setTimeout(() => setResetUser(null), 1200);
    } catch (err: any) {
      markHandled(err);
      setResetError(
        err.response?.data?.message || "Failed to update password",
      );
    }
  };

  const toggleStatus = async (u: any) => {
    const next = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await api.patch(`/users/${u.id}/status`, { status: next });
      api.get("/users").then((res) => setUsers(res.data));
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  // Selected role (to know whether it is the system/owner role)
  const selectedRole = roles.find((r: any) => String(r.id) === form.roleId);
  const isSystemRole = !!selectedRole?.isSystem;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
          Manage Users
        </h1>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(!showForm);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          {showForm ? "Cancel" : "+ Add User"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border mb-6 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Full Name
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Password {editing && "(leave blank to keep)"}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="border p-2 rounded-lg w-full"
              required={!editing}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Role
            </label>
            <select
              value={form.roleId}
              onChange={(e) =>
                setForm({ ...form, roleId: e.target.value, locationId: "" })
              }
              className="border p-2 rounded-lg w-full bg-white"
              required
            >
              <option value="">Select Role...</option>
              {roles.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Assigned Location
            </label>
            <select
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              className="border p-2 rounded-lg w-full bg-white"
              disabled={isSystemRole}
            >
              <option value="">Select Location...</option>
              {locations.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.type})
                </option>
              ))}
            </select>
            {isSystemRole && (
              <p className="text-xs text-gray-400 mt-1">
                Owners do not need a specific location assignment.
              </p>
            )}
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white p-2 rounded-lg md:col-span-2"
          >
            {editing ? "Update" : "Create"} User
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-2 sm:p-3 md:p-4">Name</th>
              <th className="p-2 sm:p-3 md:p-4">Email</th>
              <th className="p-2 sm:p-3 md:p-4">Role</th>
              <th className="p-2 sm:p-3 md:p-4">Location</th>
              <th className="p-2 sm:p-3 md:p-4">Status</th>
              <th className="p-2 sm:p-3 md:p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => {
              const loc = locations.find((l: any) => l.id === u.locationId);
              return (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 sm:p-3 md:p-4 font-medium whitespace-nowrap">{u.name}</td>
                  <td className="p-2 sm:p-3 md:p-4 text-gray-600 text-xs sm:text-sm whitespace-nowrap">{u.email}</td>
                  <td className="p-2 sm:p-3 md:p-4">
                    <button
                      onClick={() =>
                        setViewingRole(
                          roles.find((r: any) => r.id === u.roleId) ?? null,
                        )
                      }
                      className="bg-blue-100 text-blue-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs hover:bg-blue-200 underline decoration-dotted cursor-pointer"
                      title="View role details"
                    >
                      {u.role?.name}
                    </button>
                  </td>
                  <td className="p-2 sm:p-3 md:p-4 text-xs sm:text-sm text-gray-600 whitespace-nowrap">
                    {loc ? loc.name : "-"}
                  </td>
                  <td className="p-2 sm:p-3 md:p-4">
                    <span
                      className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs ${
                        u.status === "ACTIVE"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="p-2 sm:p-3 md:p-4">
                    <button
                      onClick={(e) => openMenu(u, e)}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Actions"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-5 w-5"
                      >
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!resetUser}
        onClose={() => setResetUser(null)}
        title={`Reset Password — ${resetUser?.name}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p className="text-sm text-gray-600">
            Set a new password for{" "}
            <span className="font-medium">{resetUser?.email}</span>.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              New Password
            </label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border p-2 rounded-lg w-full text-sm"
              minLength={8}
              required
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setResetUser(null)}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Save Password
            </button>
          </div>
          {resetMsg && <p className="text-green-600 text-sm">{resetMsg}</p>}
          {resetError && <p className="text-red-500 text-sm">{resetError}</p>}
        </form>
      </Modal>

      <Modal
        isOpen={!!viewingRole}
        onClose={() => setViewingRole(null)}
        title={`Role — ${viewingRole?.name}`}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">
              Description
            </p>
            <p className="text-sm text-gray-700 mt-1">
              {viewingRole?.description || "No description"}
            </p>
            {viewingRole?.isSystem && (
              <span className="inline-block mt-1 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px]">
                System role — has all permissions
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              Permissions ({viewingRole?.permissions?.length ?? 0})
            </p>
            <div className="max-h-72 overflow-y-auto space-y-3">
              {viewingRole?.permissions?.length ? (
                groupPermissions(viewingRole.permissions).map(([group, perms]) => (
                  <div key={group}>
                    <p className="font-semibold text-xs uppercase tracking-wide text-gray-500 mb-1">
                      {group}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {perms.map((p: any) => (
                        <span
                          key={p.permission.key}
                          className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[11px]"
                        >
                          {p.permission.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  This role has no permissions assigned.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setViewingRole(null)}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {menuUser && menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuUser(null)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border py-1 min-w-[170px]"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <button
              onClick={() => {
                startEdit(menuUser);
                setMenuUser(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Edit
            </button>
            {user?.isSuperuser && (
              <button
                onClick={() => {
                  openResetPassword(menuUser);
                  setMenuUser(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-amber-600 hover:bg-gray-100"
              >
                Reset Password
              </button>
            )}
            <button
              onClick={() => {
                toggleStatus(menuUser);
                setMenuUser(null);
              }}
              disabled={menuUser.id === user?.id}
              className={`w-full text-left px-4 py-2 text-sm ${
                menuUser.id === user?.id
                  ? "text-gray-300 cursor-not-allowed"
                  : menuUser.status === "ACTIVE"
                    ? "text-red-500 hover:bg-gray-100"
                    : "text-green-600 hover:bg-gray-100"
              }`}
            >
              {menuUser.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </button>
            <button
              onClick={() => {
                handleDelete(menuUser.id);
                setMenuUser(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-100"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
