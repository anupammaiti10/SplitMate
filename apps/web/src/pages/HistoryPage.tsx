import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import  api  from '../lib/api';
import type { HistoryEntry } from '../types';

function formatCurrency(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function HistoryIcon({ type }: { type: HistoryEntry['type'] }) {
  if (type === 'expense') {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
        <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

function TypeBadge({ type }: { type: HistoryEntry['type'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        type === 'expense' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
      }`}
    >
      {type === 'expense' ? 'Expense' : 'Settlement'}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900">Something went wrong</h3>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900">No history yet</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        Your expenses and settlements will appear here once you start tracking.
      </p>
    </div>
  );
}

export default function HistoryPage() {
  const {
    data: history,
    isLoading,
    isError,
    error,
  } = useQuery<HistoryEntry[]>({
    queryKey: ['history'],
    queryFn: async () => {
      const res = await api.get('/history');
      return res.data.data;
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">History</h1>
        <p className="mt-1 text-sm text-gray-500">Track your expenses and settlements over time.</p>
      </div>

      {isLoading && <Skeleton />}

      {isError && (
        <ErrorState message={error?.message ?? 'Failed to load history. Please try again.'} />
      )}

      {!isLoading && !isError && history && history.length === 0 && <EmptyState />}

      {!isLoading && !isError && history && history.length > 0 && (
        <div className="relative">
          <div className="absolute left-5 top-0 h-full w-px bg-gray-200" />

          <div className="space-y-1">
            {history.map((entry) => (
              <div key={entry.id} className="relative flex gap-4 py-3">
                <div className="relative z-10">
                  <HistoryIcon type={entry.type} />
                </div>

                <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 transition hover:shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <TypeBadge type={entry.type} />
                        <span className="text-xs text-gray-400">{formatDate(entry.date)}</span>
                      </div>

                      <Link
                        to={`/groups/${entry.groupId}`}
                        className="mt-2 block truncate text-sm font-medium text-blue-600 hover:underline"
                      >
                        {entry.groupName}
                      </Link>

                      <p className="mt-1 truncate text-sm text-gray-600">{entry.description}</p>

                      {entry.counterparty && (
                        <p className="mt-1 text-xs text-gray-400">
                          {entry.type === 'expense' ? 'with' : 'to'} {entry.counterparty.name}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-base font-semibold ${
                          entry.type === 'expense' ? 'text-blue-600' : 'text-green-600'
                        }`}
                      >
                        {formatCurrency(entry.amount)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
