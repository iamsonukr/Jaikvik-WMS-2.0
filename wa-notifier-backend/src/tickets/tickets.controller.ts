import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AssignTicketDto, CreateTicketDto, CreateTicketMessageDto, UpdateTicketDto } from './ticket.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private tickets: TicketsService) {}

  @Get()
  list(@CurrentUser() user: any, @Query() query: Record<string, string>) {
    return this.tickets.list(user, query);
  }

  @Get('masters')
  @Roles(UserRole.ADMIN)
  masters() {
    return this.tickets.masters();
  }

  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: any) {
    return this.tickets.create(dto, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tickets.findOne(id, user);
  }

  @Get(':id/messages')
  messages(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tickets.messages(id, user);
  }

  @Post(':id/messages')
  reply(@Param('id') id: string, @Body() dto: CreateTicketMessageDto, @CurrentUser() user: any) {
    return this.tickets.reply(id, dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentUser() user: any) {
    return this.tickets.update(id, dto, user);
  }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto, @CurrentUser() user: any) {
    return this.tickets.assign(id, dto, user);
  }
}
