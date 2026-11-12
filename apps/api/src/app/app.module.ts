import { Module } from '@nestjs/common';
import { StatusModule } from '@wsf/api/feature-status';
import { TasksModule } from '@wsf/api/feature-tasks';

@Module({
  imports: [StatusModule, TasksModule],
})
export class AppModule {}
