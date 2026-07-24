import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto, BulkContactsDto, CreateContactTagDto, UpdateContactTagDto } from './contact.dto';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

// TenantOwnershipGuard is applied per-route (not at the controller level)
// because it only covers requests that actually carry a clientId — :id-based
// mutations below (update/remove by the contact's own id) don't, and would
// be wrongly blocked for tenant-scoped roles if the guard ran there too. See
// the guard's own doc comment for the residual gap this leaves.
@Controller('contacts')
export class ContactsController {
  constructor(private svc: ContactsService) { }

  @UseGuards(TenantOwnershipGuard)
  @Get() findAll(@Query('clientId') cid: string, @Query('tag') tag: string) { return this.svc.findAll(cid, tag); }

  @UseGuards(TenantOwnershipGuard)
  @Get('tags') getTags(@Query('clientId') cid: string) { return this.svc.getTags(cid); }

  @UseGuards(TenantOwnershipGuard)
  @Post('tags') createTag(@Body() dto: CreateContactTagDto) { return this.svc.createTag(dto); }

  @Patch('tags/:id') updateTag(@Param('id') id: string, @Body() dto: UpdateContactTagDto) {
    return this.svc.updateTag(id, dto);
  }

  @Delete('tags/:id') removeTag(@Param('id') id: string) { return this.svc.removeTag(id); }

  @UseGuards(TenantOwnershipGuard)
  @Get('count') async count(@Query('clientId') cid: string, @Query('tag') tags: string | string[]) {
    const tagArr = tags ? (Array.isArray(tags) ? tags : [tags]) : [];
    const count = await this.svc.countBySegment(cid, tagArr);
    return { count };
  }

  @UseGuards(TenantOwnershipGuard)
  @Post() create(@Body() dto: CreateContactDto) { return this.svc.create(dto); }

  @UseGuards(TenantOwnershipGuard)
  @Post('bulk') bulk(@Body() body: BulkContactsDto) { return this.svc.bulkUpsert(body.clientId, body.contacts); }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateContactDto) { return this.svc.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
