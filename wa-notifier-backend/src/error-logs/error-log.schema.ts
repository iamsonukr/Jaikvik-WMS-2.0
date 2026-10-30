import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ErrorLogDocument = ErrorLog & Document;

@Schema({ timestamps: true })
export class ErrorLog {
  @Prop({ required: true, default: 'error' }) level: string;
  @Prop({ required: true }) message: string;
  @Prop() context?: string;
  @Prop() stack?: string;
  @Prop() method?: string;
  @Prop() path?: string;
  @Prop() statusCode?: number;
}

export const ErrorLogSchema = SchemaFactory.createForClass(ErrorLog);
ErrorLogSchema.index({ createdAt: -1 });
