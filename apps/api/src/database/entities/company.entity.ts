import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'companies', schema: 'app' })
@Index('companies_slug_key', ['slug'], { unique: true })
export class Company extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;
}
