import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

const numericTransformer = {
  to: (value?: string | number | null) =>
    typeof value === 'number' ? value : (value ?? null),
  from: (value: string | null): string | null => value,
};

@Entity({ name: 'wallet_events' })
@Index('idx_wallet_events_wallet', ['walletId'])
@Index('idx_wallet_events_request', ['requestId'])
export class WalletEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  walletId!: string;

  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  @Column({
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  amount: string | null = null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null = null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  requestId: string | null = null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
