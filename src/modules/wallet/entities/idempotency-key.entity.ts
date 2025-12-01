import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

@Entity({ name: 'idempotency_keys' })
@Index('idx_idempotency_created_at', ['createdAt'])
export class IdempotencyKeyEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string; // client-provided idempotency key

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestHash: string | null = null;

  @Column({ type: 'varchar', length: 16, default: 'processing' })
  status: IdempotencyStatus = 'processing';

  @Column({ type: 'simple-json', nullable: true })
  responseBody: unknown = null;

  @Column({ type: 'integer', nullable: true })
  responseStatus: number | null = null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  lockedAt: Date | null = null;
}
