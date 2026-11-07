import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppSchema1760000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createSchema('app');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropSchema('app');
  }
}
