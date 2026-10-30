import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ErrorLog, ErrorLogSchema } from './error-log.schema';
import { ErrorLogsService } from './error-logs.service';
import { ErrorLogsController } from './error-logs.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: ErrorLog.name, schema: ErrorLogSchema }])],
  providers: [ErrorLogsService],
  controllers: [ErrorLogsController],
  exports: [ErrorLogsService],
})
export class ErrorLogsModule {}
