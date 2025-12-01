import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OutboxStatus = 'pending' | 'published' | 'failed';

@Entity({ name: 'outbox_messages' })
@Index('idx_outbox_status_created', ['status', 'createdAt'])
export class OutboxMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ type: 'simple-json' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: OutboxStatus = 'pending';

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamp', nullable: true })
  nextAttemptAt: Date | null = null;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null = null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null = null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
