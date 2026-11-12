import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity({ name: 'email_verification_requests', schema: 'app' })
@Index('email_verification_requests_user_key', ['userId'], { unique: true })
export class EmailVerificationRequest extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'email_verification_requests_user_fk',
  })
  user!: User;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
