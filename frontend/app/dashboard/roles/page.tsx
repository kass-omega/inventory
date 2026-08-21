"use client";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/app/components/ConfirmProvider";
import { useToast } from "@/app/components/ToastProvider";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import api, { markHandled } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import Loading from "../../components/Loading";
import Modal from "../../components/Modal";

interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  _count: { users: number };
  permissions: { permission: { key: string; label: string; group: string } }[];
}

interface Permission {
  id: number;
  key: string;
  label: string;
  group: string;
}

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [editing, setEditing] = useState<Role | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/roles"),
      api.get("/roles/permissions"),
    ])
      .then(([rRes, pRes]) => {
        setRoles(rRes.data);
        setPermissions(pRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, Permission[]> = {};
    for (const p of permissions) {
      (map[p.group] ||= []).push(p);
    }
    return map;
  }, [permissions]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setSelectedKeys(new Set());
    setError("");
    setMsg("");
    setShowModal(true);
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setName(role.name);
    setDescription(role.description || "");
    setSelectedKeys(new Set(role.permissions.map((p) => p.permission.key)));
    setError("");
    setMsg("");
    setShowModal(true);
  };

  const toggle = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (keys: string[]) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const save = async () => {
    setError("");
    setMsg("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      permissions: Array.from(selectedKeys),
    };
    try {
      if (editing) await api.put(`/roles/${editing.id}`, body);
      else await api.post("/roles", body);
      setMsg("Saved");
      load();
      setTimeout(() => {
        setShowModal(false);
        setMsg("");
      }, 700);
    } catch (e: any) {
      markHandled(e);
      setError(e.response?.data?.message || "Failed to save role");
    }
  };

  const remove = async (role: Role) => {
    const ok = await confirm(`Delete role "${role.name}"?`);
    if (!ok) return;
    try {
      await api.delete(`/roles/${role.id}`);
      load();
    } catch (e: any) {
      markHandled(e);
      toast.error(e.response?.data?.message || "Failed to delete role");
    }
  };

  if (!hasPermission("roles.manage")) {
    return (
      <div className="p-8 text-gray-500">
        You do not have permission to manage roles.
      </div>
    );
  }

  if (loading) return <Loading className="py-24" />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
          Roles & Permissions
        </h1>
        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Add Role
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-2 sm:p-3 md:p-4">Role</th>
              <th className="p-2 sm:p-3 md:p-4">Description</th>
              <th className="p-2 sm:p-3 md:p-4">Users</th>
              <th className="p-2 sm:p-3 md:p-4">Permissions</th>
              <th className="p-2 sm:p-3 md:p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-b hover:bg-gray-50">
                <td className="p-2 sm:p-3 md:p-4 font-medium whitespace-nowrap">
                  {role.name}
                  {role.isSystem && (
                    <span className="ml-2 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px]">
                      System
                    </span>
                  )}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-gray-600">
                  {role.description || "-"}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-gray-600">
                  {role._count?.users ?? 0}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-gray-600">
                  {role.permissions.length}
                </td>
                <td className="p-2 sm:p-3 md:p-4">
                  {!role.isSystem && (
                    <RowActionsMenu
                      items={[
                        { label: "Edit", onClick: () => openEdit(role) },
                        {
                          label: "Delete",
                          color: "text-red-500",
                          onClick: () => remove(role),
                        },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit Role — ${editing.name}` : "Add Role"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border p-2 rounded-lg w-full text-sm"
              placeholder="e.g. Cashier"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border p-2 rounded-lg w-full text-sm"
              placeholder="Optional"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2">
              Permissions
            </p>
            <div className="max-h-72 overflow-y-auto space-y-3 border rounded-lg p-3">
              {Object.entries(grouped).map(([group, perms]) => (
                <div key={group}>
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(perms.map((p) => p.key))}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {perms.every((p) => selectedKeys.has(p.key))
                        ? "Uncheck all"
                        : "Check all"}
                    </button>
                    <p className="font-semibold text-xs uppercase tracking-wide text-gray-500">
                      {group}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {perms.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(p.key)}
                          onChange={() => toggle(p.key)}
                          className="rounded"
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {msg && <p className="text-green-600 text-sm">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

