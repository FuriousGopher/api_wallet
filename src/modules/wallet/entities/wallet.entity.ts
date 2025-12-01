import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

const numericTransformer = {
  to: (value?: string | number) =>
    typeof value === 'number' ? value : (value ?? '0'),
  from: (value: string): string => value,
};

@Entity({ name: 'wallets' })
@Check('"balance" >= 0')
export class WalletEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Column({
    type: 'numeric',
    precision: 20,
    scale: 4,
    default: 0,
    transformer: numericTransformer,
  })
  balance!: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

  @VersionColumn()
  version!: number;
}
