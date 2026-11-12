import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';
import { User } from './user.entity';

@Entity({ name: 'memberships', schema: 'app' })
@Index('memberships_user_company_key', ['userId', 'companyId'], {
  unique: true,
})
@Check(
  'memberships_status_check',
  `"status" IN ('active', 'invited', 'disabled')`,
)
export class Membership extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'memberships_user_fk',
  })
  user!: User;

  @Column({ type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'companyId',
    foreignKeyConstraintName: 'memberships_company_fk',
  })
  company!: Company;

  @Column({ type: 'boolean', default: false })
  isOwner!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'invited' | 'disabled';
}
