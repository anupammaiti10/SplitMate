export interface MemberBalance {
  userId: string;
  name: string;
  netBalance: number;
}

export interface GroupBalancesResponse {
  members: MemberBalance[];
  totalPositive: number;
  totalNegative: number;
}

export interface SimplifiedDebt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface GroupBalanceWithDebts {
  balances: GroupBalancesResponse;
  simplifiedDebts: SimplifiedDebt[];
}

export interface UserGroupBalance {
  groupId: string;
  groupName: string;
  netBalance: number;
}

export interface UserOverallBalanceResponse {
  totalOwed: number;
  totalYouOwe: number;
  netBalance: number;
  groups: UserGroupBalance[];
}

export interface HistoryEntry {
  id: string;
  type: 'expense' | 'settlement';
  groupId: string;
  groupName: string;
  description: string;
  amount: number;
  date: string;
  counterparty?: {
    userId: string;
    name: string;
  };
}
