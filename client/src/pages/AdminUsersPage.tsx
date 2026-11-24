import { useState, useEffect } from "react";
import Heading from "@/components/Heading";
import Avatar from "@/components/Avatar";
import { useToast } from "@/lib/toast";
import { userAPI, type User } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    setLoading(true);
    userAPI
      .getAll(filter !== "ALL" ? { role: filter } : undefined)
      .then((r) => setUsers(r.data.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const toggleActive = async (user: User) => {
    try {
      const res = await userAPI.toggleActive(user.id);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, isActive: res.data.user.isActive } : u
        )
      );
      toast(`${user.name} ${res.data.user.isActive ? "activated" : "deactivated"}`);
    } catch {
      toast("Failed to update user");
    }
  };

  const changeRole = async (user: User, role: string) => {
    try {
      const res = await userAPI.update(user.id, { role });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: res.data.user.role } : u))
      );
      toast(`${user.name} is now ${role.replace("_", " ").toLowerCase()}`);
    } catch {
      toast("Failed to update role");
    }
  };

  const roleCounts = users.reduce(
    (acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <section className="page">
      <Heading title="Users & roles" sub="Overview of the campus food community." />
      <div className="role-cards four">
        <div>
          <span>Students</span>
          <b>{roleCounts["STUDENT"] || 0}</b>
          <small>Active accounts</small>
        </div>
        <div>
          <span>Faculty & Staff</span>
          <b>{(roleCounts["FACULTY"] || 0) + (roleCounts["STAFF"] || 0)}</b>
          <small>Canteen users</small>
        </div>
        <div>
          <span>Canteen owners</span>
          <b>{roleCounts["CANTEEN_OPERATOR"] || 0}</b>
          <small>Registered owners</small>
        </div>
        <div>
          <span>Administrators</span>
          <b>{roleCounts["ADMIN"] || 0}</b>
          <small>Platform control</small>
        </div>
      </div>
      <div className="chips">
        {["ALL", "STUDENT", "FACULTY", "STAFF", "CANTEEN_OPERATOR", "ADMIN"].map((r) => (
          <button key={r} className={filter === r ? "chip on" : "chip"} onClick={() => setFilter(r)}>
            {r === "ALL" ? "All" : r === "CANTEEN_OPERATOR" ? "Owner" : r.replace("_", " ")}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading">Loading users…</div>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Wallet</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <Avatar name={u.name} />
                      <b>{u.name}</b>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      className="role-select"
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                    >
                      {["STUDENT", "FACULTY", "STAFF", "CANTEEN_OPERATOR", "ADMIN"].map((r) => (
                        <option key={r} value={r}>
                          {r === "CANTEEN_OPERATOR" ? "OWNER" : r.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>₹{u.walletBalance}</td>
                  <td>
                    <span className={`status ${u.isActive !== false ? "status-completed" : "status-cancelled"}`}>
                      {u.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{u.createdAt ? timeAgo(u.createdAt) : "—"}</td>
                  <td>
                    <button className="table-btn" onClick={() => toggleActive(u)}>
                      {u.isActive !== false ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
