import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'users', schema: 'app' })
@Index('users_email_key', ['email'], { unique: true })
@Check('users_email_normalized', `"email" = lower(btrim("email"))`)
@Check('users_status_check', `"status" IN ('active', 'disabled')`)
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'text', select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'disabled';
}
