import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GroupBalancesResponse,
  GroupBalanceWithDebts,
  SimplifiedDebt,
  UserOverallBalanceResponse,
  HistoryEntry,
} from './dto/balance-response.dto';

@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateGroupBalances(
    groupId: string,
  ): Promise<GroupBalancesResponse> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const [expenses, settlements, members] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId },
        select: {
          paidById: true,
          amount: true,
          shares: {
            select: { userId: true, amount: true },
          },
        },
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        select: { fromUserId: true, toUserId: true, amount: true },
      }),
      this.prisma.groupMember.findMany({
        where: { groupId },
        select: {
          userId: true,
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    const balanceMap = new Map<
      string,
      {
        name: string;
        totalPaid: number;
        totalOwed: number;
        totalSettledReceived: number;
        totalSettledSent: number;
      }
    >();

    for (const member of members) {
      balanceMap.set(member.userId, {
        name: member.user.name,
        totalPaid: 0,
        totalOwed: 0,
        totalSettledReceived: 0,
        totalSettledSent: 0,
      });
    }

    for (const expense of expenses) {
      const payer = balanceMap.get(expense.paidById);
      if (payer) {
        payer.totalPaid += expense.amount;
      }

      for (const share of expense.shares) {
        const member = balanceMap.get(share.userId);
        if (member) {
          member.totalOwed += share.amount;
        }
      }
    }

    for (const settlement of settlements) {
      const receiver = balanceMap.get(settlement.toUserId);
      if (receiver) {
        receiver.totalSettledReceived += settlement.amount;
      }

      const sender = balanceMap.get(settlement.fromUserId);
      if (sender) {
        sender.totalSettledSent += settlement.amount;
      }
    }

    let totalPositive = 0;
    let totalNegative = 0;

    const memberBalances = Array.from(balanceMap.entries()).map(
      ([userId, data]) => {
        const netBalance =
          data.totalPaid -
          data.totalOwed +
          data.totalSettledReceived -
          data.totalSettledSent;

        if (netBalance > 0) {
          totalPositive += netBalance;
        } else {
          totalNegative += netBalance;
        }

        return {
          userId,
          name: data.name,
          netBalance,
        };
      },
    );

    return {
      members: memberBalances,
      totalPositive,
      totalNegative,
    };
  }

  async simplifyDebts(groupId: string): Promise<SimplifiedDebt[]> {
    const { members } = await this.calculateGroupBalances(groupId);

    const debtors: { userId: string; balance: number }[] = [];
    const creditors: { userId: string; balance: number }[] = [];

    for (const member of members) {
      if (member.netBalance < 0) {
        debtors.push({ userId: member.userId, balance: member.netBalance });
      } else if (member.netBalance > 0) {
        creditors.push({ userId: member.userId, balance: member.netBalance });
      }
    }

    debtors.sort((a, b) => a.balance - b.balance);
    creditors.sort((a, b) => b.balance - a.balance);

    const debts: SimplifiedDebt[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const debtorAbs = Math.abs(debtor.balance);
      const transferAmount = Math.min(debtorAbs, creditor.balance);

      if (transferAmount > 0) {
        debts.push({
          fromUserId: debtor.userId,
          toUserId: creditor.userId,
          amount: transferAmount,
        });
      }

      debtor.balance += transferAmount;
      creditor.balance -= transferAmount;

      if (debtor.balance === 0) {
        i++;
      }
      if (creditor.balance === 0) {
        j++;
      }
    }

    return debts;
  }

  async getGroupBalanceWithDebts(
    groupId: string,
  ): Promise<GroupBalanceWithDebts> {
    const [balances, simplifiedDebts] = await Promise.all([
      this.calculateGroupBalances(groupId),
      this.simplifyDebts(groupId),
    ]);

    return { balances, simplifiedDebts };
  }

  async getUserOverallBalance(
    userId: string,
  ): Promise<UserOverallBalanceResponse> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      select: {
        groupId: true,
        group: { select: { id: true, name: true } },
      },
    });

    let totalOwed = 0;
    let totalYouOwe = 0;
    let netBalance = 0;

    const groups: { groupId: string; groupName: string; netBalance: number }[] =
      [];

    for (const membership of memberships) {
      const { members } = await this.calculateGroupBalances(
        membership.groupId,
      );

      const userMember = members.find((m) => m.userId === userId);
      const groupNet = userMember?.netBalance ?? 0;

      groups.push({
        groupId: membership.group.id,
        groupName: membership.group.name,
        netBalance: groupNet,
      });

      if (groupNet > 0) {
        totalOwed += groupNet;
      } else if (groupNet < 0) {
        totalYouOwe += Math.abs(groupNet);
      }

      netBalance += groupNet;
    }

    return {
      totalOwed,
      totalYouOwe,
      netBalance,
      groups,
    };
  }

  async calculateUserNetBalanceInGroup(
    userId: string,
    groupId: string,
  ): Promise<number> {
    const { members } = await this.calculateGroupBalances(groupId);
    const userMember = members.find((m) => m.userId === userId);
    return userMember?.netBalance ?? 0;
  }

  async getUserHistory(userId: string): Promise<HistoryEntry[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });

    const groupIds = memberships.map((m) => m.groupId);

    if (groupIds.length === 0) {
      return [];
    }

    const [expenses, settlements] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          groupId: { in: groupIds },
          OR: [
            { paidById: userId },
            { shares: { some: { userId } } },
          ],
        },
        select: {
          id: true,
          description: true,
          amount: true,
          createdAt: true,
          groupId: true,
          group: { select: { name: true } },
          paidById: true,
          payer: { select: { id: true, name: true } },
          shares: {
            where: { userId },
            select: { amount: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.settlement.findMany({
        where: {
          groupId: { in: groupIds },
          OR: [
            { fromUserId: userId },
            { toUserId: userId },
          ],
        },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          groupId: true,
          group: { select: { name: true } },
          fromUserId: true,
          toUserId: true,
          fromUser: { select: { id: true, name: true } },
          toUser: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const entries: HistoryEntry[] = [];

    for (const expense of expenses) {
      const isPayer = expense.paidById === userId;
      const share = expense.shares[0];

      entries.push({
        id: expense.id,
        type: 'expense',
        groupId: expense.groupId,
        groupName: expense.group.name,
        description: expense.description,
        amount: isPayer ? expense.amount : share?.amount ?? 0,
        date: expense.createdAt.toISOString(),
        counterparty: isPayer
          ? undefined
          : { userId: expense.payer.id, name: expense.payer.name },
      });
    }

    for (const settlement of settlements) {
      const isSender = settlement.fromUserId === userId;
      const counterparty = isSender
        ? settlement.toUser
        : settlement.fromUser;

      entries.push({
        id: settlement.id,
        type: 'settlement',
        groupId: settlement.groupId,
        groupName: settlement.group.name,
        description: isSender ? 'You paid' : 'You received',
        amount: settlement.amount,
        date: settlement.createdAt.toISOString(),
        counterparty: {
          userId: counterparty.id,
          name: counterparty.name,
        },
      });
    }

    entries.sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return entries;
  }
}
