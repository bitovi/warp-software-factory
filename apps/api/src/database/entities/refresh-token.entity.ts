import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AuthSession } from './auth-session.entity';
import { BaseEntity } from './base.entity';

@Entity({ name: 'refresh_tokens', schema: 'app' })
@Index('refresh_tokens_hash_key', ['tokenHash'], { unique: true })
@Index('refresh_tokens_session_idx', ['sessionId'])
export class RefreshToken extends BaseEntity {
  @Column({ type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => AuthSession, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'sessionId',
    foreignKeyConstraintName: 'refresh_tokens_session_fk',
  })
  session!: AuthSession;

  @Column({ type: 'varchar', length: 64, select: false })
  tokenHash!: string;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;
}
