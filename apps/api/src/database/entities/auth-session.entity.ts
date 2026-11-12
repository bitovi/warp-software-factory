import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Membership } from './membership.entity';

@Entity({ name: 'auth_sessions', schema: 'app' })
export class AuthSession extends BaseEntity {
  @Column({ type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => Membership, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'membershipId',
    foreignKeyConstraintName: 'auth_sessions_membership_fk',
  })
  membership!: Membership;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
