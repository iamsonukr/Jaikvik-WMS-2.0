import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import {
  BulkContactsDto,
  CommitContactImportDto,
  CreateContactSegmentDto,
  CreateContactDto,
  CreateContactTagDto,
  PreviewContactImportDto,
  UpdateContactSegmentDto,
  UpdateContactDto,
  UpdateContactTagDto,
} from './contact.dto';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';
import { ResourceOwnership } from '../common/decorators/resource-ownership.decorator';
import { ResourceOwnershipGuard } from '../common/guards/resource-ownership.guard';

// TenantOwnershipGuard is applied per-route (not at the controller level)
// because it only covers requests that actually carry a clientId — :id-based
// mutations below (update/remove by the contact's own id) don't, and would
// be wrongly blocked for tenant-scoped roles if the guard ran there too. See
// the guard's own doc comment for the residual gap this leaves.
@Controller('contacts')
export class ContactsController {
  constructor(private svc: ContactsService) { }

  @UseGuards(TenantOwnershipGuard)
  @Get() findAll(@Query('whatsappAccountId') aid: string, @Query('clientId') cid: string, @Query('tag') tag: string) {
    return this.svc.findAll(aid || cid, tag);
  }

  @UseGuards(TenantOwnershipGuard)
  @Get('tags') getTags(@Query('whatsappAccountId') aid: string, @Query('clientId') cid: string) {
    return this.svc.getTags(aid || cid);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('tags') createTag(@Body() dto: CreateContactTagDto) { return this.svc.createTag(dto); }

  @ResourceOwnership('contacttags')
  @UseGuards(ResourceOwnershipGuard)
  @Patch('tags/:id') updateTag(@Param('id') id: string, @Body() dto: UpdateContactTagDto) {
    return this.svc.updateTag(id, dto);
  }

  @ResourceOwnership('contacttags')
  @UseGuards(ResourceOwnershipGuard)
  @Delete('tags/:id') removeTag(@Param('id') id: string) { return this.svc.removeTag(id); }

  @UseGuards(TenantOwnershipGuard)
  @Get('count') async count(
    @Query('whatsappAccountId') aid: string,
    @Query('clientId') cid: string,
    @Query('tag') tags: string | string[],
    @Query('segmentId') segmentIds: string | string[],
    @Query('matchMode') matchMode: 'any' | 'all',
  ) {
    if (segmentIds) {
      const segmentArr = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
      const count = await this.svc.countBySegmentIds(aid || cid, segmentArr);
      return { count };
    }
    const tagArr = tags ? (Array.isArray(tags) ? tags : [tags]) : [];
    const count = await this.svc.countBySegment(aid || cid, tagArr, matchMode);
    return { count };
  }

  @UseGuards(TenantOwnershipGuard)
  @Get('import/history') importHistory(@Query('whatsappAccountId') aid: string, @Query('clientId') cid: string) {
    return this.svc.importHistory(aid || cid);
  }

  @UseGuards(TenantOwnershipGuard)
  @Get('segments') getSegments(@Query('whatsappAccountId') aid: string, @Query('clientId') cid: string) {
    return this.svc.getSegments(aid || cid);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('segments') createSegment(@Body() dto: CreateContactSegmentDto) {
    return this.svc.createSegment(dto);
  }

  @ResourceOwnership('contactsegments')
  @UseGuards(ResourceOwnershipGuard)
  @Patch('segments/:id') updateSegment(@Param('id') id: string, @Body() dto: UpdateContactSegmentDto) {
    return this.svc.updateSegment(id, dto);
  }

  @ResourceOwnership('contactsegments')
  @UseGuards(ResourceOwnershipGuard)
  @Delete('segments/:id') removeSegment(@Param('id') id: string) {
    return this.svc.removeSegment(id);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post() create(@Body() dto: CreateContactDto) { return this.svc.create(dto); }

  @UseGuards(TenantOwnershipGuard)
  @Post('import/preview') previewImport(@Body() body: PreviewContactImportDto) {
    return this.svc.previewImport(body.whatsappAccountId || body.clientId, body.contacts, {
      fileName: body.fileName,
      mapping: body.mapping,
    });
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('import/commit') commitImport(@Body() body: CommitContactImportDto) {
    return this.svc.commitImport(body.whatsappAccountId || body.clientId, body.contacts, {
      fileName: body.fileName,
      mapping: body.mapping,
      updateExisting: body.updateExisting,
    });
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('bulk') bulk(@Body() body: BulkContactsDto) {
    return this.svc.bulkUpsert(body.whatsappAccountId || body.clientId, body.contacts);
  }

  @ResourceOwnership('contacts')
  @UseGuards(ResourceOwnershipGuard)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateContactDto) { return this.svc.update(id, dto); }

  @ResourceOwnership('contacts')
  @UseGuards(ResourceOwnershipGuard)
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
