import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import api from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/hooks/useAuth";
import type {
  GroupDetail,
  Expense,
  MemberBalance,
  SimplifiedDebt,
  Activity,
  Settlement,
  PaginatedResponse,
  ApiResponse,
} from "@/types";

function formatCurrency(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg
          className="h-8 w-8 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900">
        Something went wrong
      </h3>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}

function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      <div className="relative mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BalanceBadge({ amount }: { amount: number }) {
  const isPositive = amount > 0;
  const isZero = amount === 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        isZero
          ? "bg-gray-100 text-gray-600"
          : isPositive
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700"
      )}
    >
      {isZero ? "Settled" : `${isPositive ? "+" : ""}${formatCurrency(amount)}`}
    </span>
  );
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "EXPENSE_ADDED":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
          <svg
            className="h-4 w-4 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      );
    case "EXPENSE_EDITED":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100">
          <svg
            className="h-4 w-4 text-yellow-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
            />
          </svg>
        </div>
      );
    case "EXPENSE_DELETED":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-4 w-4 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
        </div>
      );
    case "SETTLEMENT_RECORDED":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-4 w-4 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      );
    case "MEMBER_ADDED":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
          <svg
            className="h-4 w-4 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"
            />
          </svg>
        </div>
      );
    case "MEMBER_REMOVED":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
          <svg
            className="h-4 w-4 text-orange-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"
            />
          </svg>
        </div>
      );
    default:
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-4 w-4 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      );
  }
}

function activityDescription(activity: Activity): string {
  const meta = activity.metadata as Record<string, any>;
  switch (activity.type) {
    case "EXPENSE_ADDED":
      return `added an expense "${meta?.description || "Untitled"}"`;
    case "EXPENSE_EDITED":
      return `updated expense "${meta?.description || "Untitled"}"`;
    case "EXPENSE_DELETED":
      return `deleted expense "${meta?.description || "Untitled"}"`;
    case "SETTLEMENT_RECORDED":
      return `recorded a settlement`;
    case "MEMBER_ADDED":
      return `added ${meta?.memberName || "a member"}`;
    case "MEMBER_REMOVED":
      return `removed ${meta?.memberName || "a member"}`;
    default:
      return activity.type.replace(/\./g, " ");
  }
}

function AddExpenseForm({
  groupId,
  members,
  expense,
  onSuccess,
  onCancel,
}: {
  groupId: string;
  members: { id: string; name: string }[];
  expense?: Expense;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(expense?.description || "");
  const [amountStr, setAmountStr] = useState(
    expense ? (expense.amount / 100).toFixed(2) : ""
  );
  const [expenseDate, setExpenseDate] = useState(
    expense?.expenseDate?.split("T")[0] ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      })()
  );
  const [paidById, setPaidById] = useState(expense?.paidById || members[0]?.id || "");
  const [splitType, setSplitType] = useState<"EQUAL" | "EXACT">(
    (expense?.splitType as "EQUAL" | "EXACT") || "EQUAL"
  );
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    expense?.shares?.map((s) => s.userId) || members.map((m) => m.id)
  );
  const [exactShares, setExactShares] = useState<Record<string, string>>(() => {
    if (expense?.shares) {
      const map: Record<string, string> = {};
      for (const s of expense.shares) {
        map[s.userId] = (s.amount / 100).toFixed(2);
      }
      return map;
    }
    return {};
  });
  const [error, setError] = useState("");

  const amount = Math.round(parseFloat(amountStr || "0") * 100);

  const sharesTotal = Object.values(exactShares).reduce(
    (sum, val) => sum + Math.round(parseFloat(val || "0") * 100),
    0
  );

  const sharesValid =
    splitType === "EQUAL" || (amount > 0 && sharesTotal === amount);

  const createMutation = useMutation({
    mutationFn: async () => {
      const shares =
        splitType === "EQUAL"
          ? selectedMembers.map((userId) => ({
              userId,
              amount: Math.round(amount / selectedMembers.length),
            }))
          : Object.entries(exactShares)
              .filter(([, val]) => parseFloat(val || "0") > 0)
              .map(([userId, val]) => ({
                userId,
                amount: Math.round(parseFloat(val) * 100),
              }));

      const payload: any = {
        description,
        amount,
        paidById,
        expenseDate,
        splitType,
        participantIds: splitType === "EQUAL" ? selectedMembers : undefined,
        shares: splitType === "EXACT" ? shares : undefined,
      };

      const response = expense
        ? await api.patch<ApiResponse<Expense>>(
            `/groups/${groupId}/expenses/${expense.id}`,
            payload
          )
        : await api.post<ApiResponse<Expense>>(
            `/groups/${groupId}/expenses`,
            payload
          );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupExpenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupBalances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupActivities", groupId] });
      onSuccess();
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to create expense."
      );
    },
  });

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (!paidById) {
      setError("Please select who paid");
      return;
    }
    if (splitType === "EQUAL" && selectedMembers.length === 0) {
      setError("Select at least one participant");
      return;
    }
    if (splitType === "EXACT" && !sharesValid) {
      setError("Shares must equal the total amount");
      return;
    }
    createMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
          placeholder="e.g. Dinner, Groceries, Uber ride"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount (₹)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date
          </label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Paid by
        </label>
        <select
          value={paidById}
          onChange={(e) => setPaidById(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Split type
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSplitType("EQUAL")}
            className={clsx(
              "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
              splitType === "EQUAL"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            )}
          >
            Equal
          </button>
          <button
            type="button"
            onClick={() => setSplitType("EXACT")}
            className={clsx(
              "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
              splitType === "EXACT"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            )}
          >
            Exact amounts
          </button>
        </div>
      </div>

      {splitType === "EQUAL" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Split among
          </label>
          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(m.id)}
                  onChange={() => toggleMember(m.id)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">{m.name}</span>
                {selectedMembers.includes(m.id) && amount > 0 && (
                  <span className="ml-auto text-xs text-gray-400">
                    {formatCurrency(
                      Math.round(amount / selectedMembers.length)
                    )}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {splitType === "EXACT" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Shares
          </label>
          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-24 truncate">
                  {m.name}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={exactShares[m.id] || ""}
                  onChange={(e) =>
                    setExactShares((prev) => ({
                      ...prev,
                      [m.id]: e.target.value,
                    }))
                  }
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                  placeholder="0.00"
                />
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
              <span className="text-gray-500">Total</span>
              <span
                className={clsx(
                  "font-medium",
                  sharesValid ? "text-green-600" : "text-red-600"
                )}
              >
                {formatCurrency(sharesTotal)}
                {amount > 0 && (
                  <span className="text-gray-400"> / {formatCurrency(amount)}</span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending || !sharesValid}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {createMutation.isPending
            ? expense
              ? "Updating..."
              : "Adding..."
            : expense
            ? "Update Expense"
            : "Add Expense"}
        </button>
      </div>
    </form>
  );
}

function AddMemberForm({
  groupId,
  onSuccess,
  onCancel,
}: {
  groupId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const addMutation = useMutation({
    mutationFn: async (memberEmail: string) => {
      const response = await api.post<ApiResponse<any>>(
        `/groups/${groupId}/members`,
        { email: memberEmail }
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      setEmail("");
      setError("");
      onSuccess();
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to add member."
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    addMutation.mutate(email.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Member email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
          placeholder="friend@email.com"
          autoFocus
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={addMutation.isPending || !email.trim()}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {addMutation.isPending ? "Adding..." : "Add Member"}
        </button>
      </div>
    </form>
  );
}

function SettleUpForm({
  groupId,
  members,
  onSuccess,
  onCancel,
}: {
  groupId: string;
  members: { id: string; name: string }[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [toUserId, setToUserId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [error, setError] = useState("");

  const settleMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiResponse<Settlement>>(
        `/groups/${groupId}/settlements`,
        {
          toUserId,
          amount: Math.round(parseFloat(amountStr) * 100),
        }
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupBalances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupSettlements", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupActivities", groupId] });
      setToUserId("");
      setAmountStr("");
      setError("");
      onSuccess();
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to record settlement."
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!toUserId) {
      setError("Select a recipient");
      return;
    }
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    settleMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pay to
        </label>
        <select
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
        >
          <option value="">Select member</option>
          {members
            .filter((m) => m.id !== toUserId || !toUserId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Amount (₹)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
          placeholder="0.00"
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={settleMutation.isPending || !toUserId || !amountStr}
          className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {settleMutation.isPending ? "Recording..." : "Record Settlement"}
        </button>
      </div>
    </form>
  );
}

function ExpenseItem({
  expense,
  currentUserId,
  isOwner,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  currentUserId?: string;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const canModify = currentUserId === expense.createdById || isOwner;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 transition hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {expense.description}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>Paid by {expense.payer?.name}</span>
            <span className="text-gray-300">|</span>
            <span>{formatFullDate(expense.expenseDate)}</span>
            <span className="text-gray-300">|</span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
              {expense.splitType === "EQUAL" ? "Equal" : "Exact"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
            {formatCurrency(expense.amount)}
          </p>
          {canModify && (
            <div className="flex gap-1">
              <button
                onClick={onEdit}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                title="Edit"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
                  />
                </svg>
              </button>
              <button
                onClick={onDelete}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                title="Delete"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showSettleUp, setShowSettleUp] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expensePage, setExpensePage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);

  const PAGE_SIZE = 10;

  const groupQuery = useQuery<GroupDetail>({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<
          Omit<GroupDetail, "members"> & {
            members: { groupId: string; userId: string; user: import("@/types").User }[];
          }
        >
      >(`/groups/${groupId}`);
      const data = response.data.data;
      return {
        ...data,
        members: data.members.map((m) => m.user),
      };
    },
    enabled: !!groupId,
  });

  const balancesQuery = useQuery<MemberBalance[]>({
    queryKey: ["groupBalances", groupId],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{ balances: { members: MemberBalance[] }; simplifiedDebts: any[] }>
      >(`/groups/${groupId}/balances`);
      return response.data.data.balances.members;
    },
    enabled: !!groupId,
  });

  const expensesQuery = useQuery<PaginatedResponse<Expense>>({
    queryKey: ["groupExpenses", groupId, expensePage],
    queryFn: async () => {
      const response = await api.get<ApiResponse<PaginatedResponse<Expense>>>(
        `/groups/${groupId}/expenses?page=${expensePage}&pageSize=${PAGE_SIZE}`
      );
      return response.data.data;
    },
    enabled: !!groupId,
  });

  const activitiesQuery = useQuery<PaginatedResponse<Activity>>({
    queryKey: ["groupActivities", groupId, activityPage],
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          data: Activity[];
          meta: { total: number; page: number; pageSize: number; totalPages: number };
        }>
      >(`/groups/${groupId}/activities?page=${activityPage}&pageSize=${PAGE_SIZE}`);
      const raw = response.data.data;
      return {
        items: raw.data,
        page: raw.meta.page,
        pageSize: raw.meta.pageSize,
        totalItems: raw.meta.total,
        totalPages: raw.meta.totalPages,
      };
    },
    enabled: !!groupId,
  });

  const settlementsQuery = useQuery<Settlement[]>({
    queryKey: ["groupSettlements", groupId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Settlement[]>>(
        `/groups/${groupId}/settlements`
      );
      return response.data.data;
    },
    enabled: !!groupId,
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      await api.delete(`/groups/${groupId}/expenses/${expenseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupExpenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupBalances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupActivities", groupId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/groups/${groupId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupBalances", groupId] });
    },
    onError: (err: any) => {
      alert(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to remove member."
      );
    },
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["group", groupId] });
    queryClient.invalidateQueries({ queryKey: ["groupBalances", groupId] });
    queryClient.invalidateQueries({ queryKey: ["groupExpenses", groupId] });
    queryClient.invalidateQueries({ queryKey: ["groupActivities", groupId] });
    queryClient.invalidateQueries({ queryKey: ["groupSettlements", groupId] });
  }, [queryClient, groupId]);

  useEffect(() => {
    if (!groupId) return;

    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit("joinGroup", { groupId });

    const events = [
      "group.expense.created",
      "group.expense.updated",
      "group.expense.deleted",
      "group.settlement.created",
      "member:added",
      "member:removed",
    ];

    const handler = () => invalidateAll();
    events.forEach((event) => socket.on(event, handler));

    return () => {
      socket.emit("leaveGroup", { groupId });
      events.forEach((event) => socket.off(event, handler));
    };
  }, [groupId, invalidateAll]);

  if (!groupId) {
    return <ErrorState message="Invalid group ID." />;
  }

  if (groupQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <div className="h-24 animate-pulse rounded-xl bg-gray-200" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
              <div className="h-64 animate-pulse rounded-xl bg-gray-200" />
            </div>
            <div className="space-y-6">
              <div className="h-40 animate-pulse rounded-xl bg-gray-200" />
              <div className="h-40 animate-pulse rounded-xl bg-gray-200" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (groupQuery.isError) {
    return (
      <ErrorState
        message={
          groupQuery.error?.message || "Failed to load group. Please try again."
        }
      />
    );
  }

  const group = groupQuery.data;
  if (!group) return null;

  const isOwner = user?.id === group.ownerId;
  const myBalance = balancesQuery.data?.find((b) => b.userId === user?.id);
  const myDebts =
    settlementsQuery.data?.filter((s) => s.fromUserId === user?.id) || [];
  const members = group.members || [];
  const expenses = expensesQuery.data?.items || [];
  const totalExpensePages = expensesQuery.data?.totalPages || 1;
  const activities = activitiesQuery.data?.items || [];
  const totalActivityPages = activitiesQuery.data?.totalPages || 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        onClick={() => navigate("/groups")}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
          />
        </svg>
        Back to groups
      </button>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                  />
                </svg>
                {members.length} members
              </span>
              {isOwner && (
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                  You are the owner
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {myBalance && (
        <div
          className={clsx(
            "mb-8 rounded-xl border p-6 shadow-sm",
            myBalance.netBalance > 0
              ? "border-green-200 bg-green-50"
              : myBalance.netBalance < 0
              ? "border-red-200 bg-red-50"
              : "border-gray-200 bg-white"
          )}
        >
          <h2 className="text-sm font-medium text-gray-500">Your Balance</h2>
          <p
            className={clsx(
              "mt-2 text-3xl font-bold",
              myBalance.netBalance > 0
                ? "text-green-700"
                : myBalance.netBalance < 0
                ? "text-red-700"
                : "text-gray-700"
            )}
          >
            {myBalance.netBalance >= 0 ? "+" : ""}
            {formatCurrency(myBalance.netBalance)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {myBalance.netBalance > 0
              ? "You are owed this amount"
              : myBalance.netBalance < 0
              ? "You owe this amount"
              : "You are all settled up"}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Expenses</h2>
              <button
                onClick={() => setShowAddExpense(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                Add Expense
              </button>
            </div>
            <div className="p-6">
              {expensesQuery.isLoading ? (
                <SectionSkeleton rows={4} />
              ) : expenses.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No expenses yet. Add your first expense to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {expenses.map((expense) => (
                    <ExpenseItem
                      key={expense.id}
                      expense={expense}
                      currentUserId={user?.id}
                      isOwner={isOwner}
                      onEdit={() => {
                        setEditingExpense(expense);
                        setShowAddExpense(true);
                      }}
                      onDelete={() => {
                        if (
                          window.confirm(
                            "Are you sure you want to delete this expense?"
                          )
                        ) {
                          deleteExpenseMutation.mutate(expense.id);
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {totalExpensePages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                  <button
                    onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                    disabled={expensePage === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 19.5L8.25 12l7.5-7.5"
                      />
                    </svg>
                    Previous
                  </button>
                  <span className="text-sm text-gray-500">
                    Page {expensePage} of {totalExpensePages}
                  </span>
                  <button
                    onClick={() =>
                      setExpensePage((p) =>
                        Math.min(totalExpensePages, p + 1)
                      )
                    }
                    disabled={expensePage === totalExpensePages}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Activity Feed
              </h2>
            </div>
            <div className="p-6">
              {activitiesQuery.isLoading ? (
                <SectionSkeleton rows={5} />
              ) : activities.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No activity yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      <ActivityIcon type={activity.type} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">
                            {activity.actor?.name}
                          </span>{" "}
                          {activityDescription(activity)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {formatDate(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalActivityPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                  <button
                    onClick={() =>
                      setActivityPage((p) => Math.max(1, p - 1))
                    }
                    disabled={activityPage === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 19.5L8.25 12l7.5-7.5"
                      />
                    </svg>
                    Previous
                  </button>
                  <span className="text-sm text-gray-500">
                    Page {activityPage} of {totalActivityPages}
                  </span>
                  <button
                    onClick={() =>
                      setActivityPage((p) =>
                        Math.min(totalActivityPages, p + 1)
                      )
                    }
                    disabled={activityPage === totalActivityPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Members & Balances
              </h2>
              <button
                onClick={() => setShowAddMember(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                Add
              </button>
            </div>
            <div className="p-6">
              {balancesQuery.isLoading ? (
                <SectionSkeleton rows={4} />
              ) : (
                <div className="space-y-3">
                  {members.map((member) => {
                    const balance = balancesQuery.data?.find(
                      (b) => b.userId === member.id
                    );
                    const netBalance = balance?.netBalance || 0;
                    const canRemove =
                      isOwner &&
                      member.id !== user?.id &&
                      netBalance === 0;

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700">
                            {member.name?.charAt(0).toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {member.name}
                              {member.id === user?.id && (
                                <span className="ml-1 text-xs text-gray-400">
                                  (you)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <BalanceBadge amount={netBalance} />
                          {canRemove && (
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Remove ${member.name} from this group?`
                                  )
                                ) {
                                  removeMemberMutation.mutate(member.id);
                                }
                              }}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                              title="Remove member"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Simplified Debts
              </h2>
            </div>
            <div className="p-6">
              {balancesQuery.isLoading ? (
                <SectionSkeleton rows={3} />
              ) : !balancesQuery.data ||
                balancesQuery.data.filter((b) => b.netBalance !== 0).length ===
                  0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  Everyone is settled up.
                </p>
              ) : (
                <SimplifiedDebtsList
                  balances={balancesQuery.data}
                  members={members}
                />
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Settle Up
              </h2>
              <button
                onClick={() => setShowSettleUp(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 transition"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Settle
              </button>
            </div>
            <div className="p-6">
              {settlementsQuery.isLoading ? (
                <SectionSkeleton rows={2} />
              ) : myDebts.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  No pending settlements from you.
                </p>
              ) : (
                <div className="space-y-3">
                  {myDebts.map((debt) => {
                    const toMember = members.find(
                      (m) => m.id === debt.toUserId
                    );
                    return (
                      <div
                        key={debt.id}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm text-gray-700">
                          You paid {toMember?.name || "Unknown"}
                        </span>
                        <span className="text-sm font-medium text-green-700">
                          {formatCurrency(debt.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showAddExpense}
        onClose={() => {
          setShowAddExpense(false);
          setEditingExpense(null);
        }}
        title={editingExpense ? "Edit Expense" : "Add Expense"}
      >
        <AddExpenseForm
          groupId={groupId}
          members={members}
          expense={editingExpense || undefined}
          onSuccess={() => {
            setShowAddExpense(false);
            setEditingExpense(null);
          }}
          onCancel={() => {
            setShowAddExpense(false);
            setEditingExpense(null);
          }}
        />
      </Modal>

      <Modal
        isOpen={showAddMember}
        onClose={() => setShowAddMember(false)}
        title="Add Member"
      >
        <AddMemberForm
          groupId={groupId}
          onSuccess={() => setShowAddMember(false)}
          onCancel={() => setShowAddMember(false)}
        />
      </Modal>

      <Modal
        isOpen={showSettleUp}
        onClose={() => setShowSettleUp(false)}
        title="Record Settlement"
      >
        <SettleUpForm
          groupId={groupId}
          members={members}
          onSuccess={() => setShowSettleUp(false)}
          onCancel={() => setShowSettleUp(false)}
        />
      </Modal>
    </div>
  );
}

function SimplifiedDebtsList({
  balances,
  members,
}: {
  balances: MemberBalance[];
  members: { id: string; name: string }[];
}) {
  const debtors = balances
    .filter((b) => b.netBalance < 0)
    .map((b) => ({ ...b, amount: Math.abs(b.netBalance) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.netBalance > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.netBalance - a.netBalance);

  const debts: { from: string; to: string; amount: number }[] = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const settleAmount = Math.min(debtors[di].amount, creditors[ci].netBalance);
    if (settleAmount > 0) {
      debts.push({
        from: debtors[di].name,
        to: creditors[ci].name,
        amount: settleAmount,
      });
    }
    debtors[di].amount -= settleAmount;
    creditors[ci].netBalance -= settleAmount;
    if (debtors[di].amount === 0) di++;
    if (creditors[ci].netBalance === 0) ci++;
  }

  if (debts.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-500">
        Everyone is settled up.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {debts.map((debt, idx) => (
        <div key={idx} className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-700">
              <span className="font-medium">{debt.from}</span>
              <span className="text-gray-400"> owes </span>
              <span className="font-medium">{debt.to}</span>
            </p>
          </div>
          <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
            {formatCurrency(debt.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
