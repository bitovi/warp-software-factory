import { DynamicModule, Module, Type } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SignupService } from './signup.service';
import { SignupStore } from './signup.store';

@Module({})
export class AuthModule {
  static register(store: Type<SignupStore>): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [SignupService, { provide: SignupStore, useClass: store }],
    };
  }
}
