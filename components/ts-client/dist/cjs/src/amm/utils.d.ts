import { VaultState, VaultIdl } from '@mercurial-finance/vault-sdk';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import { RawAccount } from '@solana/spl-token';
import { AccountInfo, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { SwapCurve } from './curve';
import { AmmProgram, ConstantProductCurve, DepegLido, DepegMarinade, DepegNone, DepegSplStake, PoolInformation, PoolState, StableSwapCurve, SwapQuoteParam, SwapResult, TokenMultiplier } from './types';
import { Amm as AmmIdl } from './idl';
import { TokenInfo } from '@solana/spl-token-registry';
export declare const createProgram: (connection: Connection, programId?: string) => {
    provider: AnchorProvider;
    ammProgram: Program<AmmIdl>;
    vaultProgram: Program<VaultIdl>;
};
/**
 * It takes an amount and a slippage rate, and returns the maximum amount that can be received with
 * that slippage rate
 * @param {BN} amount - The amount of tokens you want to buy.
 * @param {number} slippageRate - The maximum percentage of slippage you're willing to accept. (Max to 2 decimal place)
 * @returns The maximum amount of tokens that can be bought with the given amount of ETH, given the
 * slippage rate.
 */
export declare const getMaxAmountWithSlippage: (amount: BN, slippageRate: number) => BN;
/**
 * It takes an amount and a slippage rate, and returns the minimum amount that will be received after
 * slippage
 * @param {BN} amount - The amount of tokens you want to sell.
 * @param {number} slippageRate - The percentage of slippage you're willing to accept. (Max to 2 decimal place)
 * @returns The minimum amount that can be received after slippage is applied.
 */
export declare const getMinAmountWithSlippage: (amount: BN, slippageRate: number) => BN;
export declare const getAssociatedTokenAccount: (tokenMint: PublicKey, owner: PublicKey) => PublicKey;
export declare const getOrCreateATAInstruction: (tokenMint: PublicKey, owner: PublicKey, connection: Connection, payer?: PublicKey) => Promise<[PublicKey, TransactionInstruction?]>;
export declare const deriveLockEscrowPda: (pool: PublicKey, owner: PublicKey, ammProgram: PublicKey) => [PublicKey, number];
export declare const wrapSOLInstruction: (from: PublicKey, to: PublicKey, amount: bigint) => TransactionInstruction[];
export declare const unwrapSOLInstruction: (owner: PublicKey) => Promise<TransactionInstruction | null>;
export declare const deserializeAccount: (data: Buffer | undefined) => RawAccount | undefined;
export declare const getOnchainTime: (connection: Connection) => Promise<number>;
/**
 * Compute "actual" amount deposited to vault (precision loss)
 * @param depositAmount
 * @param beforeAmount
 * @param vaultLpBalance
 * @param vaultLpSupply
 * @param vaultTotalAmount
 * @returns
 */
export declare const computeActualDepositAmount: (depositAmount: BN, beforeAmount: BN, vaultLpBalance: BN, vaultLpSupply: BN, vaultTotalAmount: BN) => BN;
/**
 * Compute pool information, Typescript implementation of https://github.com/mercurial-finance/mercurial-dynamic-amm/blob/main/programs/amm/src/lib.rs#L960
 * @param {number} currentTime - the on solana chain time in seconds (SYSVAR_CLOCK_PUBKEY)
 * @param {BN} poolVaultALp - The amount of LP tokens in the pool for token A
 * @param {BN} poolVaultBLp - The amount of Lp tokens in the pool for token B,
 * @param {BN} vaultALpSupply - The total amount of Vault A LP tokens in the pool.
 * @param {BN} vaultBLpSupply - The total amount of Vault B LP token in the pool.
 * @param {BN} poolLpSupply - The total amount of LP tokens in the pool.
 * @param {SwapCurve} swapCurve - SwapCurve - the swap curve used to calculate the virtual price
 * @param {VaultState} vaultA - VaultState of vault A
 * @param {VaultState} vaultB - VaultState of Vault B
 * @returns an object of type PoolInformation.
 */
export declare const calculatePoolInfo: (currentTimestamp: BN, poolVaultALp: BN, poolVaultBLp: BN, vaultALpSupply: BN, vaultBLpSupply: BN, poolLpSupply: BN, swapCurve: SwapCurve, vaultA: VaultState, vaultB: VaultState) => PoolInformation;
export declare const calculateProtocolTradingFee: (amount: BN, poolState: PoolState) => BN;
export declare const calculateTradingFee: (amount: BN, poolState: PoolState) => BN;
export declare const calculateUnclaimedLockEscrowFee: (totalLockedAmount: BN, lpPerToken: BN, unclaimedFeePending: BN, currentVirtualPrice: BN) => BN;
/**
 * "Calculate the maximum amount of tokens that can be swapped out of a pool."
 *
 * @param {PublicKey} tokenMint - The mint that want to swap out
 * @param {PublicKey} tokenAMint - The public key of the token A mint.
 * @param {PublicKey} tokenBMint - The public key of the token B mint.
 * @param {BN} tokenAAmount - The amount of token A that the user wants to swap out.
 * @param {BN} tokenBAmount - The amount of token B that the user wants to swap out.
 * @param {BN} vaultAReserve - The amount of tokenA that the vault has in reserve.
 * @param {BN} vaultBReserve - The amount of tokenB that the vault has in reserve.
 * @returns The max amount of tokens that can be swapped out.
 */
export declare const calculateMaxSwapOutAmount: (tokenMint: PublicKey, tokenAMint: PublicKey, tokenBMint: PublicKey, tokenAAmount: BN, tokenBAmount: BN, vaultAReserve: BN, vaultBReserve: BN) => BN;
export declare const getStakePubkey: (poolState: PoolState) => PublicKey | null;
/**
 * It gets the account info that are used in depeg Pool
 * @param {Connection} connection - Connection - The connection to the Solana cluster
 * @param {PoolState[]} poolsState - Array of PoolState
 * @returns A map of the depeg accounts.
 */
export declare const getDepegAccounts: (connection: Connection, poolsState: PoolState[]) => Promise<Map<String, AccountInfo<Buffer>>>;
/**
 * It calculates the amount of tokens you will receive after swapping your tokens
 * @param {PublicKey} inTokenMint - The mint of the token you're swapping in.
 * @param {BN} inAmountLamport - The amount of the input token you want to swap.
 * @param {SwapQuoteParam} params - SwapQuoteParam
 * @param {PoolState} params.poolState - pool state that fetch from program
 * @param {VaultState} params.vaultA - vault A state that fetch from vault program
 * @param {VaultState} params.vaultB - vault B state that fetch from vault program
 * @param {BN} params.poolVaultALp - The amount of LP tokens in the pool for token A (`PoolState.aVaultLp` accountInfo)
 * @param {BN} params.poolVaultBLp - The amount of LP tokens in the pool for token B (`PoolState.bVaultLp` accountInfo)
 * @param {BN} params.vaultALpSupply - vault A lp supply (`VaultState.lpMint` accountInfo)
 * @param {BN} params.vaultBLpSupply - vault B lp supply (`VaultState.lpMint` accountInfo)
 * @param {BN} params.vaultAReserve - vault A reserve (`VaultState.tokenVault` accountInfo)
 * @param {BN} params.vaultBReserve - vault B reserve (`VaultState.tokenVault` accountInfo)
 * @param {BN} params.currentTime - on chain time (use `SYSVAR_CLOCK_PUBKEY`)
 * @param {BN} params.currentSlot - on chain slot (use `SYSVAR_CLOCK_PUBKEY`)
 * @param {BN} params.depegAccounts - A map of the depeg accounts. (get from `getDepegAccounts` util)
 * @returns The amount of tokens that will be received after the swap.
 */
export declare const calculateSwapQuote: (inTokenMint: PublicKey, inAmountLamport: BN, params: SwapQuoteParam) => SwapResult;
/**
 * It takes two numbers, and returns three numbers
 * @param {number} decimalA - The number of decimal places for token A.
 * @param {number} decimalB - The number of decimal places for token B.
 * @returns A TokenMultiplier object with the following properties:
 * - tokenAMultiplier
 * - tokenBMultiplier
 * - precisionFactor
 */
export declare const computeTokenMultiplier: (decimalA: number, decimalB: number) => TokenMultiplier;
/**
 * It fetches the pool account from the AMM program, and returns the mint addresses for the two tokens
 * @param {Connection} connection - Connection - The connection to the Solana cluster
 * @param {string} poolAddress - The address of the pool account.
 * @returns The tokenAMint and tokenBMint addresses for the pool.
 */
export declare function getTokensMintFromPoolAddress(connection: Connection, poolAddress: string, opt?: {
    programId?: string;
}): Promise<{
    tokenAMint: PublicKey;
    tokenBMint: PublicKey;
} | undefined>;
export declare function deriveMintMetadata(lpMint: PublicKey): [PublicKey, number];
export declare function derivePoolAddressWithConfig(tokenA: PublicKey, tokenB: PublicKey, config: PublicKey, programId: PublicKey): PublicKey;
export declare const deriveConfigPda: (index: BN, programId: PublicKey) => PublicKey;
export declare function derivePoolAddress(connection: Connection, tokenInfoA: TokenInfo, tokenInfoB: TokenInfo, isStable: boolean, tradeFeeBps: BN, opt?: {
    programId?: string;
}): PublicKey;
/**
 * It checks if a pool exists by checking if the pool account exists
 * @param {Connection} connection - Connection - the connection to the Solana cluster
 * @param {TokenInfo} tokenInfoA - TokenInfo
 * @param {TokenInfo} tokenInfoB - TokenInfo
 * @param {boolean} isStable - boolean - whether the pool is stable or not
 * @returns A boolean value.
 */
export declare function checkPoolExists(connection: Connection, tokenInfoA: TokenInfo, tokenInfoB: TokenInfo, isStable: boolean, tradeFeeBps: BN, opt?: {
    programId: string;
}): Promise<PublicKey | undefined>;
/**
 * It checks if a pool with config exists by checking if the pool account exists
 * @param {Connection} connection - Connection - the connection to the Solana cluster
 * @param {PublicKey} tokenA - TokenInfo
 * @param {PublicKey} tokenB - TokenInfo
 * @returns A PublicKey value or undefined.
 */
export declare function checkPoolWithConfigsExists(connection: Connection, tokenA: PublicKey, tokenB: PublicKey, configs: PublicKey[], opt?: {
    programId: string;
}): Promise<PublicKey | undefined>;
export declare function chunks<T>(array: T[], size: number): T[][];
export declare function chunkedFetchMultiplePoolAccount(program: AmmProgram, pks: PublicKey[], chunkSize?: number): Promise<({
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
} | null)[]>;
export declare function chunkedGetMultipleAccountInfos(connection: Connection, pks: PublicKey[], chunkSize?: number): Promise<(AccountInfo<Buffer> | null)[]>;
export declare function encodeCurveType(curve: StableSwapCurve | ConstantProductCurve): 0 | 1;
export declare function getSecondKey(key1: PublicKey, key2: PublicKey): Buffer;
export declare function getFirstKey(key1: PublicKey, key2: PublicKey): Buffer;
export declare function getTradeFeeBpsBuffer(curve: StableSwapCurve | ConstantProductCurve, tradeFeeBps: BN): Uint8Array;
export declare const DepegType: {
    none: () => DepegNone;
    marinade: () => DepegMarinade;
    lido: () => DepegLido;
    splStake: () => DepegSplStake;
};
export declare function generateCurveType(tokenInfoA: TokenInfo, tokenInfoB: TokenInfo, isStable: boolean): {
    stable: {
        amp: BN;
        tokenMultiplier: TokenMultiplier;
        depeg: {
            baseVirtualPrice: BN;
            baseCacheUpdated: BN;
            depegType: DepegNone;
        };
        lastAmpUpdatedTimestamp: BN;
    };
    constantProduct?: undefined;
} | {
    constantProduct: {};
    stable?: undefined;
};
//# sourceMappingURL=utils.d.ts.map