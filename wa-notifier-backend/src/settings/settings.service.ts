import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformSettings, PlatformSettingsDocument } from './platform-settings.schema';

@Injectable()
export class SettingsService {
  constructor(@InjectModel(PlatformSettings.name) private model: Model<PlatformSettingsDocument>) {}

  async get() {
    const settings = await this.model.findOneAndUpdate(
      { key: 'default' },
      { $setOnInsert: { key: 'default' } },
      { new: true, upsert: true },
    );
    return settings;
  }

  async update(dto: Partial<Omit<PlatformSettings, 'key'>>) {
    return this.model.findOneAndUpdate({ key: 'default' }, dto, { new: true, upsert: true });
  }
}
