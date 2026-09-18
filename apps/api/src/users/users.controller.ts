import { ClassSerializerInterceptor, Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser('userId') userId: string): Promise<UserResponseDto> {
    return this.usersService.findById(userId) as Promise<UserResponseDto>;
  }

  @Get('search')
  async search(
    @Query('q') query: string,
    @CurrentUser('userId') userId: string,
  ): Promise<UserResponseDto[]> {
    return this.usersService.search(query, userId) as Promise<UserResponseDto[]>;
  }
}
