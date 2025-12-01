import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'consumed_events' })
@Index('idx_consumed_events_type', ['eventType'])
export class ConsumedEventEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  eventId!: string;

  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  @CreateDateColumn({ type: 'timestamp' })
  processedAt!: Date;
}
