import { Controller, Get, Module } from '@nestjs/common';
import {
  workspaceStatusSchema,
  type WorkspaceStatus,
} from '@wsf/shared/schemas';

@Controller('status')
class StatusController {
  @Get()
  getStatus(): WorkspaceStatus {
    return workspaceStatusSchema.parse({ status: 'ok', service: 'api' });
  }
}

@Module({ controllers: [StatusController] })
export class StatusModule {}
