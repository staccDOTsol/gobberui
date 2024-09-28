var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { getAmountByShare, calculateWithdrawableAmount, getUnmintAmount, IDL as VaultIDL, PROGRAM_ID as VAULT_PROGRAM_ID, } from '@mercurial-finance/vault-sdk';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, AccountLayout, NATIVE_MINT, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createCloseAccountInstruction, } from '@solana/spl-token';
import { PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, TransactionInstruction, } from '@solana/web3.js';
import invariant from 'invariant';
import { CURVE_TYPE_ACCOUNTS, ERROR, PROGRAM_ID, VIRTUAL_PRICE_PRECISION, PERMISSIONLESS_AMP, STABLE_SWAP_DEFAULT_TRADE_FEE_BPS, CONSTANT_PRODUCT_DEFAULT_TRADE_FEE_BPS, METAPLEX_PROGRAM, SEEDS, } from './constants';
import { ConstantProductSwap, StableSwap, TradeDirection } from './curve';
import { ActivationType, } from './types';
import { IDL as AmmIDL } from './idl';
import Decimal from 'decimal.js';
export const createProgram = (connection, programId) => {
    const provider = new AnchorProvider(connection, {}, AnchorProvider.defaultOptions());
    const ammProgram = new Program(AmmIDL, programId !== null && programId !== void 0 ? programId : PROGRAM_ID, provider);
    const vaultProgram = new Program(VaultIDL, VAULT_PROGRAM_ID, provider);
    return { provider, ammProgram, vaultProgram };
};
/**
 * It takes an amount and a slippage rate, and returns the maximum amount that can be received with
 * that slippage rate
 * @param {BN} amount - The amount of tokens you want to buy.
 * @param {number} slippageRate - The maximum percentage of slippage you're willing to accept. (Max to 2 decimal place)
 * @returns The maximum amount of tokens that can be bought with the given amount of ETH, given the
 * slippage rate.
 */
export const getMaxAmountWithSlippage = (amount, slippageRate) => {
    const slippage = ((100 + slippageRate) / 100) * 10000;
    return amount.mul(new BN(slippage)).div(new BN(10000));
};
/**
 * It takes an amount and a slippage rate, and returns the minimum amount that will be received after
 * slippage
 * @param {BN} amount - The amount of tokens you want to sell.
 * @param {number} slippageRate - The percentage of slippage you're willing to accept. (Max to 2 decimal place)
 * @returns The minimum amount that can be received after slippage is applied.
 */
export const getMinAmountWithSlippage = (amount, slippageRate) => {
    const slippage = ((100 - slippageRate) / 100) * 10000;
    return amount.mul(new BN(slippage)).div(new BN(10000));
};
export const getAssociatedTokenAccount = (tokenMint, owner) => {
    return getAssociatedTokenAddressSync(tokenMint, owner, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
};
export const getOrCreateATAInstruction = (tokenMint, owner, connection, payer) => __awaiter(void 0, void 0, void 0, function* () {
    let toAccount;
    try {
        toAccount = yield getAssociatedTokenAccount(tokenMint, owner);
        const account = yield connection.getAccountInfo(toAccount);
        if (!account) {
            const ix = createAssociatedTokenAccountInstruction(payer || owner, toAccount, owner, tokenMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
            return [toAccount, ix];
        }
        return [toAccount, undefined];
    }
    catch (e) {
        /* handle error */
        console.error('Error::getOrCreateATAInstruction', e);
        throw e;
    }
});
export const deriveLockEscrowPda = (pool, owner, ammProgram) => {
    return PublicKey.findProgramAddressSync([Buffer.from(SEEDS.LOCK_ESCROW), pool.toBuffer(), owner.toBuffer()], ammProgram);
};
export const wrapSOLInstruction = (from, to, amount) => {
    return [
        SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amount,
        }),
        new TransactionInstruction({
            keys: [
                {
                    pubkey: to,
                    isSigner: false,
                    isWritable: true,
                },
            ],
            data: Buffer.from(new Uint8Array([17])),
            programId: TOKEN_PROGRAM_ID,
        }),
    ];
};
export const unwrapSOLInstruction = (owner) => __awaiter(void 0, void 0, void 0, function* () {
    const wSolATAAccount = yield getAssociatedTokenAccount(NATIVE_MINT, owner);
    if (wSolATAAccount) {
        const closedWrappedSolInstruction = createCloseAccountInstruction(wSolATAAccount, owner, owner, []);
        return closedWrappedSolInstruction;
    }
    return null;
});
export const deserializeAccount = (data) => {
    if (data == undefined || data.length == 0) {
        return undefined;
    }
    const accountInfo = AccountLayout.decode(data);
    return accountInfo;
};
export const getOnchainTime = (connection) => __awaiter(void 0, void 0, void 0, function* () {
    const parsedClock = yield connection.getParsedAccountInfo(SYSVAR_CLOCK_PUBKEY);
    const parsedClockAccount = parsedClock.value.data.parsed;
    const currentTime = parsedClockAccount.info.unixTimestamp;
    return currentTime;
});
/**
 * Compute "actual" amount deposited to vault (precision loss)
 * @param depositAmount
 * @param beforeAmount
 * @param vaultLpBalance
 * @param vaultLpSupply
 * @param vaultTotalAmount
 * @returns
 */
export const computeActualDepositAmount = (depositAmount, beforeAmount, vaultLpBalance, vaultLpSupply, vaultTotalAmount) => {
    if (depositAmount.eq(new BN(0)))
        return depositAmount;
    const vaultLpMinted = depositAmount.mul(vaultLpSupply).div(vaultTotalAmount);
    vaultLpSupply = vaultLpSupply.add(vaultLpMinted);
    vaultTotalAmount = vaultTotalAmount.add(depositAmount);
    vaultLpBalance = vaultLpBalance.add(vaultLpMinted);
    const afterAmount = vaultLpBalance.mul(vaultTotalAmount).div(vaultLpSupply);
    return afterAmount.sub(beforeAmount);
};
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
export const calculatePoolInfo = (currentTimestamp, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, poolLpSupply, swapCurve, vaultA, vaultB) => {
    const vaultAWithdrawableAmount = calculateWithdrawableAmount(currentTimestamp.toNumber(), vaultA);
    const vaultBWithdrawableAmount = calculateWithdrawableAmount(currentTimestamp.toNumber(), vaultB);
    const tokenAAmount = getAmountByShare(poolVaultALp, vaultAWithdrawableAmount, vaultALpSupply);
    const tokenBAmount = getAmountByShare(poolVaultBLp, vaultBWithdrawableAmount, vaultBLpSupply);
    const d = swapCurve.computeD(tokenAAmount, tokenBAmount);
    const virtualPriceBigNum = poolLpSupply.isZero() ? new BN(0) : d.mul(VIRTUAL_PRICE_PRECISION).div(poolLpSupply);
    const virtualPrice = new Decimal(virtualPriceBigNum.toString()).div(VIRTUAL_PRICE_PRECISION.toString()).toNumber();
    const virtualPriceRaw = poolLpSupply.isZero() ? new BN(0) : new BN(1).shln(64).mul(d).div(poolLpSupply);
    const poolInformation = {
        tokenAAmount,
        tokenBAmount,
        virtualPrice,
        virtualPriceRaw,
    };
    return poolInformation;
};
export const calculateProtocolTradingFee = (amount, poolState) => {
    const { protocolTradeFeeDenominator, protocolTradeFeeNumerator } = poolState.fees;
    return amount.mul(protocolTradeFeeNumerator).div(protocolTradeFeeDenominator);
};
export const calculateTradingFee = (amount, poolState) => {
    const { tradeFeeDenominator, tradeFeeNumerator } = poolState.fees;
    return amount.mul(tradeFeeNumerator).div(tradeFeeDenominator);
};
export const calculateUnclaimedLockEscrowFee = (totalLockedAmount, lpPerToken, unclaimedFeePending, currentVirtualPrice) => {
    if (currentVirtualPrice.isZero()) {
        return new BN(0);
    }
    let newFee = totalLockedAmount.mul(currentVirtualPrice.sub(lpPerToken)).div(currentVirtualPrice);
    return newFee.add(unclaimedFeePending);
};
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
export const calculateMaxSwapOutAmount = (tokenMint, tokenAMint, tokenBMint, tokenAAmount, tokenBAmount, vaultAReserve, vaultBReserve) => {
    invariant(tokenMint.equals(tokenAMint) || tokenMint.equals(tokenBMint), ERROR.INVALID_MINT);
    const [outTotalAmount, outReserveBalance] = tokenMint.equals(tokenAMint)
        ? [tokenAAmount, vaultAReserve]
        : [tokenBAmount, vaultBReserve];
    return outTotalAmount.gt(outReserveBalance) ? outReserveBalance : outTotalAmount;
};
export const getStakePubkey = (poolState) => {
    // Stable swap curve, and depeg type is not "none"
    if ('stable' in poolState.curveType && !('none' in poolState.curveType['stable'].depeg.depegType)) {
        const depegType = poolState.curveType['stable'].depeg.depegType;
        if (depegType['marinade']) {
            return CURVE_TYPE_ACCOUNTS.marinade;
        }
        else if (depegType['lido']) {
            return CURVE_TYPE_ACCOUNTS.lido;
        }
        else if (depegType['splStake']) {
            return poolState.stake;
        }
    }
    return null;
};
/**
 * It gets the account info that are used in depeg Pool
 * @param {Connection} connection - Connection - The connection to the Solana cluster
 * @param {PoolState[]} poolsState - Array of PoolState
 * @returns A map of the depeg accounts.
 */
export const getDepegAccounts = (connection, poolsState) => __awaiter(void 0, void 0, void 0, function* () {
    const stakePoolPubkeys = new Set();
    for (const p of poolsState) {
        const stakePubkey = getStakePubkey(p);
        if (stakePubkey != null) {
            stakePoolPubkeys.add(stakePubkey);
        }
    }
    const depegAccounts = new Map();
    const stakePoolKeys = [...stakePoolPubkeys];
    const accountBuffers = yield chunkedGetMultipleAccountInfos(connection, stakePoolKeys);
    for (const [i, key] of stakePoolKeys.entries()) {
        if (accountBuffers[i] != null) {
            depegAccounts.set(key.toBase58(), accountBuffers[i]);
        }
    }
    return depegAccounts;
});
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
export const calculateSwapQuote = (inTokenMint, inAmountLamport, params) => {
    const { vaultA, vaultB, vaultALpSupply, vaultBLpSupply, poolState, poolVaultALp, poolVaultBLp, currentTime, depegAccounts, vaultAReserve, vaultBReserve, currentSlot, } = params;
    const { tokenAMint, tokenBMint } = poolState;
    invariant(inTokenMint.equals(tokenAMint) || inTokenMint.equals(tokenBMint), ERROR.INVALID_MINT);
    invariant(poolState.enabled, 'Pool disabled');
    let swapCurve;
    if ('stable' in poolState.curveType) {
        const { amp, depeg, tokenMultiplier } = poolState.curveType['stable'];
        swapCurve = new StableSwap(amp.toNumber(), tokenMultiplier, depeg, depegAccounts, new BN(currentTime), poolState.stake);
    }
    else {
        // Bootstrapping pool
        const activationType = poolState.bootstrapping.activationType;
        const currentPoint = activationType == ActivationType.Timestamp ? new BN(currentTime) : new BN(currentSlot);
        invariant(currentPoint.gte(poolState.bootstrapping.activationPoint), 'Swap is disabled');
        swapCurve = new ConstantProductSwap();
    }
    const vaultAWithdrawableAmount = calculateWithdrawableAmount(currentTime, vaultA);
    const vaultBWithdrawableAmount = calculateWithdrawableAmount(currentTime, vaultB);
    const tokenAAmount = getAmountByShare(poolVaultALp, vaultAWithdrawableAmount, vaultALpSupply);
    const tokenBAmount = getAmountByShare(poolVaultBLp, vaultBWithdrawableAmount, vaultBLpSupply);
    const isFromAToB = inTokenMint.equals(tokenAMint);
    const [sourceAmount, swapSourceVaultLpAmount, swapSourceAmount, swapDestinationAmount, swapSourceVault, swapDestinationVault, swapSourceVaultLpSupply, swapDestinationVaultLpSupply, tradeDirection,] = isFromAToB
        ? [
            inAmountLamport,
            poolVaultALp,
            tokenAAmount,
            tokenBAmount,
            vaultA,
            vaultB,
            vaultALpSupply,
            vaultBLpSupply,
            TradeDirection.AToB,
        ]
        : [
            inAmountLamport,
            poolVaultBLp,
            tokenBAmount,
            tokenAAmount,
            vaultB,
            vaultA,
            vaultBLpSupply,
            vaultALpSupply,
            TradeDirection.BToA,
        ];
    const tradeFee = calculateTradingFee(sourceAmount, poolState);
    // Protocol fee is a cut of trade fee
    const protocolFee = calculateProtocolTradingFee(tradeFee, poolState);
    const tradeFeeAfterProtocolFee = tradeFee.sub(protocolFee);
    const sourceVaultWithdrawableAmount = calculateWithdrawableAmount(currentTime, swapSourceVault);
    const beforeSwapSourceAmount = swapSourceAmount;
    const sourceAmountLessProtocolFee = sourceAmount.sub(protocolFee);
    // Get vault lp minted when deposit to the vault
    const sourceVaultLp = getUnmintAmount(sourceAmountLessProtocolFee, sourceVaultWithdrawableAmount, swapSourceVaultLpSupply);
    const sourceVaultTotalAmount = sourceVaultWithdrawableAmount.add(sourceAmountLessProtocolFee);
    const afterSwapSourceAmount = getAmountByShare(sourceVaultLp.add(swapSourceVaultLpAmount), sourceVaultTotalAmount, swapSourceVaultLpSupply.add(sourceVaultLp));
    const actualSourceAmount = afterSwapSourceAmount.sub(beforeSwapSourceAmount);
    let sourceAmountWithFee = actualSourceAmount.sub(tradeFeeAfterProtocolFee);
    const { outAmount: destinationAmount, priceImpact } = swapCurve.computeOutAmount(sourceAmountWithFee, swapSourceAmount, swapDestinationAmount, tradeDirection);
    const destinationVaultWithdrawableAmount = calculateWithdrawableAmount(currentTime, swapDestinationVault);
    // Get vault lp to burn when withdraw from the vault
    const destinationVaultLp = getUnmintAmount(destinationAmount, destinationVaultWithdrawableAmount, swapDestinationVaultLpSupply);
    let actualDestinationAmount = getAmountByShare(destinationVaultLp, destinationVaultWithdrawableAmount, swapDestinationVaultLpSupply);
    const maxSwapOutAmount = calculateMaxSwapOutAmount(tradeDirection == TradeDirection.AToB ? tokenBMint : tokenAMint, tokenAMint, tokenBMint, tokenAAmount, tokenBAmount, vaultAReserve, vaultBReserve);
    invariant(actualDestinationAmount.lt(maxSwapOutAmount), 'Out amount > vault reserve');
    return {
        amountOut: actualDestinationAmount,
        fee: tradeFeeAfterProtocolFee,
        priceImpact,
    };
};
/**
 * It takes two numbers, and returns three numbers
 * @param {number} decimalA - The number of decimal places for token A.
 * @param {number} decimalB - The number of decimal places for token B.
 * @returns A TokenMultiplier object with the following properties:
 * - tokenAMultiplier
 * - tokenBMultiplier
 * - precisionFactor
 */
export const computeTokenMultiplier = (decimalA, decimalB) => {
    const precisionFactor = Math.max(decimalA, decimalB);
    const tokenAMultiplier = new BN(Math.pow(10, (precisionFactor - decimalA)));
    const tokenBMultiplier = new BN(Math.pow(10, (precisionFactor - decimalB)));
    return {
        tokenAMultiplier,
        tokenBMultiplier,
        precisionFactor,
    };
};
/**
 * It fetches the pool account from the AMM program, and returns the mint addresses for the two tokens
 * @param {Connection} connection - Connection - The connection to the Solana cluster
 * @param {string} poolAddress - The address of the pool account.
 * @returns The tokenAMint and tokenBMint addresses for the pool.
 */
export function getTokensMintFromPoolAddress(connection, poolAddress, opt) {
    return __awaiter(this, void 0, void 0, function* () {
        const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
        const poolAccount = yield ammProgram.account.pool.fetchNullable(new PublicKey(poolAddress));
        if (!poolAccount)
            return;
        return {
            tokenAMint: poolAccount.tokenAMint,
            tokenBMint: poolAccount.tokenBMint,
        };
    });
}
export function deriveMintMetadata(lpMint) {
    return PublicKey.findProgramAddressSync([Buffer.from('metadata'), METAPLEX_PROGRAM.toBuffer(), lpMint.toBuffer()], METAPLEX_PROGRAM);
}
export function derivePoolAddressWithConfig(tokenA, tokenB, config, programId) {
    const [poolPubkey] = PublicKey.findProgramAddressSync([getFirstKey(tokenA, tokenB), getSecondKey(tokenA, tokenB), config.toBuffer()], programId);
    return poolPubkey;
}
export const deriveConfigPda = (index, programId) => {
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config'), index.toBuffer('le', 8)], programId);
    return configPda;
};
export function derivePoolAddress(connection, tokenInfoA, tokenInfoB, isStable, tradeFeeBps, opt) {
    const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
    const curveType = generateCurveType(tokenInfoA, tokenInfoB, isStable);
    const tokenAMint = new PublicKey(tokenInfoA.address);
    const tokenBMint = new PublicKey(tokenInfoB.address);
    const [poolPubkey] = PublicKey.findProgramAddressSync([
        Buffer.from([encodeCurveType(curveType)]),
        getFirstKey(tokenAMint, tokenBMint),
        getSecondKey(tokenAMint, tokenBMint),
        getTradeFeeBpsBuffer(curveType, tradeFeeBps),
    ], ammProgram.programId);
    return poolPubkey;
}
/**
 * It checks if a pool exists by checking if the pool account exists
 * @param {Connection} connection - Connection - the connection to the Solana cluster
 * @param {TokenInfo} tokenInfoA - TokenInfo
 * @param {TokenInfo} tokenInfoB - TokenInfo
 * @param {boolean} isStable - boolean - whether the pool is stable or not
 * @returns A boolean value.
 */
export function checkPoolExists(connection, tokenInfoA, tokenInfoB, isStable, tradeFeeBps, opt) {
    return __awaiter(this, void 0, void 0, function* () {
        const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
        const poolPubkey = derivePoolAddress(connection, tokenInfoA, tokenInfoB, isStable, tradeFeeBps, {
            programId: opt === null || opt === void 0 ? void 0 : opt.programId,
        });
        const poolAccount = yield ammProgram.account.pool.fetchNullable(poolPubkey);
        if (!poolAccount)
            return;
        return poolPubkey;
    });
}
/**
 * It checks if a pool with config exists by checking if the pool account exists
 * @param {Connection} connection - Connection - the connection to the Solana cluster
 * @param {PublicKey} tokenA - TokenInfo
 * @param {PublicKey} tokenB - TokenInfo
 * @returns A PublicKey value or undefined.
 */
export function checkPoolWithConfigsExists(connection, tokenA, tokenB, configs, opt) {
    return __awaiter(this, void 0, void 0, function* () {
        const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
        const poolsPubkey = configs.map((config) => derivePoolAddressWithConfig(tokenA, tokenB, config, ammProgram.programId));
        const poolsAccount = yield ammProgram.account.pool.fetchMultiple(poolsPubkey);
        if (poolsAccount.every((account) => account === null))
            return;
        const poolAccountIndex = poolsAccount.findIndex((account) => account !== null);
        return poolsPubkey[poolAccountIndex];
    });
}
export function chunks(array, size) {
    return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) => array.slice(index * size, (index + 1) * size));
}
export function chunkedFetchMultiplePoolAccount(program_1, pks_1) {
    return __awaiter(this, arguments, void 0, function* (program, pks, chunkSize = 100) {
        const accounts = (yield Promise.all(chunks(pks, chunkSize).map((chunk) => program.account.pool.fetchMultiple(chunk)))).flat();
        return accounts.filter(Boolean);
    });
}
export function chunkedGetMultipleAccountInfos(connection_1, pks_1) {
    return __awaiter(this, arguments, void 0, function* (connection, pks, chunkSize = 100) {
        const accountInfos = (yield Promise.all(chunks(pks, chunkSize).map((chunk) => connection.getMultipleAccountsInfo(chunk)))).flat();
        return accountInfos;
    });
}
export function encodeCurveType(curve) {
    if (curve['constantProduct']) {
        return 0;
    }
    else if (curve['stable']) {
        return 1;
    }
    else {
        throw new Error('Unknown curve type');
    }
}
export function getSecondKey(key1, key2) {
    const buf1 = key1.toBuffer();
    const buf2 = key2.toBuffer();
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf2;
    }
    return buf1;
}
export function getFirstKey(key1, key2) {
    const buf1 = key1.toBuffer();
    const buf2 = key2.toBuffer();
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf1;
    }
    return buf2;
}
export function getTradeFeeBpsBuffer(curve, tradeFeeBps) {
    let defaultFeeBps;
    if (curve['stable']) {
        defaultFeeBps = new BN(STABLE_SWAP_DEFAULT_TRADE_FEE_BPS);
    }
    else {
        defaultFeeBps = new BN(CONSTANT_PRODUCT_DEFAULT_TRADE_FEE_BPS);
    }
    if (tradeFeeBps.eq(defaultFeeBps)) {
        return new Uint8Array();
    }
    return new Uint8Array(tradeFeeBps.toBuffer('le', 8));
}
export const DepegType = {
    none: () => {
        return {
            none: {},
        };
    },
    marinade: () => {
        return {
            marinade: {},
        };
    },
    lido: () => {
        return {
            lido: {},
        };
    },
    splStake: () => {
        return {
            splStake: {},
        };
    },
};
export function generateCurveType(tokenInfoA, tokenInfoB, isStable) {
    return isStable
        ? {
            stable: {
                amp: PERMISSIONLESS_AMP,
                tokenMultiplier: computeTokenMultiplier(tokenInfoA.decimals, tokenInfoB.decimals),
                depeg: { baseVirtualPrice: new BN(0), baseCacheUpdated: new BN(0), depegType: DepegType.none() },
                lastAmpUpdatedTimestamp: new BN(0),
            },
        }
        : { constantProduct: {} };
}
//# sourceMappingURL=utils.js.map