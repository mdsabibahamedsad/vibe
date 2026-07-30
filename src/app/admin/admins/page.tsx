"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

interface AdminUser {
  id: string;
  display_name: string;
  telegram_username: string | null;
  role: string;
}

interface RolePermissions {
  role: string;
  permissions: string[];
}

export default function AdminManagementPage() {
  const { user } = useCurrentUser();
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RolePermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/roles");
      const json = await res.json();
      if (json.success) {
        setAdminUsers(json.data.adminUsers ?? []);
        setRoles(json.data.roles ?? []);
      } else {
        setError(json.error ?? "Failed to load data");
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(userId: string, newRole: string) {
    if (!confirm(`Change this user's role to ${newRole}?`)) return;
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_role", userId, role: newRole }),
      });
      const json = await res.json();
      if (json.success) {
        fetchData();
      } else {
        alert(json.error ?? "Failed to change role");
      }
    } catch {
      alert("Failed to change role");
    }
  }

  if (!user || !canSync(user.role, Permissions.ADMIN_MANAGE)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  const roleColors: Record<string, string> = {
    super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    moderator: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    support: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Management</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage admin roles and permissions. Changes are audited.
        </p>
      </div>

      {loading ? (
        <Loading message="Loading admin data..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={fetchData} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Admin Users */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Admin Staff ({adminUsers.length})
            </h2>
            {adminUsers.length === 0 ? (
              <EmptyState title="No admin staff" description="No admin users found." />
            ) : (
              <div className="space-y-3">
                {adminUsers.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {admin.display_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        @{admin.telegram_username ?? "no username"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[admin.role] ?? ""}`}>
                        {admin.role.replace("_", " ")}
                      </span>
                      {user.role === "super_admin" && (
                        <select
                          value={admin.role}
                          onChange={(e) => changeRole(admin.id, e.target.value)}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                          <option value="user">User</option>
                          <option value="support">Support</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Role Permissions */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Role Permissions
            </h2>
            {roles.length === 0 ? (
              <EmptyState title="No roles defined" description="Role permissions are not configured." />
            ) : (
              <div className="space-y-4">
                {roles.map((role) => (
                  <div key={role.role} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <h3 className={`text-sm font-semibold mb-2 capitalize ${roleColors[role.role]?.split(" ")[0]} px-2 py-0.5 rounded-full inline-block`}>
                      {role.role.replace("_", " ")}
                    </h3>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {role.permissions.map((perm) => (
                        <span
                          key={perm}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
