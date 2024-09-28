import { Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
export declare const airDropSol: (connection: Connection, publicKey: PublicKey, amount?: number) => Promise<void>;
export declare const airDropSolIfBalanceNotEnough: (connection: Connection, publicKey: PublicKey, balance?: number) => Promise<void>;
export declare const getOrCreateATA: (connection: Connection, mint: PublicKey, owner: PublicKey, payer: Keypair) => Promise<PublicKey>;
export declare const mockWallet: Wallet;
//# sourceMappingURL=index.d.ts.map