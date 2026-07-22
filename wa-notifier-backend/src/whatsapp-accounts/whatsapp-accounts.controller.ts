import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { WhatsAppAccountsService } from './whatsapp-accounts.service';
import { CreateWhatsAppAccountDto, EmbeddedSignupDto, PublicEmbeddedSignupDto, RegisterPhoneNumberDto, UpdateWhatsAppAccountDto } from './whatsapp-account.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';
import { WhatsAppAccountOwnershipGuard } from './whatsapp-account-ownership.guard';

// Kept at '/clients' for backward compatibility with the existing frontend;
// '/whatsapp-accounts' is the new preferred path and will become the only
// path once the frontend is migrated in the next phase.
@Controller(['clients', 'whatsapp-accounts'])
export class WhatsAppAccountsController {
  constructor(private svc: WhatsAppAccountsService) {}

  // Platform staff see every onboarded WhatsApp account; a tenant-scoped
  // user only ever sees their own tenant's — this is the actual boundary
  // the client-switcher UI relies on, not just a frontend filter.
  @Get()
  findAll(@CurrentUser() user: any) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.MASTER) return this.svc.findAll();
    return this.svc.findAllByTenant(user.tenantId);
  }

  @UseGuards(WhatsAppAccountOwnershipGuard)
  @Get(':id')
  findOne(@Param('id') id: string) { return this.svc.findOnePublic(id); }

  // A tenant-scoped user's own tenantId is stamped automatically — never
  // trusted from the request body, so a client can't create an account
  // under (or accidentally orphaned from) another tenant.
  @Post()
  create(@Body() dto: CreateWhatsAppAccountDto, @CurrentUser() user: any) {
    const tenantId = user.role === UserRole.ADMIN || user.role === UserRole.MASTER ? undefined : user.tenantId;
    return this.svc.create(dto, tenantId);
  }

  @Post('embedded-signup')
  embeddedSignup(@Body() dto: EmbeddedSignupDto, @CurrentUser() user: any) {
    const tenantId = user.role === UserRole.ADMIN || user.role === UserRole.MASTER ? undefined : user.tenantId;
    return this.svc.createFromEmbeddedSignup(dto, tenantId);
  }

  @Public()
  @Post('embedded-signup/public')
  publicEmbeddedSignup(@Body() dto: PublicEmbeddedSignupDto) {
    return this.svc.createFromPublicEmbeddedSignup(dto);
  }

  @UseGuards(WhatsAppAccountOwnershipGuard)
  @Post(':id/webhooks/subscribe')
  subscribeWebhooks(@Param('id') id: string) { return this.svc.subscribeWebhooks(id); }

  @UseGuards(WhatsAppAccountOwnershipGuard)
  @Post(':id/register')
  registerPhoneNumber(@Param('id') id: string, @Body() dto: RegisterPhoneNumberDto) {
    return this.svc.registerPhoneNumber(id, dto.pin);
  }

  @UseGuards(WhatsAppAccountOwnershipGuard)
  @Get(':id/sending-diagnostics')
  sendingDiagnostics(@Param('id') id: string) { return this.svc.diagnoseSending(id); }

  @UseGuards(WhatsAppAccountOwnershipGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWhatsAppAccountDto) { return this.svc.update(id, dto); }

  @UseGuards(WhatsAppAccountOwnershipGuard)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.remove(id); }
}
