import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TransferStatus =
  | 'initiated'
  | 'debited'
  | 'credited'
  | 'failed'
  | 'compensated';

const numericTransformer = {
  to: (value?: string | number) =>
    typeof value === 'number' ? value : (value ?? '0'),
  from: (value: string): string => value,
};

@Entity({ name: 'transfers' })
@Check('"amount" > 0')
@Index('idx_transfers_from_to', ['fromWalletId', 'toWalletId'])
@Index('idx_transfers_status', ['status'])
export class TransferEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  fromWalletId!: string;

  @Column({ type: 'varchar', length: 128 })
  toWalletId!: string;

  @Column({
    type: 'numeric',
    precision: 20,
    scale: 4,
    transformer: numericTransformer,
  })
  amount!: string;

  @Column({ type: 'varchar', length: 16, default: 'initiated' })
  status: TransferStatus = 'initiated';

  @Column({ type: 'varchar', length: 128, nullable: true })
  requestId: string | null = null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null = null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
