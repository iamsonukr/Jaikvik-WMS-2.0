import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ChatbotRuleDocument = ChatbotRule & Document;

@Schema({ timestamps: true })
export class ChatbotRule {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) clientId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) keyword: string;         // exact or contains
  @Prop({ default: 'contains' }) matchType: string;  // exact | contains | starts_with
  @Prop({ required: true }) replyText: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) priority: number;
}

export const ChatbotRuleSchema = SchemaFactory.createForClass(ChatbotRule);
ChatbotRuleSchema.index({ clientId: 1, priority: 1 });
ChatbotRuleSchema.index({ tenantId: 1 });
