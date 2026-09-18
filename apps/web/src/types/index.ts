export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  memberCount?: number;
  expenseCount?: number;
}

export interface GroupDetail extends Group {
  members: User[];
  expenses: Expense[];
}

export interface Expense {
  id: string;
  groupId: string;
  createdById: string;
  description: string;
  amount: number;
  paidById: string;
  expenseDate: string;
  splitType: string;
  createdAt: string;
  shares: ExpenseShare[];
  payer: User;
  creator: User;
}

export interface ExpenseShare {
  id: string;
  expenseId: string;
  userId: string;
  amount: number;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  createdAt: string;
  fromUser: User;
  toUser: User;
}

export interface Activity {
  id: string;
  groupId: string;
  actorId: string;
  type: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: User;
}

export interface MemberBalance {
  userId: string;
  name: string;
  netBalance: number;
}

export interface SimplifiedDebt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface UserGroupBalance {
  groupId: string;
  groupName: string;
  netBalance: number;
}

export interface DashboardData {
  totalOwed: number;
  totalYouOwe: number;
  netBalance: number;
  groupCount: number;
  topDebtGroup: UserGroupBalance | null;
  recentActivity: HistoryEntry[];
  groups: UserGroupBalance[];
}

export interface HistoryEntry {
  id: string;
  type: string;
  groupId: string;
  groupName: string;
  description: string;
  amount: number;
  date: string;
  counterparty?: { userId: string; name: string };
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
}
