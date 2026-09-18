import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { DashboardData, HistoryEntry } from "../types";
import { getSocket } from "../lib/socket";
import { clsx } from "clsx";

function formatAmount(paise: number): string {
  const abs = Math.abs(paise / 100);
  const formatted = abs.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `₹${formatted}`;
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
  });
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
      <div className="mt-3 h-7 w-36 animate-pulse rounded bg-gray-200" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-5 w-40 animate-pulse rounded bg-gray-200" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonActivity() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-5 w-40 animate-pulse rounded bg-gray-200" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "expense":
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
          <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    case "settlement":
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
          <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  const { data, isLoading, isError, error } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await api.get("/dashboard");
      return res.data.data;
    },
  });

  const invalidateDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [queryClient]);

  useEffect(() => {
    const socket = getSocket();

    function onConnect() {
      setIsConnected(true);
      invalidateDashboard();
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (socket.connected) {
      setIsConnected(true);
    }

    if (!socket.connected) {
      socket.connect();
    }

    const dashboardEvents = [
      "group.expense.created",
      "group.expense.updated",
      "group.expense.deleted",
      "group.settlement.created",
      "member:added",
      "member:removed",
      "group:created",
      "group:deleted",
    ];

    const handler = () => invalidateDashboard();
    dashboardEvents.forEach((event) => socket.on(event, handler));

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      dashboardEvents.forEach((event) => socket.off(event, handler));
    };
  }, [invalidateDashboard]);

  const groupCount = data?.groupCount ?? data?.groups?.length ?? 0;
  const topDebtGroup = data?.topDebtGroup ?? null;
  const recentActivity = data?.recentActivity ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          <span
            className={clsx(
              "inline-block h-2.5 w-2.5 rounded-full",
              isConnected ? "bg-green-500" : "bg-red-400"
            )}
          />
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load dashboard.{" "}
          {(error as Error)?.message || "Please try again later."}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Total Owed to You
            </p>
            <p className="mt-1 text-2xl font-semibold text-green-600">
              {formatAmount(data?.totalOwed ?? 0)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total You Owe</p>
            <p className="mt-1 text-2xl font-semibold text-red-600">
              {formatAmount(data?.totalYouOwe ?? 0)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Net Balance</p>
            <p
              className={clsx(
                "mt-1 text-2xl font-semibold",
                (data?.netBalance ?? 0) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              )}
            >
              {(data?.netBalance ?? 0) >= 0 ? "+" : ""}
              {formatAmount(data?.netBalance ?? 0)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Groups</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {groupCount}
            </p>
            {topDebtGroup && (
              <p className="mt-1 text-xs text-red-500 truncate">
                Most owed in: {topDebtGroup.groupName} ({formatAmount(topDebtGroup.netBalance)})
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {isLoading ? (
            <SkeletonTable />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Group Balances</h2>
              {(data?.groups?.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  No groups yet. Create one to get started.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-gray-100">
                  <div className="flex items-center justify-between pb-2 text-xs font-medium text-gray-400">
                    <span>GROUP</span>
                    <span>NET BALANCE</span>
                  </div>
                  {data?.groups?.map((group) => {
                    const net = group.netBalance;
                    return (
                      <button
                        key={group.groupId}
                        onClick={() => navigate(`/groups/${group.groupId}`)}
                        className="flex w-full items-center justify-between py-3 text-left transition hover:bg-gray-50 -mx-2 px-2 rounded-lg"
                      >
                        <span className="text-sm font-medium text-gray-900">
                          {group.groupName}
                        </span>
                        <span
                          className={clsx(
                            "text-sm font-semibold",
                            net >= 0 ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {net >= 0 ? "+" : ""}
                          {formatAmount(net)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {isLoading ? (
            <SkeletonActivity />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
                {recentActivity.length > 0 && (
                  <button
                    onClick={() => navigate("/history")}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition"
                  >
                    View all
                  </button>
                )}
              </div>
              {recentActivity.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  No activity yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((entry: HistoryEntry) => (
                    <button
                      key={entry.id}
                      onClick={() => navigate(`/groups/${entry.groupId}`)}
                      className="flex w-full items-center gap-3 text-left transition hover:bg-gray-50 -mx-2 px-2 py-1 rounded-lg"
                    >
                      <ActivityIcon type={entry.type} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 truncate">
                          {entry.description}
                          {entry.counterparty && (
                            <span className="text-gray-400">
                              {" "}— {entry.counterparty.name}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{entry.groupName}</span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">{formatDate(entry.date)}</span>
                        </div>
                      </div>
                      <span
                        className={clsx(
                          "text-sm font-semibold shrink-0",
                          entry.type === "expense" ? "text-blue-600" : "text-green-600"
                        )}
                      >
                        {formatAmount(entry.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/groups")}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Create Group
          </button>
          <button
            onClick={() => navigate("/history")}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            View History
          </button>
        </div>
      </div>
    </div>
  );
}
