import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlatformSettings, PlatformSettingsSchema } from './platform-settings.schema';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: PlatformSettings.name, schema: PlatformSettingsSchema }])],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
