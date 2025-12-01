import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'wallet_analytics' })
@Check('"totalDeposited" >= 0')
@Check('"totalWithdrawn" >= 0')
export class WalletAnalyticsEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  walletId!: string;

  @Column({ type: 'numeric', precision: 20, scale: 4, default: 0 })
  totalDeposited!: string;

  @Column({ type: 'numeric', precision: 20, scale: 4, default: 0 })
  totalWithdrawn!: string;

  @Column({ type: 'integer', default: 0 })
  withdrawalsCount!: number;

  @Column({ type: 'integer', default: 0 })
  depositsCount!: number;

  @Column({ type: 'boolean', default: false })
  flaggedForReview!: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
