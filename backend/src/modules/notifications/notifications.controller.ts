import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  NotificationDeliveryListResponseDto,
  NotificationDeliveryQueryDto,
  NotificationListResponseDto,
  NotificationPreferenceResponseDto,
  NotificationPreferenceUpdateDto,
  NotificationQueryDto,
  NotificationResponseDto,
  NotificationUnreadCountResponseDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

const allUserRoles = [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR, RoleName.MANAGER, RoleName.EMPLOYEE];

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Roles(...allUserRoles)
  @ApiOperation({ summary: 'List current user in-app notifications' })
  @ApiOkResponse({ type: NotificationListResponseDto })
  list(@Query() query: NotificationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(query, user);
  }

  @Get('unread-count')
  @Roles(...allUserRoles)
  @ApiOperation({ summary: 'Get current user unread notification count' })
  @ApiOkResponse({ type: NotificationUnreadCountResponseDto })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.service.unreadCount(user);
  }

  @Patch(':id/read')
  @Roles(...allUserRoles)
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiOkResponse({ type: NotificationResponseDto })
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.markRead(id, user);
  }

  @Patch(':id/unread')
  @Roles(...allUserRoles)
  @ApiOperation({ summary: 'Mark one notification as unread' })
  @ApiOkResponse({ type: NotificationResponseDto })
  markUnread(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.markUnread(id, user);
  }

  @Post('read-all')
  @Roles(...allUserRoles)
  @ApiOperation({ summary: 'Mark all current user notifications as read' })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.service.markAllRead(user);
  }
}

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly service: NotificationsService) {}

  @Get('me')
  @Roles(...allUserRoles)
  @ApiOperation({ summary: 'Get current user notification preferences' })
  @ApiOkResponse({ type: NotificationPreferenceResponseDto })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getPreference(user);
  }

  @Patch('me')
  @Roles(...allUserRoles)
  @ApiOperation({ summary: 'Update current user notification preferences' })
  @ApiOkResponse({ type: NotificationPreferenceResponseDto })
  updateMe(@Body() dto: NotificationPreferenceUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updatePreference(user, dto);
  }
}

@ApiTags('Notification Deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notification-deliveries')
export class NotificationDeliveriesController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List notification delivery diagnostics without provider secrets' })
  @ApiOkResponse({ type: NotificationDeliveryListResponseDto })
  list(@Query() query: NotificationDeliveryQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listDeliveries(query, user);
  }

  @Get('email-capability')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Get safe email notification capability status' })
  capability() {
    return this.service.emailCapability();
  }
}
