import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '@wsf/api/core';
import {
  workspaceStatusSchema,
  type WorkspaceStatus,
} from '@wsf/shared/schemas';

@Controller('status')
class StatusController {
  @Get()
  @Public()
  getStatus(): WorkspaceStatus {
    return workspaceStatusSchema.parse({ status: 'ok', service: 'api' });
  }
}

@Module({ controllers: [StatusController] })
export class StatusModule {}
