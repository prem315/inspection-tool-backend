import { Controller, Get, Patch, Post, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UsersService } from './users.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';

@ApiTags('Users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved.' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own profile' })
  @ApiResponse({ status: 200, description: 'Profile updated.' })
  async updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(userId, dto);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully.' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect.' })
  async changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(userId, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Soft-delete own account' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully.' })
  async deleteMe(@CurrentUser('id') userId: string) {
    return this.usersService.deleteMe(userId);
  }
}

@ApiTags('Admin Users')
@Controller('admin/users')
@UseGuards(RolesGuard)
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated list with filters' })
  @ApiResponse({ status: 200, description: 'List of users.' })
  async adminListUsers(@Query() query: ListUsersQueryDto) {
    return this.usersService.adminListUsers(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create user' })
  @ApiResponse({ status: 201, description: 'User created.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  async adminCreateUser(@Body() dto: AdminCreateUserDto) {
    return this.usersService.adminCreateUser(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiResponse({ status: 200, description: 'User retrieved.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async adminGetUser(@Param('id') id: string) {
    return this.usersService.adminGetUser(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated.' })
  async adminUpdateUser(@CurrentUser('id') actorId: string, @Param('id') targetId: string, @Body() dto: AdminUpdateUserDto) {
    return this.usersService.adminUpdateUser(actorId, targetId, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiResponse({ status: 200, description: 'User deactivated.' })
  async adminDeactivateUser(@CurrentUser('id') actorId: string, @Param('id') targetId: string) {
    return this.usersService.adminDeactivateUser(actorId, targetId);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate user' })
  @ApiResponse({ status: 200, description: 'User reactivated.' })
  async adminReactivateUser(@CurrentUser('id') actorId: string, @Param('id') targetId: string) {
    return this.usersService.adminReactivateUser(actorId, targetId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete user' })
  @ApiResponse({ status: 200, description: 'User deleted.' })
  async adminDeleteUser(@CurrentUser('id') actorId: string, @Param('id') targetId: string) {
    return this.usersService.adminDeleteUser(actorId, targetId);
  }
}
