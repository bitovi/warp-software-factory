import { Controller, Get, Module } from '@nestjs/common';
import {
  workspaceStatusSchema,
  type WorkspaceStatus,
} from '@wsf/shared/schemas';
import { HealthController } from './health.controller';

@Controller('status')
class StatusController {
  @Get()
  getStatus(): WorkspaceStatus {
    return workspaceStatusSchema.parse({ status: 'ok', service: 'api' });
  }
}

@Module({ controllers: [StatusController, HealthController] })
export class StatusModule {}
