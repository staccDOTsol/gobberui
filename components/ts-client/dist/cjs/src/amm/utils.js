"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepegType = exports.deriveConfigPda = exports.computeTokenMultiplier = exports.calculateSwapQuote = exports.getDepegAccounts = exports.getStakePubkey = exports.calculateMaxSwapOutAmount = exports.calculateUnclaimedLockEscrowFee = exports.calculateTradingFee = exports.calculateProtocolTradingFee = exports.calculatePoolInfo = exports.computeActualDepositAmount = exports.getOnchainTime = exports.deserializeAccount = exports.unwrapSOLInstruction = exports.wrapSOLInstruction = exports.deriveLockEscrowPda = exports.getOrCreateATAInstruction = exports.getAssociatedTokenAccount = exports.getMinAmountWithSlippage = exports.getMaxAmountWithSlippage = exports.createProgram = void 0;
exports.getTokensMintFromPoolAddress = getTokensMintFromPoolAddress;
exports.deriveMintMetadata = deriveMintMetadata;
exports.derivePoolAddressWithConfig = derivePoolAddressWithConfig;
exports.derivePoolAddress = derivePoolAddress;
exports.checkPoolExists = checkPoolExists;
exports.checkPoolWithConfigsExists = checkPoolWithConfigsExists;
exports.chunks = chunks;
exports.chunkedFetchMultiplePoolAccount = chunkedFetchMultiplePoolAccount;
exports.chunkedGetMultipleAccountInfos = chunkedGetMultipleAccountInfos;
exports.encodeCurveType = encodeCurveType;
exports.getSecondKey = getSecondKey;
exports.getFirstKey = getFirstKey;
exports.getTradeFeeBpsBuffer = getTradeFeeBpsBuffer;
exports.generateCurveType = generateCurveType;
const vault_sdk_1 = require("@mercurial-finance/vault-sdk");
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const invariant_1 = __importDefault(require("invariant"));
const constants_1 = require("./constants");
const curve_1 = require("./curve");
const types_1 = require("./types");
const idl_1 = require("./idl");
const decimal_js_1 = __importDefault(require("decimal.js"));
const createProgram = (connection, programId) => {
    const provider = new anchor_1.AnchorProvider(connection, {}, anchor_1.AnchorProvider.defaultOptions());
    const ammProgram = new anchor_1.Program(idl_1.IDL, programId ?? constants_1.PROGRAM_ID, provider);
    const vaultProgram = new anchor_1.Program(vault_sdk_1.IDL, vault_sdk_1.PROGRAM_ID, provider);
    return { provider, ammProgram, vaultProgram };
};
exports.createProgram = createProgram;
/**
 * It takes an amount and a slippage rate, and returns the maximum amount that can be received with
 * that slippage rate
 * @param {BN} amount - The amount of tokens you want to buy.
 * @param {number} slippageRate - The maximum percentage of slippage you're willing to accept. (Max to 2 decimal place)
 * @returns The maximum amount of tokens that can be bought with the given amount of ETH, given the
 * slippage rate.
 */
const getMaxAmountWithSlippage = (amount, slippageRate) => {
    const slippage = ((100 + slippageRate) / 100) * 10000;
    return amount.mul(new anchor_1.BN(slippage)).div(new anchor_1.BN(10000));
};
exports.getMaxAmountWithSlippage = getMaxAmountWithSlippage;
/**
 * It takes an amount and a slippage rate, and returns the minimum amount that will be received after
 * slippage
 * @param {BN} amount - The amount of tokens you want to sell.
 * @param {number} slippageRate - The percentage of slippage you're willing to accept. (Max to 2 decimal place)
 * @returns The minimum amount that can be received after slippage is applied.
 */
const getMinAmountWithSlippage = (amount, slippageRate) => {
    const slippage = ((100 - slippageRate) / 100) * 10000;
    return amount.mul(new anchor_1.BN(slippage)).div(new anchor_1.BN(10000));
};
exports.getMinAmountWithSlippage = getMinAmountWithSlippage;
const getAssociatedTokenAccount = (tokenMint, owner) => {
    return (0, spl_token_1.getAssociatedTokenAddressSync)(tokenMint, owner, true, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
};
exports.getAssociatedTokenAccount = getAssociatedTokenAccount;
const getOrCreateATAInstruction = async (tokenMint, owner, connection, payer) => {
    let toAccount;
    try {
        toAccount = await (0, exports.getAssociatedTokenAccount)(tokenMint, owner);
        const account = await connection.getAccountInfo(toAccount);
        if (!account) {
            const ix = (0, spl_token_1.createAssociatedTokenAccountInstruction)(payer || owner, toAccount, owner, tokenMint, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
            return [toAccount, ix];
        }
        return [toAccount, undefined];
    }
    catch (e) {
        /* handle error */
        console.error('Error::getOrCreateATAInstruction', e);
        throw e;
    }
};
exports.getOrCreateATAInstruction = getOrCreateATAInstruction;
const deriveLockEscrowPda = (pool, owner, ammProgram) => {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.LOCK_ESCROW), pool.toBuffer(), owner.toBuffer()], ammProgram);
};
exports.deriveLockEscrowPda = deriveLockEscrowPda;
const wrapSOLInstruction = (from, to, amount) => {
    return [
        web3_js_1.SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amount,
        }),
        new web3_js_1.TransactionInstruction({
            keys: [
                {
                    pubkey: to,
                    isSigner: false,
                    isWritable: true,
                },
            ],
            data: Buffer.from(new Uint8Array([17])),
            programId: spl_token_1.TOKEN_PROGRAM_ID,
        }),
    ];
};
exports.wrapSOLInstruction = wrapSOLInstruction;
const unwrapSOLInstruction = async (owner) => {
    const wSolATAAccount = await (0, exports.getAssociatedTokenAccount)(spl_token_1.NATIVE_MINT, owner);
    if (wSolATAAccount) {
        const closedWrappedSolInstruction = (0, spl_token_1.createCloseAccountInstruction)(wSolATAAccount, owner, owner, []);
        return closedWrappedSolInstruction;
    }
    return null;
};
exports.unwrapSOLInstruction = unwrapSOLInstruction;
const deserializeAccount = (data) => {
    if (data == undefined || data.length == 0) {
        return undefined;
    }
    const accountInfo = spl_token_1.AccountLayout.decode(data);
    return accountInfo;
};
exports.deserializeAccount = deserializeAccount;
const getOnchainTime = async (connection) => {
    const parsedClock = await connection.getParsedAccountInfo(web3_js_1.SYSVAR_CLOCK_PUBKEY);
    const parsedClockAccount = parsedClock.value.data.parsed;
    const currentTime = parsedClockAccount.info.unixTimestamp;
    return currentTime;
};
exports.getOnchainTime = getOnchainTime;
/**
 * Compute "actual" amount deposited to vault (precision loss)
 * @param depositAmount
 * @param beforeAmount
 * @param vaultLpBalance
 * @param vaultLpSupply
 * @param vaultTotalAmount
 * @returns
 */
const computeActualDepositAmount = (depositAmount, beforeAmount, vaultLpBalance, vaultLpSupply, vaultTotalAmount) => {
    if (depositAmount.eq(new anchor_1.BN(0)))
        return depositAmount;
    const vaultLpMinted = depositAmount.mul(vaultLpSupply).div(vaultTotalAmount);
    vaultLpSupply = vaultLpSupply.add(vaultLpMinted);
    vaultTotalAmount = vaultTotalAmount.add(depositAmount);
    vaultLpBalance = vaultLpBalance.add(vaultLpMinted);
    const afterAmount = vaultLpBalance.mul(vaultTotalAmount).div(vaultLpSupply);
    return afterAmount.sub(beforeAmount);
};
exports.computeActualDepositAmount = computeActualDepositAmount;
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
const calculatePoolInfo = (currentTimestamp, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, poolLpSupply, swapCurve, vaultA, vaultB) => {
    const vaultAWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(currentTimestamp.toNumber(), vaultA);
    const vaultBWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(currentTimestamp.toNumber(), vaultB);
    const tokenAAmount = (0, vault_sdk_1.getAmountByShare)(poolVaultALp, vaultAWithdrawableAmount, vaultALpSupply);
    const tokenBAmount = (0, vault_sdk_1.getAmountByShare)(poolVaultBLp, vaultBWithdrawableAmount, vaultBLpSupply);
    const d = swapCurve.computeD(tokenAAmount, tokenBAmount);
    const virtualPriceBigNum = poolLpSupply.isZero() ? new anchor_1.BN(0) : d.mul(constants_1.VIRTUAL_PRICE_PRECISION).div(poolLpSupply);
    const virtualPrice = new decimal_js_1.default(virtualPriceBigNum.toString()).div(constants_1.VIRTUAL_PRICE_PRECISION.toString()).toNumber();
    const virtualPriceRaw = poolLpSupply.isZero() ? new anchor_1.BN(0) : new anchor_1.BN(1).shln(64).mul(d).div(poolLpSupply);
    const poolInformation = {
        tokenAAmount,
        tokenBAmount,
        virtualPrice,
        virtualPriceRaw,
    };
    return poolInformation;
};
exports.calculatePoolInfo = calculatePoolInfo;
const calculateProtocolTradingFee = (amount, poolState) => {
    const { protocolTradeFeeDenominator, protocolTradeFeeNumerator } = poolState.fees;
    return amount.mul(protocolTradeFeeNumerator).div(protocolTradeFeeDenominator);
};
exports.calculateProtocolTradingFee = calculateProtocolTradingFee;
const calculateTradingFee = (amount, poolState) => {
    const { tradeFeeDenominator, tradeFeeNumerator } = poolState.fees;
    return amount.mul(tradeFeeNumerator).div(tradeFeeDenominator);
};
exports.calculateTradingFee = calculateTradingFee;
const calculateUnclaimedLockEscrowFee = (totalLockedAmount, lpPerToken, unclaimedFeePending, currentVirtualPrice) => {
    if (currentVirtualPrice.isZero()) {
        return new anchor_1.BN(0);
    }
    let newFee = totalLockedAmount.mul(currentVirtualPrice.sub(lpPerToken)).div(currentVirtualPrice);
    return newFee.add(unclaimedFeePending);
};
exports.calculateUnclaimedLockEscrowFee = calculateUnclaimedLockEscrowFee;
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
const calculateMaxSwapOutAmount = (tokenMint, tokenAMint, tokenBMint, tokenAAmount, tokenBAmount, vaultAReserve, vaultBReserve) => {
    (0, invariant_1.default)(tokenMint.equals(tokenAMint) || tokenMint.equals(tokenBMint), constants_1.ERROR.INVALID_MINT);
    const [outTotalAmount, outReserveBalance] = tokenMint.equals(tokenAMint)
        ? [tokenAAmount, vaultAReserve]
        : [tokenBAmount, vaultBReserve];
    return outTotalAmount.gt(outReserveBalance) ? outReserveBalance : outTotalAmount;
};
exports.calculateMaxSwapOutAmount = calculateMaxSwapOutAmount;
const getStakePubkey = (poolState) => {
    // Stable swap curve, and depeg type is not "none"
    if ('stable' in poolState.curveType && !('none' in poolState.curveType['stable'].depeg.depegType)) {
        const depegType = poolState.curveType['stable'].depeg.depegType;
        if (depegType['marinade']) {
            return constants_1.CURVE_TYPE_ACCOUNTS.marinade;
        }
        else if (depegType['lido']) {
            return constants_1.CURVE_TYPE_ACCOUNTS.lido;
        }
        else if (depegType['splStake']) {
            return poolState.stake;
        }
    }
    return null;
};
exports.getStakePubkey = getStakePubkey;
/**
 * It gets the account info that are used in depeg Pool
 * @param {Connection} connection - Connection - The connection to the Solana cluster
 * @param {PoolState[]} poolsState - Array of PoolState
 * @returns A map of the depeg accounts.
 */
const getDepegAccounts = async (connection, poolsState) => {
    const stakePoolPubkeys = new Set();
    for (const p of poolsState) {
        const stakePubkey = (0, exports.getStakePubkey)(p);
        if (stakePubkey != null) {
            stakePoolPubkeys.add(stakePubkey);
        }
    }
    const depegAccounts = new Map();
    const stakePoolKeys = [...stakePoolPubkeys];
    const accountBuffers = await chunkedGetMultipleAccountInfos(connection, stakePoolKeys);
    for (const [i, key] of stakePoolKeys.entries()) {
        if (accountBuffers[i] != null) {
            depegAccounts.set(key.toBase58(), accountBuffers[i]);
        }
    }
    return depegAccounts;
};
exports.getDepegAccounts = getDepegAccounts;
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
const calculateSwapQuote = (inTokenMint, inAmountLamport, params) => {
    const { vaultA, vaultB, vaultALpSupply, vaultBLpSupply, poolState, poolVaultALp, poolVaultBLp, currentTime, depegAccounts, vaultAReserve, vaultBReserve, currentSlot, } = params;
    const { tokenAMint, tokenBMint } = poolState;
    (0, invariant_1.default)(inTokenMint.equals(tokenAMint) || inTokenMint.equals(tokenBMint), constants_1.ERROR.INVALID_MINT);
    (0, invariant_1.default)(poolState.enabled, 'Pool disabled');
    let swapCurve;
    if ('stable' in poolState.curveType) {
        const { amp, depeg, tokenMultiplier } = poolState.curveType['stable'];
        swapCurve = new curve_1.StableSwap(amp.toNumber(), tokenMultiplier, depeg, depegAccounts, new anchor_1.BN(currentTime), poolState.stake);
    }
    else {
        // Bootstrapping pool
        const activationType = poolState.bootstrapping.activationType;
        const currentPoint = activationType == types_1.ActivationType.Timestamp ? new anchor_1.BN(currentTime) : new anchor_1.BN(currentSlot);
        (0, invariant_1.default)(currentPoint.gte(poolState.bootstrapping.activationPoint), 'Swap is disabled');
        swapCurve = new curve_1.ConstantProductSwap();
    }
    const vaultAWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(currentTime, vaultA);
    const vaultBWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(currentTime, vaultB);
    const tokenAAmount = (0, vault_sdk_1.getAmountByShare)(poolVaultALp, vaultAWithdrawableAmount, vaultALpSupply);
    const tokenBAmount = (0, vault_sdk_1.getAmountByShare)(poolVaultBLp, vaultBWithdrawableAmount, vaultBLpSupply);
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
            curve_1.TradeDirection.AToB,
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
            curve_1.TradeDirection.BToA,
        ];
    const tradeFee = (0, exports.calculateTradingFee)(sourceAmount, poolState);
    // Protocol fee is a cut of trade fee
    const protocolFee = (0, exports.calculateProtocolTradingFee)(tradeFee, poolState);
    const tradeFeeAfterProtocolFee = tradeFee.sub(protocolFee);
    const sourceVaultWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(currentTime, swapSourceVault);
    const beforeSwapSourceAmount = swapSourceAmount;
    const sourceAmountLessProtocolFee = sourceAmount.sub(protocolFee);
    // Get vault lp minted when deposit to the vault
    const sourceVaultLp = (0, vault_sdk_1.getUnmintAmount)(sourceAmountLessProtocolFee, sourceVaultWithdrawableAmount, swapSourceVaultLpSupply);
    const sourceVaultTotalAmount = sourceVaultWithdrawableAmount.add(sourceAmountLessProtocolFee);
    const afterSwapSourceAmount = (0, vault_sdk_1.getAmountByShare)(sourceVaultLp.add(swapSourceVaultLpAmount), sourceVaultTotalAmount, swapSourceVaultLpSupply.add(sourceVaultLp));
    const actualSourceAmount = afterSwapSourceAmount.sub(beforeSwapSourceAmount);
    let sourceAmountWithFee = actualSourceAmount.sub(tradeFeeAfterProtocolFee);
    const { outAmount: destinationAmount, priceImpact } = swapCurve.computeOutAmount(sourceAmountWithFee, swapSourceAmount, swapDestinationAmount, tradeDirection);
    const destinationVaultWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(currentTime, swapDestinationVault);
    // Get vault lp to burn when withdraw from the vault
    const destinationVaultLp = (0, vault_sdk_1.getUnmintAmount)(destinationAmount, destinationVaultWithdrawableAmount, swapDestinationVaultLpSupply);
    let actualDestinationAmount = (0, vault_sdk_1.getAmountByShare)(destinationVaultLp, destinationVaultWithdrawableAmount, swapDestinationVaultLpSupply);
    const maxSwapOutAmount = (0, exports.calculateMaxSwapOutAmount)(tradeDirection == curve_1.TradeDirection.AToB ? tokenBMint : tokenAMint, tokenAMint, tokenBMint, tokenAAmount, tokenBAmount, vaultAReserve, vaultBReserve);
    (0, invariant_1.default)(actualDestinationAmount.lt(maxSwapOutAmount), 'Out amount > vault reserve');
    return {
        amountOut: actualDestinationAmount,
        fee: tradeFeeAfterProtocolFee,
        priceImpact,
    };
};
exports.calculateSwapQuote = calculateSwapQuote;
/**
 * It takes two numbers, and returns three numbers
 * @param {number} decimalA - The number of decimal places for token A.
 * @param {number} decimalB - The number of decimal places for token B.
 * @returns A TokenMultiplier object with the following properties:
 * - tokenAMultiplier
 * - tokenBMultiplier
 * - precisionFactor
 */
const computeTokenMultiplier = (decimalA, decimalB) => {
    const precisionFactor = Math.max(decimalA, decimalB);
    const tokenAMultiplier = new anchor_1.BN(10 ** (precisionFactor - decimalA));
    const tokenBMultiplier = new anchor_1.BN(10 ** (precisionFactor - decimalB));
    return {
        tokenAMultiplier,
        tokenBMultiplier,
        precisionFactor,
    };
};
exports.computeTokenMultiplier = computeTokenMultiplier;
/**
 * It fetches the pool account from the AMM program, and returns the mint addresses for the two tokens
 * @param {Connection} connection - Connection - The connection to the Solana cluster
 * @param {string} poolAddress - The address of the pool account.
 * @returns The tokenAMint and tokenBMint addresses for the pool.
 */
async function getTokensMintFromPoolAddress(connection, poolAddress, opt) {
    const { ammProgram } = (0, exports.createProgram)(connection, opt?.programId);
    const poolAccount = await ammProgram.account.pool.fetchNullable(new web3_js_1.PublicKey(poolAddress));
    if (!poolAccount)
        return;
    return {
        tokenAMint: poolAccount.tokenAMint,
        tokenBMint: poolAccount.tokenBMint,
    };
}
function deriveMintMetadata(lpMint) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('metadata'), constants_1.METAPLEX_PROGRAM.toBuffer(), lpMint.toBuffer()], constants_1.METAPLEX_PROGRAM);
}
function derivePoolAddressWithConfig(tokenA, tokenB, config, programId) {
    const [poolPubkey] = web3_js_1.PublicKey.findProgramAddressSync([getFirstKey(tokenA, tokenB), getSecondKey(tokenA, tokenB), config.toBuffer()], programId);
    return poolPubkey;
}
const deriveConfigPda = (index, programId) => {
    const [configPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('config'), index.toBuffer('le', 8)], programId);
    return configPda;
};
exports.deriveConfigPda = deriveConfigPda;
function derivePoolAddress(connection, tokenInfoA, tokenInfoB, isStable, tradeFeeBps, opt) {
    const { ammProgram } = (0, exports.createProgram)(connection, opt?.programId);
    const curveType = generateCurveType(tokenInfoA, tokenInfoB, isStable);
    const tokenAMint = new web3_js_1.PublicKey(tokenInfoA.address);
    const tokenBMint = new web3_js_1.PublicKey(tokenInfoB.address);
    const [poolPubkey] = web3_js_1.PublicKey.findProgramAddressSync([
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
async function checkPoolExists(connection, tokenInfoA, tokenInfoB, isStable, tradeFeeBps, opt) {
    const { ammProgram } = (0, exports.createProgram)(connection, opt?.programId);
    const poolPubkey = derivePoolAddress(connection, tokenInfoA, tokenInfoB, isStable, tradeFeeBps, {
        programId: opt?.programId,
    });
    const poolAccount = await ammProgram.account.pool.fetchNullable(poolPubkey);
    if (!poolAccount)
        return;
    return poolPubkey;
}
/**
 * It checks if a pool with config exists by checking if the pool account exists
 * @param {Connection} connection - Connection - the connection to the Solana cluster
 * @param {PublicKey} tokenA - TokenInfo
 * @param {PublicKey} tokenB - TokenInfo
 * @returns A PublicKey value or undefined.
 */
async function checkPoolWithConfigsExists(connection, tokenA, tokenB, configs, opt) {
    const { ammProgram } = (0, exports.createProgram)(connection, opt?.programId);
    const poolsPubkey = configs.map((config) => derivePoolAddressWithConfig(tokenA, tokenB, config, ammProgram.programId));
    const poolsAccount = await ammProgram.account.pool.fetchMultiple(poolsPubkey);
    if (poolsAccount.every((account) => account === null))
        return;
    const poolAccountIndex = poolsAccount.findIndex((account) => account !== null);
    return poolsPubkey[poolAccountIndex];
}
function chunks(array, size) {
    return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) => array.slice(index * size, (index + 1) * size));
}
async function chunkedFetchMultiplePoolAccount(program, pks, chunkSize = 100) {
    const accounts = (await Promise.all(chunks(pks, chunkSize).map((chunk) => program.account.pool.fetchMultiple(chunk)))).flat();
    return accounts.filter(Boolean);
}
async function chunkedGetMultipleAccountInfos(connection, pks, chunkSize = 100) {
    const accountInfos = (await Promise.all(chunks(pks, chunkSize).map((chunk) => connection.getMultipleAccountsInfo(chunk)))).flat();
    return accountInfos;
}
function encodeCurveType(curve) {
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
function getSecondKey(key1, key2) {
    const buf1 = key1.toBuffer();
    const buf2 = key2.toBuffer();
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf2;
    }
    return buf1;
}
function getFirstKey(key1, key2) {
    const buf1 = key1.toBuffer();
    const buf2 = key2.toBuffer();
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf1;
    }
    return buf2;
}
function getTradeFeeBpsBuffer(curve, tradeFeeBps) {
    let defaultFeeBps;
    if (curve['stable']) {
        defaultFeeBps = new anchor_1.BN(constants_1.STABLE_SWAP_DEFAULT_TRADE_FEE_BPS);
    }
    else {
        defaultFeeBps = new anchor_1.BN(constants_1.CONSTANT_PRODUCT_DEFAULT_TRADE_FEE_BPS);
    }
    if (tradeFeeBps.eq(defaultFeeBps)) {
        return new Uint8Array();
    }
    return new Uint8Array(tradeFeeBps.toBuffer('le', 8));
}
exports.DepegType = {
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
function generateCurveType(tokenInfoA, tokenInfoB, isStable) {
    return isStable
        ? {
            stable: {
                amp: constants_1.PERMISSIONLESS_AMP,
                tokenMultiplier: (0, exports.computeTokenMultiplier)(tokenInfoA.decimals, tokenInfoB.decimals),
                depeg: { baseVirtualPrice: new anchor_1.BN(0), baseCacheUpdated: new anchor_1.BN(0), depegType: exports.DepegType.none() },
                lastAmpUpdatedTimestamp: new anchor_1.BN(0),
            },
        }
        : { constantProduct: {} };
}
//# sourceMappingURL=utils.js.map