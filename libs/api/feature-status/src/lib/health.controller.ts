import { Controller, Get } from '@nestjs/common';
import {
  workspaceHealthSchema,
  type WorkspaceHealth,
} from '@wsf/shared/schemas';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): WorkspaceHealth {
    return workspaceHealthSchema.parse({ status: 'ok' });
  }
}
