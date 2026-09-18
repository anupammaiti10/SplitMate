import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api  from "../lib/api";
import { DashboardData } from "../types";
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

export default function DashboardPage() {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);

  const { data, isLoading, isError, error } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await api.get("/dashboard");
      return res.data.data;
    },
  });

  useEffect(() => {
    const socket = getSocket();

    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (socket.connected) {
      setIsConnected(true);
    }

    if (!socket.connected && !socket.connecting) {
      socket.connect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      )}

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
                  <div
                    key={group.groupId}
                    className="flex items-center justify-between py-3"
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
