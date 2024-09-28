import { BN, Program } from '@coral-xyz/anchor';
import { PublicKey, Connection, Cluster, Transaction } from '@solana/web3.js';
import { TokenInfo } from '@solana/spl-token-registry';
import { Mint } from '@solana/spl-token';
import VaultImpl from '@mercurial-finance/vault-sdk';
import { ActivationType, AmmImplementation, DepositQuote, LockEscrow, PoolInformation, PoolState, WithdrawQuote } from './types';
export default class AmmImpl implements AmmImplementation {
    address: PublicKey;
    private program;
    private vaultProgram;
    tokenAMint: Mint;
    tokenBMint: Mint;
    poolState: PoolState & {
        lpSupply: BN;
    };
    poolInfo: PoolInformation;
    vaultA: VaultImpl;
    vaultB: VaultImpl;
    private accountsInfo;
    private swapCurve;
    private depegAccounts;
    private opt;
    private constructor();
    static createConfig(connection: Connection, payer: PublicKey, tradeFeeBps: BN, protocolFeeBps: BN, vaultConfigKey: PublicKey, activationDuration: BN, poolCreatorAuthority: PublicKey, activationType: ActivationType, opt?: {
        cluster?: Cluster;
        programId?: string;
    }): Promise<Transaction>;
    static searchPoolsByToken(connection: Connection, tokenMint: PublicKey): Promise<import("@coral-xyz/anchor").ProgramAccount<{
        lpMint: PublicKey;
        tokenAMint: PublicKey;
        tokenBMint: PublicKey;
        aVault: PublicKey;
        bVault: PublicKey;
        aVaultLp: PublicKey;
        bVaultLp: PublicKey;
        aVaultLpBump: number;
        enabled: boolean;
        protocolTokenAFee: PublicKey;
        protocolTokenBFee: PublicKey;
        feeLastUpdatedAt: BN;
        padding0: number[];
        fees: {
            tradeFeeNumerator: BN;
            tradeFeeDenominator: BN;
            protocolTradeFeeNumerator: BN;
            protocolTradeFeeDenominator: BN;
        };
        poolType: ({
            permissionless?: undefined;
        } & {
            permissioned: Record<string, never>;
        }) | ({
            permissioned?: undefined;
        } & {
            permissionless: Record<string, never>;
        });
        stake: PublicKey;
        totalLockedLp: BN;
        bootstrapping: {
            activationPoint: BN;
            whitelistedVault: PublicKey;
            poolCreator: PublicKey;
            activationType: number;
        };
        padding: {
            padding0: number[];
            padding: BN[];
        };
        curveType: ({
            stable?: undefined;
        } & {
            constantProduct: Record<string, never>;
        }) | ({
            constantProduct?: undefined;
        } & {
            stable: {
                amp: BN;
                tokenMultiplier: {
                    tokenAMultiplier: BN;
                    tokenBMultiplier: BN;
                    precisionFactor: number;
                };
                depeg: {
                    baseVirtualPrice: BN;
                    baseCacheUpdated: BN;
                    depegType: unknown;
                };
                lastAmpUpdatedTimestamp: BN;
            };
        });
    }>[]>;
    static createPermissionlessConstantProductPoolWithConfig2(connection: Connection, payer: PublicKey, tokenAMint: PublicKey, tokenBMint: PublicKey, tokenAAmount: BN, tokenBAmount: BN, config: PublicKey, opt?: {
        cluster?: Cluster;
        programId?: string;
        lockLiquidity?: boolean;
        activationPoint?: BN;
    }): Promise<Transaction[]>;
    static createPermissionlessConstantProductPoolWithConfig(connection: Connection, payer: PublicKey, tokenAMint: PublicKey, tokenBMint: PublicKey, tokenAAmount: BN, tokenBAmount: BN, config: PublicKey, program: Program, opt?: {
        cluster?: Cluster;
        programId?: string;
        lockLiquidity?: boolean;
        skipAAta?: boolean;
        skipBAta?: boolean;
    }): Promise<Transaction[]>;
    static createPermissionlessPool(connection: Connection, payer: PublicKey, tokenInfoA: TokenInfo, tokenInfoB: TokenInfo, tokenAAmount: BN, tokenBAmount: BN, isStable: boolean, tradeFeeBps: BN, opt?: {
        programId?: string;
        skipAta?: boolean;
    }): Promise<Transaction>;
    static createMultiple(connection: Connection, poolList: Array<PublicKey>, opt?: {
        cluster?: Cluster;
        programId?: string;
    }): Promise<AmmImpl[]>;
    /**
     * Retrieves the pool configuration with the authority of the pool creator.
     *
     * @param {Connection} connection - The connection to the Solana network.
     * @param {PublicKey} wallet - The public key of the wallet.
     * @param {Object} [opt] - Optional parameters.
     * @return {Promise<Array<Account<Config>>>} A promise that resolves to an array of pool configuration accounts which the wallet can used to create pools.
     */
    static getPoolConfigsWithPoolCreatorAuthority(connection: Connection, wallet: PublicKey, opt?: {
        programId?: string;
    }): Promise<import("@coral-xyz/anchor").ProgramAccount<{
        poolFees: {
            tradeFeeNumerator: BN;
            tradeFeeDenominator: BN;
            protocolTradeFeeNumerator: BN;
            protocolTradeFeeDenominator: BN;
        };
        activationDuration: BN;
        vaultConfigKey: PublicKey;
        poolCreatorAuthority: PublicKey;
        activationType: number;
        padding: number[];
    }>[]>;
    static getPoolConfig(connection: Connection, config: PublicKey, opt?: {
        programId?: string;
    }): Promise<{
        poolFees: {
            tradeFeeNumerator: BN;
            tradeFeeDenominator: BN;
            protocolTradeFeeNumerator: BN;
            protocolTradeFeeDenominator: BN;
        };
        activationDuration: BN;
        vaultConfigKey: PublicKey;
        poolCreatorAuthority: PublicKey;
        activationType: number;
        padding: number[];
    }>;
    static getFeeConfigurations(connection: Connection, opt?: {
        programId?: string;
        cluster?: Cluster;
    }): Promise<{
        publicKey: PublicKey;
        tradeFeeBps: BN;
        protocolTradeFeeBps: BN;
    }[]>;
    static getLockedLpAmountByUser(connection: Connection, userPubKey: PublicKey, opt?: {
        programId?: string;
        cluster?: Cluster;
    }): Promise<Map<string, {
        pool: PublicKey;
        owner: PublicKey;
        escrowVault: PublicKey;
        bump: number;
        totalLockedAmount: BN;
        lpPerToken: BN;
        unclaimedFeePending: BN;
        aFee: BN;
        bFee: BN;
    }>>;
    static fetchMultipleUserBalance(connection: Connection, lpMintList: Array<PublicKey>, owner: PublicKey): Promise<Array<BN>>;
    static create(connection: Connection, pool: PublicKey, opt?: {
        programId?: string;
        vaultSeedBaseKey?: PublicKey;
        cluster?: Cluster;
    }): Promise<AmmImpl>;
    get decimals(): number;
    get isStablePool(): boolean;
    get isLST(): boolean;
    get feeBps(): BN;
    get depegToken(): Mint | null;
    private getLockedAtaAmount;
    getLockedLpAmount(): Promise<BN>;
    /**
     * It updates the state of the pool
     */
    updateState(): Promise<void>;
    /**
     * It returns the pool token mint.
     * @returns The poolState.lpMint
     */
    getPoolTokenMint(): PublicKey;
    /**
     * It gets the total supply of the LP token
     * @returns The total supply of the LP token.
     */
    getLpSupply(): Promise<BN>;
    /**
     * Get the user's balance by looking up the account associated with the user's public key
     * @param {PublicKey} owner - PublicKey - The public key of the user you want to get the balance of
     * @returns The amount of tokens the user has.
     */
    getUserBalance(owner: PublicKey): Promise<BN>;
    /**
     * `getSwapQuote` returns the amount of `outToken` that you will receive if you swap
     * `inAmountLamport` of `inToken` into the pool
     * @param {PublicKey} inTokenMint - The mint you want to swap from.
     * @param {BN} inAmountLamport - The amount of lamports you want to swap.
     * @param {number} [slippage] - The maximum amount of slippage you're willing to accept. (Max to 2 decimal place)
     * @returns The amount of the destination token that will be received after the swap.
     */
    getSwapQuote(inTokenMint: PublicKey, inAmountLamport: BN, slippage: number): {
        swapInAmount: BN;
        swapOutAmount: BN;
        minSwapOutAmount: BN;
        fee: BN;
        priceImpact: import("decimal.js").default;
    };
    /**
     * Get maximum in amount (source amount) for swap
     * !!! NOTE it is just estimation
     * @param tokenMint
     */
    getMaxSwapInAmount(tokenMint: PublicKey): BN;
    /**
     * `getMaxSwapOutAmount` returns the maximum amount of tokens that can be swapped out of the pool
     * @param {PublicKey} tokenMint - The mint of the token you want to swap out.
     * @returns The maximum amount of tokens that can be swapped out of the pool.
     */
    getMaxSwapOutAmount(tokenMint: PublicKey): BN;
    /**
     * `swap` is a function that takes in a `PublicKey` of the owner, a `PublicKey` of the input token
     * mint, an `BN` of the input amount of lamports, and an `BN` of the output amount of lamports. It
     * returns a `Promise<Transaction>` of the swap transaction
     * @param {PublicKey} owner - The public key of the user who is swapping
     * @param {PublicKey} inTokenMint - The mint of the token you're swapping from.
     * @param {BN} inAmountLamport - The amount of the input token you want to swap.
     * @param {BN} outAmountLamport - The minimum amount of the output token you want to receive.
     * @param {PublicKey} [referralOwner] - The referrer wallet will receive the host fee, fee will be transferred to ATA of referrer wallet.
     * @returns A transaction object
     */
    swap(owner: PublicKey, inTokenMint: PublicKey, inAmountLamport: BN, outAmountLamport: BN, referralOwner?: PublicKey): Promise<Transaction>;
    /**
     * `getDepositQuote` is a function that takes in a tokenAInAmount, tokenBInAmount, balance, and
     * slippage, and returns a poolTokenAmountOut, tokenAInAmount, and tokenBInAmount. `tokenAInAmount` or `tokenBAmount`
     * can be zero for balance deposit quote.
     * @param {BN} tokenAInAmount - The amount of token A to be deposit,
     * @param {BN} tokenBInAmount - The amount of token B to be deposit,
     * @param {boolean} [balance] - return false if the deposit is imbalance
     * @param {number} [slippage] - The amount of slippage you're willing to accept. (Max to 2 decimal place)
     * @returns The return value is a tuple of the poolTokenAmountOut, tokenAInAmount, and
     * tokenBInAmount.
     */
    getDepositQuote(tokenAInAmount: BN, tokenBInAmount: BN, balance: boolean, slippage: number): DepositQuote;
    /**
     * `deposit` creates a transaction that deposits `tokenAInAmount` and `tokenBInAmount` into the pool,
     * and mints `poolTokenAmount` of the pool's liquidity token
     * @param {PublicKey} owner - PublicKey - The public key of the user who is depositing liquidity
     * @param {BN} tokenAInAmount - The amount of token A you want to deposit
     * @param {BN} tokenBInAmount - The amount of token B you want to deposit
     * @param {BN} poolTokenAmount - The amount of pool tokens you want to mint.
     * @returns A transaction object
     */
    deposit(owner: PublicKey, tokenAInAmount: BN, tokenBInAmount: BN, poolTokenAmount: BN): Promise<Transaction>;
    /**
     * `getWithdrawQuote` is a function that takes in a withdraw amount and returns the amount of tokens
     * that will be withdrawn from the pool
     * @param {BN} withdrawTokenAmount - The amount of tokens you want to withdraw from the pool.
     * @param {PublicKey} [tokenMint] - The token you want to withdraw. If you want balanced withdraw, leave this blank.
     * @param {number} [slippage] - The amount of slippage you're willing to accept. (Max to 2 decimal place)
     * @returns The return value is a tuple of the poolTokenAmountIn, tokenAOutAmount, and
     * tokenBOutAmount.
     */
    getWithdrawQuote(withdrawTokenAmount: BN, slippage: number, tokenMint?: PublicKey): WithdrawQuote;
    /**
     * `withdraw` is a function that takes in the owner's public key, the amount of tokens to withdraw,
     * and the amount of tokens to withdraw from each pool, and returns a transaction that withdraws the
     * specified amount of tokens from the pool
     * @param {PublicKey} owner - PublicKey - The public key of the user who is withdrawing liquidity
     * @param {BN} lpTokenAmount - The amount of LP tokens to withdraw.
     * @param {BN} tokenAOutAmount - The amount of token A you want to withdraw.
     * @param {BN} tokenBOutAmount - The amount of token B you want to withdraw,
     * @returns A transaction object
     */
    withdraw(owner: PublicKey, lpTokenAmount: BN, tokenAOutAmount: BN, tokenBOutAmount: BN): Promise<Transaction>;
    getUserLockEscrow(owner: PublicKey): Promise<LockEscrow | null>;
    /**
     * `lockLiquidity` is a function that lock liquidity in Meteora pool, owner is able to claim fee later,
     * @param {PublicKey} owner - PublicKey - The public key of the escrow's owner, who get the locked liquidity, and can claim fee later
     * @param {BN} amount - The amount of LP tokens to lock.
     * @param {BN} feePayer - The payer of that lock liquidity.
     * @returns A transaction object
     */
    lockLiquidity(owner: PublicKey, amount: BN, feePayer?: PublicKey): Promise<Transaction>;
    claimLockFee(owner: PublicKey, maxAmount: BN): Promise<Transaction>;
    private createATAPreInstructions;
    private calculateProtocolTradingFee;
    private calculateTradingFee;
    private computeActualInAmount;
    private getShareByAmount;
    private getAmountByShare;
}
//# sourceMappingURL=index.d.ts.map