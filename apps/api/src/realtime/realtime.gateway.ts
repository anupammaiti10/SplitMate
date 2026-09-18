import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly connectedUsers = new Map<string, Socket>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token;

      if (!token || typeof token !== 'string') {
        this.logger.warn(
          `Client ${client.id} disconnected: No token provided`,
        );
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });

      client.data.userId = payload.sub;
      this.connectedUsers.set(payload.sub, client);

      this.logger.log(
        `Client connected: ${client.id} (userId: ${payload.sub})`,
      );
    } catch (error) {
      this.logger.warn(
        `Client ${client.id} disconnected: Invalid token`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.delete(userId);
      this.logger.log(
        `Client disconnected: ${client.id} (userId: ${userId})`,
      );
    } else {
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('joinGroup')
  async handleJoinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ): Promise<{ success: boolean; message: string }> {
    const userId = client.data.userId;

    if (!userId) {
      return { success: false, message: 'Unauthorized' };
    }

    const groupId = typeof data === 'string' ? data : data?.groupId;

    if (!groupId) {
      return { success: false, message: 'groupId is required' };
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!membership) {
      return {
        success: false,
        message: 'You are not a member of this group',
      };
    }

    client.join(`group:${groupId}`);
    this.logger.log(
      `Client ${client.id} joined group ${groupId}`,
    );

    return { success: true, message: 'Joined group successfully' };
  }

  @SubscribeMessage('leaveGroup')
  handleLeaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ): { success: boolean; message: string } {
    const groupId = typeof data === 'string' ? data : data?.groupId;
    if (!groupId) {
      return { success: false, message: 'groupId is required' };
    }
    client.leave(`group:${groupId}`);
    this.logger.log(
      `Client ${client.id} left group ${groupId}`,
    );

    return { success: true, message: 'Left group successfully' };
  }

  emitToGroup(groupId: string, event: string, payload: any): void {
    this.server.to(`group:${groupId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: any): void {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit(event, payload);
    }
  }
}
