"use client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/app/components/ToastProvider";
import { useConfirm } from "@/app/components/ConfirmProvider";
import api, { markHandled } from "@/lib/api";
import { useEffect, useState } from "react";

export default function CategoriesManager() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [categories, setCategories] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [editName, setEditName] = useState("");

  const canCreate = hasPermission("categories.create");
  const canEdit = hasPermission("categories.edit");
  const canDelete = hasPermission("categories.delete");

  const fetchCategories = () =>
    api.get("/categories").then((r) => setCategories(r.data));

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/categories", { name: name.trim() });
      setName("");
      fetchCategories();
      toast.success("Category created");
    } catch (err: any) {
      markHandled(err);
      toast.error("Failed to create category");
    }
  };

  const startEdit = (c: any) => {
    setEditing(c);
    setEditName(c.name);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put("/categories/" + editing.id, { name: editName.trim() });
      setEditing(null);
      setEditName("");
      fetchCategories();
      toast.success("Category updated");
    } catch (err: any) {
      markHandled(err);
      toast.error("Failed to update category");
    }
  };

  const handleDelete = async (c: any) => {
    const ok = await confirm("Delete category " + c.name + "?");
    if (!ok) return;
    try {
      await api.delete("/categories/" + c.id);
      fetchCategories();
      toast.success("Category deleted");
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <h2 className="font-semibold text-gray-800">Categories</h2>
      </div>

      {canCreate && (
        <form onSubmit={handleCreate} className="flex gap-2 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            className="border p-2 rounded-lg flex-1 text-sm"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            Add
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Products</th>
              {(canEdit || canDelete) && <th className="p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {categories.map((c: any) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">
                  {editing?.id === c.id ? (
                    <form onSubmit={handleEdit} className="flex gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="border p-1.5 rounded flex-1 text-sm"
                      />
                      <button type="submit" className="text-green-600 px-2">
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="text-gray-500 px-2"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    c.name
                  )}
                </td>
                <td className="p-3 text-gray-600">
                  {c._count?.products ?? 0}
                </td>
                {(canEdit || canDelete) && (
                  <td className="p-3">
                    <div className="flex gap-2">
                      {canEdit && (
                        <button
                          onClick={() => startEdit(c)}
                          className="text-blue-600 text-sm"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(c)}
                          className="text-red-500 text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
