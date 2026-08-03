import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Contact, ContactSchema } from './contact.schema';
import { ContactTag, ContactTagSchema } from './contact-tag.schema';
import { ContactImport, ContactImportSchema } from './contact-import.schema';
import { ContactSegment, ContactSegmentSchema } from './contact-segment.schema';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contact.name, schema: ContactSchema },
      { name: ContactTag.name, schema: ContactTagSchema },
      { name: ContactImport.name, schema: ContactImportSchema },
      { name: ContactSegment.name, schema: ContactSegmentSchema },
    ]),
    WhatsAppAccountsModule,
  ],
  providers: [ContactsService, TenantOwnershipGuard],
  controllers: [ContactsController],
  exports: [ContactsService],
})
export class ContactsModule {}
