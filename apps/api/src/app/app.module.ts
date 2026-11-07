import { Module } from '@nestjs/common';
import { StatusModule } from '@wsf/api/feature-status';

@Module({
  imports: [StatusModule],
})
export class AppModule {}
