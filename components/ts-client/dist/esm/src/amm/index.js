var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { BN } from '@coral-xyz/anchor';
import { PublicKey, Transaction, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, SystemProgram, ComputeBudgetProgram, } from '@solana/web3.js';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, MintLayout, NATIVE_MINT, TOKEN_PROGRAM_ID, } from '@solana/spl-token';
import VaultImpl, { calculateWithdrawableAmount, getVaultPdas } from '@mercurial-finance/vault-sdk';
import invariant from 'invariant';
import { AccountType, ClockLayout, } from './types';
import { ERROR, SEEDS, UNLOCK_AMOUNT_BUFFER, FEE_OWNER, METAPLEX_PROGRAM, U64_MAX } from './constants';
import { StableSwap, TradeDirection } from './curve';
import { ConstantProductSwap } from './curve/constant-product';
import { calculateMaxSwapOutAmount, calculateSwapQuote, computeActualDepositAmount, calculatePoolInfo, getMaxAmountWithSlippage, getMinAmountWithSlippage, getOrCreateATAInstruction, unwrapSOLInstruction, wrapSOLInstruction, getDepegAccounts, createProgram, getAssociatedTokenAccount, deserializeAccount, chunkedGetMultipleAccountInfos, generateCurveType, derivePoolAddress, chunkedFetchMultiplePoolAccount, deriveMintMetadata, deriveLockEscrowPda, calculateUnclaimedLockEscrowFee, derivePoolAddressWithConfig as deriveConstantProductPoolAddressWithConfig, deriveConfigPda, } from './utils';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
const getAllPoolState = (poolMints, program) => __awaiter(void 0, void 0, void 0, function* () {
    const poolStates = (yield chunkedFetchMultiplePoolAccount(program, poolMints));
    invariant(poolStates.length === poolMints.length, 'Some of the pool state not found');
    const poolLpMints = poolStates.map((poolState) => poolState.lpMint);
    const lpMintAccounts = yield chunkedGetMultipleAccountInfos(program.provider.connection, poolLpMints);
    return poolStates.map((poolState, idx) => {
        const lpMintAccount = lpMintAccounts[idx];
        invariant(lpMintAccount, ERROR.INVALID_ACCOUNT);
        const lpSupply = new BN(MintLayout.decode(lpMintAccount.data).supply.toString());
        return Object.assign(Object.assign({}, poolState), { lpSupply });
    });
});
const getPoolState = (poolMint, program) => __awaiter(void 0, void 0, void 0, function* () {
    const poolState = (yield program.account.pool.fetchNullable(poolMint));
    invariant(poolState, `Pool ${poolMint.toBase58()} not found`);
    const account = yield program.provider.connection.getTokenSupply(poolState.lpMint);
    invariant(account.value.amount, ERROR.INVALID_ACCOUNT);
    return Object.assign(Object.assign({}, poolState), { lpSupply: new BN(account.value.amount) });
});
const decodeAccountTypeMapper = (type) => {
    const decoder = {
        [AccountType.VAULT_A_RESERVE]: (accountData) => new BN(AccountLayout.decode(accountData).amount.toString()),
        [AccountType.VAULT_B_RESERVE]: (accountData) => new BN(AccountLayout.decode(accountData).amount.toString()),
        [AccountType.VAULT_A_LP]: (accountData) => new BN(MintLayout.decode(accountData).supply.toString()),
        [AccountType.VAULT_B_LP]: (accountData) => new BN(MintLayout.decode(accountData).supply.toString()),
        [AccountType.POOL_VAULT_A_LP]: (accountData) => new BN(AccountLayout.decode(accountData).amount.toString()),
        [AccountType.POOL_VAULT_B_LP]: (accountData) => new BN(AccountLayout.decode(accountData).amount.toString()),
        [AccountType.POOL_LP_MINT]: (accountData) => new BN(MintLayout.decode(accountData).supply.toString()),
        [AccountType.SYSVAR_CLOCK]: (accountData) => new BN(accountData.readBigInt64LE(32).toString()),
    };
    return decoder[type];
};
const getAccountsBuffer = (connection, accountsToFetch) => __awaiter(void 0, void 0, void 0, function* () {
    const accounts = yield chunkedGetMultipleAccountInfos(connection, accountsToFetch.map((account) => account.pubkey));
    return accountsToFetch.reduce((accMap, account, index) => {
        const accountInfo = accounts[index];
        accMap.set(account.pubkey.toBase58(), {
            type: account.type,
            account: accountInfo,
        });
        return accMap;
    }, new Map());
});
const deserializeAccountsBuffer = (accountInfoMap) => {
    return Array.from(accountInfoMap).reduce((accValue, [publicKey, { type, account }]) => {
        const decodedAccountInfo = decodeAccountTypeMapper(type);
        accValue.set(publicKey, decodedAccountInfo(account.data));
        return accValue;
    }, new Map());
};
export default class AmmImpl {
    constructor(address, program, vaultProgram, tokenAMint, tokenBMint, poolState, poolInfo, vaultA, vaultB, accountsInfo, swapCurve, depegAccounts, opt) {
        this.address = address;
        this.program = program;
        this.vaultProgram = vaultProgram;
        this.tokenAMint = tokenAMint;
        this.tokenBMint = tokenBMint;
        this.poolState = poolState;
        this.poolInfo = poolInfo;
        this.vaultA = vaultA;
        this.vaultB = vaultB;
        this.accountsInfo = accountsInfo;
        this.swapCurve = swapCurve;
        this.depegAccounts = depegAccounts;
        this.opt = {
            cluster: 'mainnet-beta',
        };
        this.opt = Object.assign(Object.assign({}, this.opt), opt);
    }
    static createConfig(connection, payer, tradeFeeBps, protocolFeeBps, vaultConfigKey, activationDuration, poolCreatorAuthority, activationType, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const configs = yield this.getFeeConfigurations(connection, opt);
            let index = 0;
            while (true) {
                const configPda = deriveConfigPda(new BN(index), ammProgram.programId);
                if (!configs.find((c) => c.publicKey.equals(configPda))) {
                    const createConfigTx = yield ammProgram.methods
                        .createConfig({
                        // Default fee denominator is 100_000
                        tradeFeeNumerator: tradeFeeBps.mul(new BN(10)),
                        protocolTradeFeeNumerator: protocolFeeBps.mul(new BN(10)),
                        vaultConfigKey,
                        activationDuration,
                        poolCreatorAuthority,
                        index: new BN(index),
                        activationType,
                    })
                        .accounts({
                        config: configPda,
                        systemProgram: SystemProgram.programId,
                        admin: payer,
                    })
                        .transaction();
                    return new Transaction(Object.assign({ feePayer: payer }, (yield ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)))).add(createConfigTx);
                }
                else {
                    index++;
                }
            }
        });
    }
    static searchPoolsByToken(connection, tokenMint) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ammProgram } = createProgram(connection);
            const [poolsForTokenAMint, poolsForTokenBMint] = yield Promise.all([
                ammProgram.account.pool.all([
                    {
                        memcmp: {
                            offset: 8 + 32,
                            bytes: tokenMint.toBase58(),
                        },
                    },
                ]),
                ammProgram.account.pool.all([
                    {
                        memcmp: {
                            offset: 8 + 32 + 32,
                            bytes: tokenMint.toBase58(),
                        },
                    },
                ]),
            ]);
            return [...poolsForTokenAMint, ...poolsForTokenBMint];
        });
    }
    static createPermissionlessConstantProductPoolWithConfig2(connection, payer, tokenAMint, tokenBMint, tokenAAmount, tokenBAmount, config, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { vaultProgram, ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const [{ vaultPda: aVault, tokenVaultPda: aTokenVault, lpMintPda: aLpMintPda }, { vaultPda: bVault, tokenVaultPda: bTokenVault, lpMintPda: bLpMintPda },] = [getVaultPdas(tokenAMint, vaultProgram.programId), getVaultPdas(tokenBMint, vaultProgram.programId)];
            const [aVaultAccount, bVaultAccount] = yield Promise.all([
                vaultProgram.account.vault.fetchNullable(aVault),
                vaultProgram.account.vault.fetchNullable(bVault),
            ]);
            let aVaultLpMint = aLpMintPda;
            let bVaultLpMint = bLpMintPda;
            let preInstructions = [];
            if (!aVaultAccount) {
                const createVaultAIx = yield VaultImpl.createPermissionlessVaultInstruction(connection, payer, tokenAMint);
                createVaultAIx && preInstructions.push(createVaultAIx);
            }
            else {
                aVaultLpMint = aVaultAccount.lpMint; // Old vault doesn't have lp mint pda
            }
            if (!bVaultAccount) {
                const createVaultBIx = yield VaultImpl.createPermissionlessVaultInstruction(connection, payer, tokenBMint);
                createVaultBIx && preInstructions.push(createVaultBIx);
            }
            else {
                bVaultLpMint = bVaultAccount.lpMint; // Old vault doesn't have lp mint pda
            }
            const poolPubkey = deriveConstantProductPoolAddressWithConfig(tokenAMint, tokenBMint, config, ammProgram.programId);
            const [lpMint] = PublicKey.findProgramAddressSync([Buffer.from(SEEDS.LP_MINT), poolPubkey.toBuffer()], ammProgram.programId);
            const [[aVaultLp], [bVaultLp]] = [
                PublicKey.findProgramAddressSync([aVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                PublicKey.findProgramAddressSync([bVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            ];
            const [[payerTokenA, createPayerTokenAIx], [payerTokenB, createPayerTokenBIx]] = yield Promise.all([
                getOrCreateATAInstruction(tokenAMint, payer, connection),
                getOrCreateATAInstruction(tokenBMint, payer, connection),
            ]);
            createPayerTokenAIx && preInstructions.push(createPayerTokenAIx);
            createPayerTokenBIx && preInstructions.push(createPayerTokenBIx);
            const [[protocolTokenAFee], [protocolTokenBFee]] = [
                PublicKey.findProgramAddressSync([Buffer.from(SEEDS.FEE), tokenAMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                PublicKey.findProgramAddressSync([Buffer.from(SEEDS.FEE), tokenBMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            ];
            const payerPoolLp = yield getAssociatedTokenAccount(lpMint, payer);
            if (tokenAMint.equals(NATIVE_MINT)) {
                preInstructions = preInstructions.concat(wrapSOLInstruction(payer, payerTokenA, BigInt(tokenAAmount.toString())));
            }
            if (tokenBMint.equals(NATIVE_MINT)) {
                preInstructions = preInstructions.concat(wrapSOLInstruction(payer, payerTokenB, BigInt(tokenBAmount.toString())));
            }
            const [mintMetadata, _mintMetadataBump] = deriveMintMetadata(lpMint);
            const activationPoint = (opt === null || opt === void 0 ? void 0 : opt.activationPoint) || null;
            const createPermissionlessPoolTx = yield ammProgram.methods
                .initializePermissionlessConstantProductPoolWithConfig2(tokenAAmount, tokenBAmount, activationPoint)
                .accounts({
                pool: poolPubkey,
                tokenAMint,
                tokenBMint,
                aVault,
                bVault,
                aVaultLpMint,
                bVaultLpMint,
                aVaultLp,
                bVaultLp,
                lpMint,
                payerTokenA,
                payerTokenB,
                protocolTokenAFee,
                protocolTokenBFee,
                payerPoolLp,
                aTokenVault,
                bTokenVault,
                mintMetadata,
                metadataProgram: METAPLEX_PROGRAM,
                payer,
                config,
                rent: SYSVAR_RENT_PUBKEY,
                vaultProgram: vaultProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
                .transaction();
            const resultTx = [];
            if (preInstructions.length) {
                const preInstructionTx = new Transaction(Object.assign({ feePayer: payer }, (yield ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)))).add(...preInstructions);
                resultTx.push(preInstructionTx);
            }
            const setComputeUnitLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 1400000,
            });
            const mainTx = new Transaction(Object.assign({ feePayer: payer }, (yield ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment))))
                .add(setComputeUnitLimitIx);
            if (opt === null || opt === void 0 ? void 0 : opt.lockLiquidity) {
                const preLockLiquidityIx = [];
                const [lockEscrowPK] = deriveLockEscrowPda(poolPubkey, payer, ammProgram.programId);
                const createLockEscrowIx = yield ammProgram.methods
                    .createLockEscrow()
                    .accounts({
                    pool: poolPubkey,
                    lockEscrow: lockEscrowPK,
                    owner: payer,
                    lpMint,
                    payer,
                    systemProgram: SystemProgram.programId,
                })
                    .instruction();
                preLockLiquidityIx.push(createLockEscrowIx);
                const [escrowAta, createEscrowAtaIx] = yield getOrCreateATAInstruction(lpMint, lockEscrowPK, connection, payer);
                createEscrowAtaIx && preLockLiquidityIx.push(createEscrowAtaIx);
                const lockTx = yield ammProgram.methods
                    .lock(U64_MAX)
                    .accounts({
                    pool: poolPubkey,
                    lockEscrow: lockEscrowPK,
                    owner: payer,
                    lpMint,
                    sourceTokens: payerPoolLp,
                    escrowVault: escrowAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    aVault,
                    bVault,
                    aVaultLp,
                    bVaultLp,
                    aVaultLpMint,
                    bVaultLpMint,
                })
                    .preInstructions(preLockLiquidityIx)
                    .transaction();
                mainTx.add(lockTx);
            }
            resultTx.push(mainTx);
            return resultTx;
        });
    }
    static createPermissionlessConstantProductPoolWithConfig(connection, payer, tokenAMint, tokenBMint, tokenAAmount, tokenBAmount, config, program, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { vaultProgram, ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const [{ vaultPda: aVault, tokenVaultPda: aTokenVault, lpMintPda: aLpMintPda }, { vaultPda: bVault, tokenVaultPda: bTokenVault, lpMintPda: bLpMintPda },] = [getVaultPdas(tokenAMint, vaultProgram.programId), getVaultPdas(tokenBMint, vaultProgram.programId)];
            const [aVaultAccount, bVaultAccount] = yield Promise.all([
                vaultProgram.account.vault.fetchNullable(aVault),
                vaultProgram.account.vault.fetchNullable(bVault),
            ]);
            let aVaultLpMint = aLpMintPda;
            let bVaultLpMint = bLpMintPda;
            let preInstructions = [];
            if (!aVaultAccount) {
                const createVaultAIx = yield VaultImpl.createPermissionlessVaultInstruction(connection, payer, tokenAMint);
                createVaultAIx && preInstructions.push(createVaultAIx);
            }
            else {
                aVaultLpMint = aVaultAccount.lpMint; // Old vault doesn't have lp mint pda
            }
            if (!bVaultAccount) {
                const createVaultBIx = yield VaultImpl.createPermissionlessVaultInstruction(connection, payer, tokenBMint);
                createVaultBIx && preInstructions.push(createVaultBIx);
            }
            else {
                bVaultLpMint = bVaultAccount.lpMint; // Old vault doesn't have lp mint pda
            }
            const poolPubkey = deriveConstantProductPoolAddressWithConfig(tokenAMint, tokenBMint, config, ammProgram.programId);
            const [lpMint] = PublicKey.findProgramAddressSync([Buffer.from(SEEDS.LP_MINT), poolPubkey.toBuffer()], ammProgram.programId);
            const [[aVaultLp], [bVaultLp]] = [
                PublicKey.findProgramAddressSync([aVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                PublicKey.findProgramAddressSync([bVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            ];
            const [[payerTokenA, createPayerTokenAIx], [payerTokenB, createPayerTokenBIx]] = yield Promise.all([
                getOrCreateATAInstruction(tokenAMint, payer, connection),
                getOrCreateATAInstruction(tokenBMint, payer, connection),
            ]);
            createPayerTokenAIx && !(opt === null || opt === void 0 ? void 0 : opt.skipAAta) && preInstructions.push(createPayerTokenAIx);
            createPayerTokenBIx && !(opt === null || opt === void 0 ? void 0 : opt.skipBAta) && preInstructions.push(createPayerTokenBIx);
            const [[protocolTokenAFee], [protocolTokenBFee]] = [
                PublicKey.findProgramAddressSync([Buffer.from(SEEDS.FEE), tokenAMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                PublicKey.findProgramAddressSync([Buffer.from(SEEDS.FEE), tokenBMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            ];
            const payerPoolLp = yield getAssociatedTokenAccount(lpMint, payer);
            const [mintMetadata, _mintMetadataBump] = deriveMintMetadata(lpMint);
            const createPermissionlessPoolTx = yield ammProgram.methods
                .initializePermissionlessConstantProductPoolWithConfig(tokenAAmount, tokenBAmount)
                .accounts({
                pool: poolPubkey,
                tokenAMint,
                tokenBMint,
                aVault,
                bVault,
                aVaultLpMint,
                bVaultLpMint,
                aVaultLp,
                bVaultLp,
                lpMint,
                payerTokenA,
                payerTokenB,
                protocolTokenAFee,
                protocolTokenBFee,
                payerPoolLp,
                aTokenVault,
                bTokenVault,
                mintMetadata,
                metadataProgram: METAPLEX_PROGRAM,
                payer,
                config,
                rent: SYSVAR_RENT_PUBKEY,
                vaultProgram: vaultProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
                .transaction();
            const resultTx = [];
            if (preInstructions.length) {
                const preInstructionTx = new Transaction(Object.assign({ feePayer: payer }, (yield ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)))).add(...preInstructions);
                resultTx.push(preInstructionTx);
            }
            const bondingCurve = (PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(tokenBMint).toBuffer()], program.programId))[0];
            if (opt === null || opt === void 0 ? void 0 : opt.lockLiquidity) {
                const preLockLiquidityIx = [];
                const [lockEscrowPK] = deriveLockEscrowPda(poolPubkey, bondingCurve, ammProgram.programId);
                const [escrowAta, createEscrowAtaIx] = yield getOrCreateATAInstruction(lpMint, lockEscrowPK, connection, payer);
                createEscrowAtaIx && preLockLiquidityIx.push(createEscrowAtaIx);
                console.log({ pool: poolPubkey,
                    lockEscrow: lockEscrowPK,
                    owner: bondingCurve,
                    lpMint,
                    sourceTokens: getAssociatedTokenAccount(lpMint, bondingCurve),
                    escrowVault: escrowAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    aVault,
                    bVault,
                    aVaultLp,
                    lockEscrowTokenAccount: escrowAta,
                    config,
                    bVaultLp,
                    tokenAMint,
                    payerTokenA: getAssociatedTokenAccount(tokenBMint, bondingCurve),
                    payerTokenB,
                    tokenBMint,
                    aVaultLpMint,
                    bondingCurve,
                    vaultProgram: ammProgram.programId,
                    bVaultLpMint,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    mintMetadata: PublicKey.findProgramAddressSync([Buffer.from("metadata"), new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(), lpMint.toBuffer()], new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"))[0],
                    metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
                    payerPoolLp: getAssociatedTokenAccount(lpMint, bondingCurve),
                    protocolTokenAFee: getAssociatedTokenAccount(tokenAMint, bondingCurve),
                    protocolTokenBFee: getAssociatedTokenAccount(tokenBMint, bondingCurve),
                    aTokenVault: aTokenVault,
                    payer: payer,
                    rent: SYSVAR_RENT_PUBKEY,
                    bTokenVault: bTokenVault });
                const [[protocolTokenAFee], [protocolTokenBFee]] = [
                    PublicKey.findProgramAddressSync([Buffer.from(SEEDS.FEE), tokenAMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                    PublicKey.findProgramAddressSync([Buffer.from(SEEDS.FEE), tokenBMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                ];
                const lockTx = yield program.methods
                    .createPermissionlessConstantProductPoolWithConfig(tokenAAmount, tokenBAmount)
                    .accounts({
                    pool: poolPubkey,
                    lockEscrow: lockEscrowPK,
                    owner: bondingCurve,
                    lpMint,
                    sourceTokens: getAssociatedTokenAccount(lpMint, bondingCurve),
                    escrowVault: escrowAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    aVault,
                    bVault,
                    aVaultLp,
                    lockEscrowTokenAccount: escrowAta,
                    config,
                    bVaultLp,
                    tokenAMint,
                    dynamicAmmProgram: ammProgram.programId,
                    payerTokenA: getAssociatedTokenAddressSync(tokenAMint, payer, true),
                    payerTokenB: getAssociatedTokenAddressSync(tokenBMint, payer, true),
                    tokenBMint,
                    bondingB: getAssociatedTokenAddressSync(tokenBMint, bondingCurve, true),
                    aVaultLpMint,
                    bondingCurve,
                    vaultProgram: vaultProgram.programId,
                    bVaultLpMint,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    mintMetadata: PublicKey.findProgramAddressSync([Buffer.from("metadata"), new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(), lpMint.toBuffer()], new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"))[0],
                    metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
                    payerPoolLp: getAssociatedTokenAccount(lpMint, payer),
                    bondingPoolLp: getAssociatedTokenAddressSync(lpMint, bondingCurve, true),
                    protocolTokenAFee: protocolTokenAFee,
                    protocolTokenBFee: protocolTokenBFee,
                    aTokenVault: aTokenVault,
                    payer: payer,
                    rent: SYSVAR_RENT_PUBKEY,
                    bTokenVault: bTokenVault
                })
                    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 })])
                    .transaction();
                const anotherTx = yield program.methods
                    .create2()
                    .accounts({
                    pool: poolPubkey,
                    dynamicAmmProgram: ammProgram.programId,
                    lockEscrow: lockEscrowPK,
                    owner: bondingCurve,
                    lpMint,
                    sourceTokens: getAssociatedTokenAccount(lpMint, bondingCurve),
                    escrowVault: escrowAta,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    aVault,
                    bVault, bondingPoolLp: getAssociatedTokenAddressSync(lpMint, bondingCurve, true),
                    bondingB: getAssociatedTokenAddressSync(tokenBMint, bondingCurve, true),
                    aVaultLp,
                    lockEscrowTokenAccount: escrowAta,
                    config,
                    bVaultLp,
                    tokenAMint,
                    payerTokenA: getAssociatedTokenAddressSync(tokenAMint, bondingCurve, true),
                    payerTokenB: getAssociatedTokenAddressSync(tokenBMint, bondingCurve, true),
                    tokenBMint,
                    aVaultLpMint,
                    bondingCurve,
                    vaultProgram: ammProgram.programId,
                    bVaultLpMint,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    mintMetadata: PublicKey.findProgramAddressSync([Buffer.from("metadata"), new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(), lpMint.toBuffer()], new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"))[0],
                    metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
                    payerPoolLp: getAssociatedTokenAccount(lpMint, bondingCurve),
                    protocolTokenAFee: protocolTokenAFee,
                    protocolTokenBFee: protocolTokenBFee,
                    aTokenVault: aTokenVault,
                    payer: payer,
                    rent: SYSVAR_RENT_PUBKEY,
                    bTokenVault: bTokenVault
                })
                    .preInstructions([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 })])
                    .transaction();
                const preTx = new Transaction().add(...([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 }), SystemProgram.transfer({
                        fromPubkey: payer,
                        toPubkey: getAssociatedTokenAddressSync(tokenAMint, bondingCurve, true),
                        lamports: BigInt(tokenAAmount.toString())
                    }),
                    createAssociatedTokenAccountInstruction(payer, getAssociatedTokenAddressSync(NATIVE_MINT, bondingCurve, true), bondingCurve, NATIVE_MINT), ...wrapSOLInstruction(payer, getAssociatedTokenAddressSync(tokenAMint, bondingCurve, true), BigInt(tokenAAmount.toString()))]));
                if (createEscrowAtaIx) {
                    anotherTx.instructions.unshift(createEscrowAtaIx);
                }
                preTx.recentBlockhash = (yield connection.getLatestBlockhash()).blockhash;
                preTx.feePayer = payer;
                anotherTx.recentBlockhash = (yield connection.getLatestBlockhash()).blockhash;
                anotherTx.feePayer = payer;
                lockTx.recentBlockhash = (yield connection.getLatestBlockhash()).blockhash;
                lockTx.feePayer = payer;
                resultTx.push(preTx);
                resultTx.push(lockTx);
                resultTx.push(anotherTx);
            }
            return resultTx;
        });
    }
    static createPermissionlessPool(connection, payer, tokenInfoA, tokenInfoB, tokenAAmount, tokenBAmount, isStable, tradeFeeBps, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { vaultProgram, ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const curveType = generateCurveType(tokenInfoA, tokenInfoB, isStable);
            const tokenAMint = new PublicKey(tokenInfoA.address);
            const tokenBMint = new PublicKey(tokenInfoB.address);
            const [{ vaultPda: aVault, tokenVaultPda: aTokenVault, lpMintPda: aLpMintPda }, { vaultPda: bVault, tokenVaultPda: bTokenVault, lpMintPda: bLpMintPda },] = [getVaultPdas(tokenAMint, vaultProgram.programId), getVaultPdas(tokenBMint, vaultProgram.programId)];
            const [aVaultAccount, bVaultAccount] = yield Promise.all([
                vaultProgram.account.vault.fetchNullable(aVault),
                vaultProgram.account.vault.fetchNullable(bVault),
            ]);
            let aVaultLpMint = aLpMintPda;
            let bVaultLpMint = bLpMintPda;
            let preInstructions = [];
            const setComputeUnitLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 600000,
            });
            preInstructions.push(setComputeUnitLimitIx);
            if (!aVaultAccount) {
                const createVaultAIx = yield VaultImpl.createPermissionlessVaultInstruction(connection, payer, new PublicKey(tokenInfoA.address));
                createVaultAIx && preInstructions.push(createVaultAIx);
            }
            else {
                aVaultLpMint = aVaultAccount.lpMint; // Old vault doesn't have lp mint pda
            }
            if (!bVaultAccount) {
                const createVaultBIx = yield VaultImpl.createPermissionlessVaultInstruction(connection, payer, new PublicKey(tokenInfoB.address));
                createVaultBIx && preInstructions.push(createVaultBIx);
            }
            else {
                bVaultLpMint = bVaultAccount.lpMint; // Old vault doesn't have lp mint pda
            }
            const poolPubkey = derivePoolAddress(connection, tokenInfoA, tokenInfoB, isStable, tradeFeeBps, {
                programId: opt === null || opt === void 0 ? void 0 : opt.programId,
            });
            const [[aVaultLp], [bVaultLp]] = [
                PublicKey.findProgramAddressSync([aVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                PublicKey.findProgramAddressSync([bVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            ];
            const [[payerTokenA, createPayerTokenAIx], [payerTokenB, createPayerTokenBIx]] = yield Promise.all([
                getOrCreateATAInstruction(tokenAMint, payer, connection),
                getOrCreateATAInstruction(tokenBMint, payer, connection),
            ]);
            createPayerTokenAIx && preInstructions.push(createPayerTokenAIx);
            createPayerTokenBIx && preInstructions.push(createPayerTokenBIx);
            const [[protocolTokenAFee], [protocolTokenBFee]] = [
                PublicKey.findProgramAddressSync([Buffer.from(SEEDS.FEE), tokenAMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                PublicKey.findProgramAddressSync([Buffer.from(SEEDS.FEE), tokenBMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            ];
            const [lpMint] = PublicKey.findProgramAddressSync([Buffer.from(SEEDS.LP_MINT), poolPubkey.toBuffer()], ammProgram.programId);
            const payerPoolLp = yield getAssociatedTokenAccount(lpMint, payer);
            if (tokenAMint.equals(NATIVE_MINT)) {
                preInstructions = preInstructions.concat(wrapSOLInstruction(payer, payerTokenA, BigInt(tokenAAmount.toString())));
            }
            if (tokenBMint.equals(NATIVE_MINT)) {
                preInstructions = preInstructions.concat(wrapSOLInstruction(payer, payerTokenB, BigInt(tokenBAmount.toString())));
            }
            const [mintMetadata, _mintMetadataBump] = deriveMintMetadata(lpMint);
            const createPermissionlessPoolTx = yield ammProgram.methods
                .initializePermissionlessPoolWithFeeTier(curveType, tradeFeeBps, tokenAAmount, tokenBAmount)
                .accounts({
                pool: poolPubkey,
                tokenAMint,
                tokenBMint,
                aVault,
                bVault,
                aVaultLpMint,
                bVaultLpMint,
                aVaultLp,
                bVaultLp,
                lpMint,
                payerTokenA,
                payerTokenB,
                protocolTokenAFee,
                protocolTokenBFee,
                payerPoolLp,
                aTokenVault,
                bTokenVault,
                mintMetadata,
                metadataProgram: METAPLEX_PROGRAM,
                feeOwner: FEE_OWNER,
                payer,
                rent: SYSVAR_RENT_PUBKEY,
                vaultProgram: vaultProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
                .preInstructions(preInstructions)
                .transaction();
            return new Transaction(Object.assign({ feePayer: payer }, (yield ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)))).add(createPermissionlessPoolTx);
        });
    }
    static createMultiple(connection, poolList, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const cluster = (_a = opt === null || opt === void 0 ? void 0 : opt.cluster) !== null && _a !== void 0 ? _a : 'mainnet-beta';
            const { provider, vaultProgram, ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const poolInfoMap = new Map();
            const poolsState = yield getAllPoolState(poolList, ammProgram);
            const PdaInfos = poolList.reduce((accList, _, index) => {
                const poolState = poolsState[index];
                return [...accList, poolState.aVault, poolState.bVault];
            }, []);
            const vaultsImpl = yield VaultImpl.createMultipleWithPda(connection, PdaInfos);
            const accountsToFetch = yield Promise.all(poolsState.map((poolState, index) => __awaiter(this, void 0, void 0, function* () {
                const pool = poolList[index];
                const vaultA = vaultsImpl.find(({ vaultPda }) => vaultPda.equals(poolState.aVault));
                const vaultB = vaultsImpl.find(({ vaultPda }) => vaultPda.equals(poolState.bVault));
                invariant(vaultA, `Vault ${poolState.tokenAMint.toBase58()} not found`);
                invariant(vaultB, `Vault ${poolState.tokenBMint.toBase58()} not found`);
                poolInfoMap.set(poolState.lpMint.toBase58(), {
                    pool,
                    poolState,
                    vaultA,
                    vaultB,
                    tokenAMint: vaultA.tokenMint,
                    tokenBMint: vaultB.tokenMint,
                });
                return [
                    { pubkey: vaultA.vaultState.tokenVault, type: AccountType.VAULT_A_RESERVE },
                    { pubkey: vaultB.vaultState.tokenVault, type: AccountType.VAULT_B_RESERVE },
                    { pubkey: vaultA.vaultState.lpMint, type: AccountType.VAULT_A_LP },
                    { pubkey: vaultB.vaultState.lpMint, type: AccountType.VAULT_B_LP },
                    { pubkey: poolState.aVaultLp, type: AccountType.POOL_VAULT_A_LP },
                    { pubkey: poolState.bVaultLp, type: AccountType.POOL_VAULT_B_LP },
                    { pubkey: poolState.lpMint, type: AccountType.POOL_LP_MINT },
                ];
            })));
            const flatAccountsToFetch = accountsToFetch.flat();
            const accountsBufferMap = yield getAccountsBuffer(connection, [
                ...flatAccountsToFetch,
                { pubkey: SYSVAR_CLOCK_PUBKEY, type: AccountType.SYSVAR_CLOCK },
            ]);
            const clockAccount = accountsBufferMap.get(SYSVAR_CLOCK_PUBKEY.toBase58());
            invariant(clockAccount, 'Clock account not found');
            const clock = ClockLayout.decode(clockAccount.account.data);
            const accountsInfoMap = deserializeAccountsBuffer(accountsBufferMap);
            const depegAccounts = yield getDepegAccounts(ammProgram.provider.connection, poolsState);
            const ammImpls = yield Promise.all(accountsToFetch.map((accounts) => __awaiter(this, void 0, void 0, function* () {
                const [tokenAVault, tokenBVault, vaultALp, vaultBLp, poolVaultA, poolVaultB, poolLpMint] = accounts; // must follow order
                const poolVaultALp = accountsInfoMap.get(poolVaultA.pubkey.toBase58());
                const poolVaultBLp = accountsInfoMap.get(poolVaultB.pubkey.toBase58());
                const vaultALpSupply = accountsInfoMap.get(vaultALp.pubkey.toBase58());
                const vaultBLpSupply = accountsInfoMap.get(vaultBLp.pubkey.toBase58());
                const vaultAReserve = accountsInfoMap.get(tokenAVault.pubkey.toBase58());
                const vaultBReserve = accountsInfoMap.get(tokenBVault.pubkey.toBase58());
                const poolLpSupply = accountsInfoMap.get(poolLpMint.pubkey.toBase58());
                const currentTime = clock.unixTimestamp;
                const currentSlot = clock.slot;
                invariant(!!currentTime &&
                    !!vaultALpSupply &&
                    !!vaultBLpSupply &&
                    !!vaultAReserve &&
                    !!vaultBReserve &&
                    !!poolVaultALp &&
                    !!poolVaultBLp &&
                    !!poolLpSupply, 'Account Info not found');
                const accountsInfo = {
                    currentTime,
                    currentSlot,
                    poolVaultALp,
                    poolVaultBLp,
                    vaultALpSupply,
                    vaultBLpSupply,
                    vaultAReserve,
                    vaultBReserve,
                    poolLpSupply,
                };
                const poolInfoData = poolInfoMap.get(poolLpMint.pubkey.toBase58());
                invariant(poolInfoData, 'Cannot find pool info');
                const { pool, poolState, vaultA, vaultB, tokenAMint, tokenBMint } = poolInfoData;
                let swapCurve;
                if ('stable' in poolState.curveType) {
                    const { amp, depeg, tokenMultiplier } = poolState.curveType['stable'];
                    swapCurve = new StableSwap(amp.toNumber(), tokenMultiplier, depeg, depegAccounts, currentTime, poolState.stake);
                }
                else {
                    swapCurve = new ConstantProductSwap();
                }
                const poolInfo = calculatePoolInfo(currentTime, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, poolLpSupply, swapCurve, vaultA.vaultState, vaultB.vaultState);
                return new AmmImpl(pool, ammProgram, vaultProgram, tokenAMint, tokenBMint, poolState, poolInfo, vaultA, vaultB, accountsInfo, swapCurve, depegAccounts, {
                    cluster,
                });
            })));
            return ammImpls;
        });
    }
    /**
     * Retrieves the pool configuration with the authority of the pool creator.
     *
     * @param {Connection} connection - The connection to the Solana network.
     * @param {PublicKey} wallet - The public key of the wallet.
     * @param {Object} [opt] - Optional parameters.
     * @return {Promise<Array<Account<Config>>>} A promise that resolves to an array of pool configuration accounts which the wallet can used to create pools.
     */
    static getPoolConfigsWithPoolCreatorAuthority(connection, wallet, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const configAccounts = yield ammProgram.account.config.all([
                {
                    memcmp: {
                        offset: 8 + 72,
                        bytes: wallet.toBase58(),
                    },
                },
            ]);
            return configAccounts;
        });
    }
    static getPoolConfig(connection, config, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const configAccount = yield ammProgram.account.config.fetch(config);
            return configAccount;
        });
    }
    static getFeeConfigurations(connection, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const configs = yield ammProgram.account.config.all();
            return configs.map((configAccount) => {
                const { poolFees } = configAccount.account;
                return {
                    publicKey: configAccount.publicKey,
                    tradeFeeBps: poolFees.tradeFeeNumerator.mul(new BN(10000)).div(poolFees.tradeFeeDenominator),
                    protocolTradeFeeBps: poolFees.protocolTradeFeeNumerator
                        .mul(new BN(10000))
                        .div(poolFees.protocolTradeFeeDenominator),
                };
            });
        });
    }
    static getLockedLpAmountByUser(connection, userPubKey, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const lockEscrows = yield ammProgram.account.lockEscrow.all([
                {
                    memcmp: {
                        bytes: bs58.encode(userPubKey.toBuffer()),
                        offset: 8 + 32,
                    },
                },
            ]);
            return lockEscrows.reduce((accMap, { account }) => {
                return accMap.set(account.pool.toBase58(), account);
            }, new Map());
        });
    }
    static fetchMultipleUserBalance(connection, lpMintList, owner) {
        return __awaiter(this, void 0, void 0, function* () {
            const ataAccounts = yield Promise.all(lpMintList.map((lpMint) => getAssociatedTokenAccount(lpMint, owner)));
            const accountsInfo = yield chunkedGetMultipleAccountInfos(connection, ataAccounts);
            return accountsInfo.map((accountInfo) => {
                if (!accountInfo)
                    return new BN(0);
                const accountBalance = deserializeAccount(accountInfo.data);
                if (!accountBalance)
                    throw new Error('Failed to parse user account for LP token.');
                return new BN(accountBalance.amount.toString());
            });
        });
    }
    static create(connection, pool, opt) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const cluster = (_a = opt === null || opt === void 0 ? void 0 : opt.cluster) !== null && _a !== void 0 ? _a : 'mainnet-beta';
            const { vaultProgram, ammProgram } = createProgram(connection, opt === null || opt === void 0 ? void 0 : opt.programId);
            const poolState = yield getPoolState(pool, ammProgram);
            const pdaInfos = [poolState.aVault, poolState.bVault];
            const [vaultA, vaultB] = yield VaultImpl.createMultipleWithPda(connection, pdaInfos, {
                seedBaseKey: opt === null || opt === void 0 ? void 0 : opt.vaultSeedBaseKey,
            });
            const accountsBufferMap = yield getAccountsBuffer(connection, [
                { pubkey: vaultA.vaultState.tokenVault, type: AccountType.VAULT_A_RESERVE },
                { pubkey: vaultB.vaultState.tokenVault, type: AccountType.VAULT_B_RESERVE },
                { pubkey: vaultA.vaultState.lpMint, type: AccountType.VAULT_A_LP },
                { pubkey: vaultB.vaultState.lpMint, type: AccountType.VAULT_B_LP },
                { pubkey: poolState.aVaultLp, type: AccountType.POOL_VAULT_A_LP },
                { pubkey: poolState.bVaultLp, type: AccountType.POOL_VAULT_B_LP },
                { pubkey: poolState.lpMint, type: AccountType.POOL_LP_MINT },
                { pubkey: SYSVAR_CLOCK_PUBKEY, type: AccountType.SYSVAR_CLOCK },
            ]);
            const accountsInfoMap = deserializeAccountsBuffer(accountsBufferMap);
            const clockAccount = accountsBufferMap.get(SYSVAR_CLOCK_PUBKEY.toBase58());
            invariant(clockAccount, 'Clock account not found');
            const clock = ClockLayout.decode(clockAccount.account.data);
            const poolVaultALp = accountsInfoMap.get(poolState.aVaultLp.toBase58());
            const poolVaultBLp = accountsInfoMap.get(poolState.bVaultLp.toBase58());
            const vaultALpSupply = accountsInfoMap.get(vaultA.vaultState.lpMint.toBase58());
            const vaultBLpSupply = accountsInfoMap.get(vaultB.vaultState.lpMint.toBase58());
            const vaultAReserve = accountsInfoMap.get(vaultA.vaultState.tokenVault.toBase58());
            const vaultBReserve = accountsInfoMap.get(vaultB.vaultState.tokenVault.toBase58());
            const poolLpSupply = accountsInfoMap.get(poolState.lpMint.toBase58());
            const currentTime = clock.unixTimestamp;
            const currentSlot = clock.slot;
            invariant(!!currentTime &&
                !!vaultALpSupply &&
                !!vaultBLpSupply &&
                !!vaultAReserve &&
                !!vaultBReserve &&
                !!poolVaultALp &&
                !!poolVaultBLp &&
                !!poolLpSupply, 'Account Info not found');
            const accountsInfo = {
                currentTime,
                currentSlot,
                poolVaultALp,
                poolVaultBLp,
                vaultALpSupply,
                vaultBLpSupply,
                vaultAReserve,
                vaultBReserve,
                poolLpSupply,
            };
            const depegAccounts = yield getDepegAccounts(ammProgram.provider.connection, [poolState]);
            let swapCurve;
            if ('stable' in poolState.curveType) {
                const { amp, depeg, tokenMultiplier } = poolState.curveType['stable'];
                swapCurve = new StableSwap(amp.toNumber(), tokenMultiplier, depeg, depegAccounts, currentTime, poolState.stake);
            }
            else {
                swapCurve = new ConstantProductSwap();
            }
            const poolInfo = calculatePoolInfo(currentTime, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, poolLpSupply, swapCurve, vaultA.vaultState, vaultB.vaultState);
            return new AmmImpl(pool, ammProgram, vaultProgram, vaultA.tokenMint, vaultB.tokenMint, poolState, poolInfo, vaultA, vaultB, accountsInfo, swapCurve, depegAccounts, {
                cluster,
            });
        });
    }
    get decimals() {
        return Math.max(this.tokenAMint.decimals, this.tokenBMint.decimals);
    }
    get isStablePool() {
        return 'stable' in this.poolState.curveType;
    }
    get isLST() {
        var _a;
        if (!this.isStablePool || !((_a = this.swapCurve.depeg) === null || _a === void 0 ? void 0 : _a.depegType))
            return false;
        return !Object.keys(this.swapCurve.depeg.depegType).includes('none');
    }
    get feeBps() {
        return this.poolState.fees.tradeFeeNumerator.mul(new BN(10000)).div(this.poolState.fees.tradeFeeDenominator);
    }
    get depegToken() {
        if (!this.isStablePool)
            return null;
        const { tokenMultiplier } = this.poolState.curveType['stable'];
        const tokenABalance = this.poolInfo.tokenAAmount.mul(tokenMultiplier.tokenAMultiplier);
        const tokenBBalance = this.poolInfo.tokenBAmount.mul(tokenMultiplier.tokenBMultiplier);
        const totalTokenBalance = tokenABalance.add(tokenBBalance);
        if (totalTokenBalance.isZero())
            return null;
        const isTokenADepeg = this.poolInfo.tokenAAmount
            .mul(new BN(2))
            .div(totalTokenBalance)
            .mul(new BN(100))
            .gt(new BN(95));
        const isTokenBDepeg = this.poolInfo.tokenBAmount
            .mul(new BN(2))
            .div(totalTokenBalance)
            .mul(new BN(100))
            .gt(new BN(95));
        if (isTokenADepeg)
            return this.tokenAMint;
        if (isTokenBDepeg)
            return this.tokenBMint;
        return null;
    }
    getLockedAtaAmount() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const poolLpAta = yield getAssociatedTokenAccount(this.poolState.lpMint, this.address);
                const info = yield this.program.provider.connection.getTokenAccountBalance(poolLpAta);
                return new BN(info.value.amount);
            }
            catch (e) {
                return new BN(0);
            }
        });
    }
    getLockedLpAmount() {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.getLockedAtaAmount()).add(this.poolState.totalLockedLp);
        });
    }
    /**
     * It updates the state of the pool
     */
    updateState() {
        return __awaiter(this, void 0, void 0, function* () {
            const [poolState] = yield Promise.all([
                getPoolState(this.address, this.program),
                this.vaultA.refreshVaultState(),
                this.vaultB.refreshVaultState(),
            ]);
            this.poolState = poolState;
            const accountsBufferMap = yield getAccountsBuffer(this.program.provider.connection, [
                { pubkey: this.vaultA.vaultState.tokenVault, type: AccountType.VAULT_A_RESERVE },
                { pubkey: this.vaultB.vaultState.tokenVault, type: AccountType.VAULT_B_RESERVE },
                { pubkey: this.vaultA.vaultState.lpMint, type: AccountType.VAULT_A_LP },
                { pubkey: this.vaultB.vaultState.lpMint, type: AccountType.VAULT_B_LP },
                { pubkey: poolState.aVaultLp, type: AccountType.POOL_VAULT_A_LP },
                { pubkey: poolState.bVaultLp, type: AccountType.POOL_VAULT_B_LP },
                { pubkey: poolState.lpMint, type: AccountType.POOL_LP_MINT },
                { pubkey: SYSVAR_CLOCK_PUBKEY, type: AccountType.SYSVAR_CLOCK },
            ]);
            const accountsInfoMap = deserializeAccountsBuffer(accountsBufferMap);
            const clockAccount = accountsBufferMap.get(SYSVAR_CLOCK_PUBKEY.toBase58());
            invariant(clockAccount, 'Clock account not found');
            const clock = ClockLayout.decode(clockAccount.account.data);
            const poolVaultALp = accountsInfoMap.get(poolState.aVaultLp.toBase58());
            const poolVaultBLp = accountsInfoMap.get(poolState.bVaultLp.toBase58());
            const vaultALpSupply = accountsInfoMap.get(this.vaultA.vaultState.lpMint.toBase58());
            const vaultBLpSupply = accountsInfoMap.get(this.vaultB.vaultState.lpMint.toBase58());
            const vaultAReserve = accountsInfoMap.get(this.vaultA.vaultState.tokenVault.toBase58());
            const vaultBReserve = accountsInfoMap.get(this.vaultB.vaultState.tokenVault.toBase58());
            const poolLpSupply = accountsInfoMap.get(poolState.lpMint.toBase58());
            const currentTime = clock.unixTimestamp;
            const currentSlot = clock.slot;
            invariant(!!currentTime &&
                !!vaultALpSupply &&
                !!vaultBLpSupply &&
                !!vaultAReserve &&
                !!vaultBReserve &&
                !!poolVaultALp &&
                !!poolVaultBLp &&
                !!poolLpSupply, 'Account Info not found');
            this.accountsInfo = {
                currentTime,
                currentSlot,
                poolVaultALp,
                poolVaultBLp,
                vaultALpSupply,
                vaultBLpSupply,
                vaultAReserve,
                vaultBReserve,
                poolLpSupply,
            };
            this.depegAccounts = yield getDepegAccounts(this.program.provider.connection, [poolState]);
            if ('stable' in poolState.curveType) {
                const { amp, depeg, tokenMultiplier } = poolState.curveType['stable'];
                this.swapCurve = new StableSwap(amp.toNumber(), tokenMultiplier, depeg, this.depegAccounts, currentTime, poolState.stake);
            }
            else {
                this.swapCurve = new ConstantProductSwap();
            }
            this.poolInfo = calculatePoolInfo(currentTime, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, poolLpSupply, this.swapCurve, this.vaultA.vaultState, this.vaultB.vaultState);
        });
    }
    /**
     * It returns the pool token mint.
     * @returns The poolState.lpMint
     */
    getPoolTokenMint() {
        return this.poolState.lpMint;
    }
    /**
     * It gets the total supply of the LP token
     * @returns The total supply of the LP token.
     */
    getLpSupply() {
        return __awaiter(this, void 0, void 0, function* () {
            const account = yield this.program.provider.connection.getTokenSupply(this.poolState.lpMint);
            invariant(account.value.amount, ERROR.INVALID_ACCOUNT);
            return new BN(account.value.amount);
        });
    }
    /**
     * Get the user's balance by looking up the account associated with the user's public key
     * @param {PublicKey} owner - PublicKey - The public key of the user you want to get the balance of
     * @returns The amount of tokens the user has.
     */
    getUserBalance(owner) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = yield getAssociatedTokenAccount(this.poolState.lpMint, owner);
            if (!account)
                return new BN(0);
            const parsedAccountInfo = yield this.program.provider.connection.getParsedAccountInfo(account);
            if (!parsedAccountInfo.value)
                return new BN(0);
            const accountInfoData = parsedAccountInfo.value.data.parsed;
            return new BN(accountInfoData.info.tokenAmount.amount);
        });
    }
    /**
     * `getSwapQuote` returns the amount of `outToken` that you will receive if you swap
     * `inAmountLamport` of `inToken` into the pool
     * @param {PublicKey} inTokenMint - The mint you want to swap from.
     * @param {BN} inAmountLamport - The amount of lamports you want to swap.
     * @param {number} [slippage] - The maximum amount of slippage you're willing to accept. (Max to 2 decimal place)
     * @returns The amount of the destination token that will be received after the swap.
     */
    getSwapQuote(inTokenMint, inAmountLamport, slippage) {
        const { amountOut, fee, priceImpact } = calculateSwapQuote(inTokenMint, inAmountLamport, {
            currentTime: this.accountsInfo.currentTime.toNumber(),
            currentSlot: this.accountsInfo.currentSlot.toNumber(),
            poolState: this.poolState,
            depegAccounts: this.depegAccounts,
            poolVaultALp: this.accountsInfo.poolVaultALp,
            poolVaultBLp: this.accountsInfo.poolVaultBLp,
            vaultA: this.vaultA.vaultState,
            vaultB: this.vaultB.vaultState,
            vaultALpSupply: this.accountsInfo.vaultALpSupply,
            vaultBLpSupply: this.accountsInfo.vaultBLpSupply,
            vaultAReserve: this.accountsInfo.vaultAReserve,
            vaultBReserve: this.accountsInfo.vaultBReserve,
        });
        return {
            swapInAmount: inAmountLamport,
            swapOutAmount: amountOut,
            minSwapOutAmount: getMinAmountWithSlippage(amountOut, slippage),
            fee,
            priceImpact,
        };
    }
    /**
     * Get maximum in amount (source amount) for swap
     * !!! NOTE it is just estimation
     * @param tokenMint
     */
    getMaxSwapInAmount(tokenMint) {
        // Get maximum in amount by swapping maximum withdrawable amount of tokenMint in the pool
        invariant(tokenMint.equals(this.poolState.tokenAMint) || tokenMint.equals(this.poolState.tokenBMint), ERROR.INVALID_MINT);
        const [outTokenMint, swapSourceAmount, swapDestAmount, tradeDirection] = tokenMint.equals(this.poolState.tokenAMint)
            ? [this.poolState.tokenBMint, this.poolInfo.tokenAAmount, this.poolInfo.tokenBAmount, TradeDirection.AToB]
            : [this.poolState.tokenAMint, this.poolInfo.tokenBAmount, this.poolInfo.tokenAAmount, TradeDirection.BToA];
        let maxOutAmount = this.getMaxSwapOutAmount(outTokenMint);
        // Impossible to deplete the pool, therefore if maxOutAmount is equals to tokenAmount in pool, subtract it by 1
        if (maxOutAmount.eq(swapDestAmount)) {
            maxOutAmount = maxOutAmount.sub(new BN(1)); // Left 1 token in pool
        }
        let maxInAmount = this.swapCurve.computeInAmount(maxOutAmount, swapSourceAmount, swapDestAmount, tradeDirection);
        const adminFee = this.calculateProtocolTradingFee(maxInAmount);
        const tradeFee = this.calculateTradingFee(maxInAmount);
        maxInAmount = maxInAmount.sub(adminFee);
        maxInAmount = maxInAmount.sub(tradeFee);
        return maxInAmount;
    }
    /**
     * `getMaxSwapOutAmount` returns the maximum amount of tokens that can be swapped out of the pool
     * @param {PublicKey} tokenMint - The mint of the token you want to swap out.
     * @returns The maximum amount of tokens that can be swapped out of the pool.
     */
    getMaxSwapOutAmount(tokenMint) {
        return calculateMaxSwapOutAmount(tokenMint, this.poolState.tokenAMint, this.poolState.tokenBMint, this.poolInfo.tokenAAmount, this.poolInfo.tokenBAmount, this.accountsInfo.vaultAReserve, this.accountsInfo.vaultBReserve);
    }
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
    swap(owner, inTokenMint, inAmountLamport, outAmountLamport, referralOwner) {
        return __awaiter(this, void 0, void 0, function* () {
            const [sourceToken, destinationToken] = this.tokenAMint.address.equals(inTokenMint)
                ? [this.poolState.tokenAMint, this.poolState.tokenBMint]
                : [this.poolState.tokenBMint, this.poolState.tokenAMint];
            const protocolTokenFee = this.tokenAMint.address.equals(inTokenMint)
                ? this.poolState.protocolTokenAFee
                : this.poolState.protocolTokenBFee;
            let preInstructions = [];
            const [[userSourceToken, createUserSourceIx], [userDestinationToken, createUserDestinationIx]] = yield this.createATAPreInstructions(owner, [sourceToken, destinationToken]);
            createUserSourceIx && preInstructions.push(createUserSourceIx);
            createUserDestinationIx && preInstructions.push(createUserDestinationIx);
            if (sourceToken.equals(NATIVE_MINT)) {
                preInstructions = preInstructions.concat(wrapSOLInstruction(owner, userSourceToken, BigInt(inAmountLamport.toString())));
            }
            const postInstructions = [];
            if (NATIVE_MINT.equals(destinationToken)) {
                const unwrapSOLIx = yield unwrapSOLInstruction(owner);
                unwrapSOLIx && postInstructions.push(unwrapSOLIx);
            }
            const remainingAccounts = this.swapCurve.getRemainingAccounts();
            if (referralOwner) {
                const [referralTokenAccount, createReferralTokenAccountIx] = yield getOrCreateATAInstruction(inTokenMint, referralOwner, this.program.provider.connection, owner);
                createReferralTokenAccountIx && preInstructions.push(createReferralTokenAccountIx);
                remainingAccounts.push({
                    isSigner: false,
                    isWritable: true,
                    pubkey: referralTokenAccount,
                });
            }
            const swapTx = yield this.program.methods
                .swap(inAmountLamport, outAmountLamport)
                .accounts({
                aTokenVault: this.vaultA.vaultState.tokenVault,
                bTokenVault: this.vaultB.vaultState.tokenVault,
                aVault: this.poolState.aVault,
                bVault: this.poolState.bVault,
                aVaultLp: this.poolState.aVaultLp,
                bVaultLp: this.poolState.bVaultLp,
                aVaultLpMint: this.vaultA.vaultState.lpMint,
                bVaultLpMint: this.vaultB.vaultState.lpMint,
                userSourceToken,
                userDestinationToken,
                user: owner,
                protocolTokenFee,
                pool: this.address,
                tokenProgram: TOKEN_PROGRAM_ID,
                vaultProgram: this.vaultProgram.programId,
            })
                .remainingAccounts(remainingAccounts)
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction();
            return new Transaction(Object.assign({ feePayer: owner }, (yield this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)))).add(swapTx);
        });
    }
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
    getDepositQuote(tokenAInAmount, tokenBInAmount, balance, slippage) {
        invariant(!(!this.isStablePool &&
            !tokenAInAmount.isZero() &&
            !tokenBInAmount.isZero() &&
            !this.accountsInfo.poolLpSupply.isZero()), 'Constant product only supports balanced deposit');
        invariant(!(!tokenAInAmount.isZero() && !tokenBInAmount.isZero() && balance), 'Deposit balance is not possible when both token in amount is non-zero');
        if (this.accountsInfo.poolLpSupply.isZero()) {
            const poolTokenAmountOut = this.swapCurve.computeD(tokenAInAmount, tokenBInAmount);
            return {
                poolTokenAmountOut,
                minPoolTokenAmountOut: poolTokenAmountOut,
                tokenAInAmount: tokenAInAmount,
                tokenBInAmount: tokenBInAmount,
            };
        }
        const vaultAWithdrawableAmount = calculateWithdrawableAmount(this.accountsInfo.currentTime.toNumber(), this.vaultA.vaultState);
        const vaultBWithdrawableAmount = calculateWithdrawableAmount(this.accountsInfo.currentTime.toNumber(), this.vaultB.vaultState);
        if (tokenAInAmount.isZero() && balance) {
            const poolTokenAmountOut = this.getShareByAmount(tokenBInAmount, this.poolInfo.tokenBAmount, this.accountsInfo.poolLpSupply);
            const bufferedPoolTokenAmountOut = getMinAmountWithSlippage(poolTokenAmountOut, UNLOCK_AMOUNT_BUFFER);
            // Calculate for stable pool balance deposit but used `addImbalanceLiquidity`
            if (this.isStablePool) {
                return {
                    poolTokenAmountOut: bufferedPoolTokenAmountOut,
                    minPoolTokenAmountOut: getMinAmountWithSlippage(bufferedPoolTokenAmountOut, slippage),
                    tokenAInAmount: tokenBInAmount.mul(this.poolInfo.tokenAAmount).div(this.poolInfo.tokenBAmount),
                    tokenBInAmount,
                };
            }
            // Constant product pool balance deposit
            const [actualTokenAInAmount, actualTokenBInAmount] = this.computeActualInAmount(poolTokenAmountOut, this.accountsInfo.poolLpSupply, this.accountsInfo.poolVaultALp, this.accountsInfo.poolVaultBLp, this.accountsInfo.vaultALpSupply, this.accountsInfo.vaultBLpSupply, vaultAWithdrawableAmount, vaultBWithdrawableAmount);
            return {
                poolTokenAmountOut: bufferedPoolTokenAmountOut,
                minPoolTokenAmountOut: getMinAmountWithSlippage(bufferedPoolTokenAmountOut, slippage),
                tokenAInAmount: getMaxAmountWithSlippage(actualTokenAInAmount, slippage),
                tokenBInAmount: getMaxAmountWithSlippage(actualTokenBInAmount, slippage),
            };
        }
        if (tokenBInAmount.isZero() && balance) {
            const poolTokenAmountOut = this.getShareByAmount(tokenAInAmount, this.poolInfo.tokenAAmount, this.accountsInfo.poolLpSupply);
            const bufferedPoolTokenAmountOut = getMinAmountWithSlippage(poolTokenAmountOut, UNLOCK_AMOUNT_BUFFER);
            // Calculate for stable pool balance deposit but used `addImbalanceLiquidity`
            if (this.isStablePool) {
                return {
                    poolTokenAmountOut: bufferedPoolTokenAmountOut,
                    minPoolTokenAmountOut: getMinAmountWithSlippage(bufferedPoolTokenAmountOut, slippage),
                    tokenAInAmount,
                    tokenBInAmount: tokenAInAmount.mul(this.poolInfo.tokenBAmount).div(this.poolInfo.tokenAAmount),
                };
            }
            // Constant product pool
            const [actualTokenAInAmount, actualTokenBInAmount] = this.computeActualInAmount(poolTokenAmountOut, this.accountsInfo.poolLpSupply, this.accountsInfo.poolVaultALp, this.accountsInfo.poolVaultBLp, this.accountsInfo.vaultALpSupply, this.accountsInfo.vaultBLpSupply, vaultAWithdrawableAmount, vaultBWithdrawableAmount);
            return {
                poolTokenAmountOut: bufferedPoolTokenAmountOut,
                minPoolTokenAmountOut: getMinAmountWithSlippage(bufferedPoolTokenAmountOut, slippage),
                tokenAInAmount: getMaxAmountWithSlippage(actualTokenAInAmount, slippage),
                tokenBInAmount: getMaxAmountWithSlippage(actualTokenBInAmount, slippage),
            };
        }
        // Imbalance deposit
        const actualDepositAAmount = computeActualDepositAmount(tokenAInAmount, this.poolInfo.tokenAAmount, this.accountsInfo.poolVaultALp, this.accountsInfo.vaultALpSupply, vaultAWithdrawableAmount);
        const actualDepositBAmount = computeActualDepositAmount(tokenBInAmount, this.poolInfo.tokenBAmount, this.accountsInfo.poolVaultBLp, this.accountsInfo.vaultBLpSupply, vaultBWithdrawableAmount);
        const poolTokenAmountOut = this.swapCurve.computeImbalanceDeposit(actualDepositAAmount, actualDepositBAmount, this.poolInfo.tokenAAmount, this.poolInfo.tokenBAmount, this.accountsInfo.poolLpSupply, this.poolState.fees);
        return {
            poolTokenAmountOut,
            minPoolTokenAmountOut: getMinAmountWithSlippage(poolTokenAmountOut, slippage),
            tokenAInAmount,
            tokenBInAmount,
        };
    }
    /**
     * `deposit` creates a transaction that deposits `tokenAInAmount` and `tokenBInAmount` into the pool,
     * and mints `poolTokenAmount` of the pool's liquidity token
     * @param {PublicKey} owner - PublicKey - The public key of the user who is depositing liquidity
     * @param {BN} tokenAInAmount - The amount of token A you want to deposit
     * @param {BN} tokenBInAmount - The amount of token B you want to deposit
     * @param {BN} poolTokenAmount - The amount of pool tokens you want to mint.
     * @returns A transaction object
     */
    deposit(owner, tokenAInAmount, tokenBInAmount, poolTokenAmount) {
        return __awaiter(this, void 0, void 0, function* () {
            const { tokenAMint, tokenBMint, lpMint, lpSupply } = this.poolState;
            const [[userAToken, createTokenAIx], [userBToken, createTokenBIx], [userPoolLp, createLpMintIx]] = yield this.createATAPreInstructions(owner, [tokenAMint, tokenBMint, lpMint]);
            let preInstructions = [];
            createTokenAIx && preInstructions.push(createTokenAIx);
            createTokenBIx && preInstructions.push(createTokenBIx);
            createLpMintIx && preInstructions.push(createLpMintIx);
            if (NATIVE_MINT.equals(this.tokenAMint.address)) {
                preInstructions = preInstructions.concat(wrapSOLInstruction(owner, userAToken, BigInt(tokenAInAmount.toString())));
            }
            if (NATIVE_MINT.equals(this.tokenBMint.address)) {
                preInstructions = preInstructions.concat(wrapSOLInstruction(owner, userBToken, BigInt(tokenBInAmount.toString())));
            }
            const postInstructions = [];
            if ([this.tokenAMint.address.toBase58(), this.tokenBMint.address.toBase58()].includes(NATIVE_MINT.toBase58())) {
                const closeWrappedSOLIx = yield unwrapSOLInstruction(owner);
                closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
            }
            const programMethod = () => {
                if (lpSupply.isZero())
                    return this.program.methods.bootstrapLiquidity(tokenAInAmount, tokenBInAmount);
                if (this.isStablePool)
                    return this.program.methods.addImbalanceLiquidity(poolTokenAmount, tokenAInAmount, tokenBInAmount);
                return this.program.methods.addBalanceLiquidity(poolTokenAmount, tokenAInAmount, tokenBInAmount);
            };
            const depositTx = yield programMethod()
                .accounts({
                aTokenVault: this.vaultA.vaultState.tokenVault,
                bTokenVault: this.vaultB.vaultState.tokenVault,
                aVault: this.poolState.aVault,
                bVault: this.poolState.bVault,
                pool: this.address,
                user: owner,
                userAToken,
                userBToken,
                aVaultLp: this.poolState.aVaultLp,
                bVaultLp: this.poolState.bVaultLp,
                aVaultLpMint: this.vaultA.vaultState.lpMint,
                bVaultLpMint: this.vaultB.vaultState.lpMint,
                lpMint: this.poolState.lpMint,
                tokenProgram: TOKEN_PROGRAM_ID,
                vaultProgram: this.vaultProgram.programId,
                userPoolLp,
            })
                .remainingAccounts(this.swapCurve.getRemainingAccounts())
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction();
            return new Transaction(Object.assign({ feePayer: owner }, (yield this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)))).add(depositTx);
        });
    }
    /**
     * `getWithdrawQuote` is a function that takes in a withdraw amount and returns the amount of tokens
     * that will be withdrawn from the pool
     * @param {BN} withdrawTokenAmount - The amount of tokens you want to withdraw from the pool.
     * @param {PublicKey} [tokenMint] - The token you want to withdraw. If you want balanced withdraw, leave this blank.
     * @param {number} [slippage] - The amount of slippage you're willing to accept. (Max to 2 decimal place)
     * @returns The return value is a tuple of the poolTokenAmountIn, tokenAOutAmount, and
     * tokenBOutAmount.
     */
    getWithdrawQuote(withdrawTokenAmount, slippage, tokenMint) {
        const vaultAWithdrawableAmount = calculateWithdrawableAmount(this.accountsInfo.currentTime.toNumber(), this.vaultA.vaultState);
        const vaultBWithdrawableAmount = calculateWithdrawableAmount(this.accountsInfo.currentTime.toNumber(), this.vaultB.vaultState);
        // balance withdraw
        if (!tokenMint) {
            const vaultALpBurn = this.getShareByAmount(withdrawTokenAmount, this.accountsInfo.poolLpSupply, this.accountsInfo.poolVaultALp);
            const vaultBLpBurn = this.getShareByAmount(withdrawTokenAmount, this.accountsInfo.poolLpSupply, this.accountsInfo.poolVaultBLp);
            const tokenAOutAmount = this.getAmountByShare(vaultALpBurn, vaultAWithdrawableAmount, this.accountsInfo.vaultALpSupply);
            const tokenBOutAmount = this.getAmountByShare(vaultBLpBurn, vaultBWithdrawableAmount, this.accountsInfo.vaultBLpSupply);
            return {
                poolTokenAmountIn: withdrawTokenAmount,
                tokenAOutAmount,
                tokenBOutAmount,
                minTokenAOutAmount: getMinAmountWithSlippage(tokenAOutAmount, slippage),
                minTokenBOutAmount: getMinAmountWithSlippage(tokenBOutAmount, slippage),
            };
        }
        // Imbalance withdraw
        const isWithdrawingTokenA = tokenMint.equals(this.tokenAMint.address);
        const isWithdrawingTokenB = tokenMint.equals(this.tokenBMint.address);
        invariant(isWithdrawingTokenA || isWithdrawingTokenB, ERROR.INVALID_MINT);
        const tradeDirection = tokenMint.equals(this.poolState.tokenAMint) ? TradeDirection.BToA : TradeDirection.AToB;
        const outAmount = this.swapCurve.computeWithdrawOne(withdrawTokenAmount, this.accountsInfo.poolLpSupply, this.poolInfo.tokenAAmount, this.poolInfo.tokenBAmount, this.poolState.fees, tradeDirection);
        const [vaultLpSupply, vaultTotalAmount] = tradeDirection == TradeDirection.AToB
            ? [this.accountsInfo.vaultBLpSupply, vaultBWithdrawableAmount]
            : [this.accountsInfo.vaultALpSupply, vaultAWithdrawableAmount];
        const vaultLpToBurn = outAmount.mul(vaultLpSupply).div(vaultTotalAmount);
        // "Actual" out amount (precision loss)
        const realOutAmount = vaultLpToBurn.mul(vaultTotalAmount).div(vaultLpSupply);
        const minRealOutAmount = getMinAmountWithSlippage(realOutAmount, slippage);
        return {
            poolTokenAmountIn: withdrawTokenAmount,
            tokenAOutAmount: isWithdrawingTokenA ? realOutAmount : new BN(0),
            tokenBOutAmount: isWithdrawingTokenB ? realOutAmount : new BN(0),
            minTokenAOutAmount: isWithdrawingTokenA ? minRealOutAmount : new BN(0),
            minTokenBOutAmount: isWithdrawingTokenB ? minRealOutAmount : new BN(0),
        };
    }
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
    withdraw(owner, lpTokenAmount, tokenAOutAmount, tokenBOutAmount) {
        return __awaiter(this, void 0, void 0, function* () {
            const preInstructions = [];
            const [[userAToken, createUserAIx], [userBToken, createUserBIx], [userPoolLp, createLpTokenIx]] = yield Promise.all([this.poolState.tokenAMint, this.poolState.tokenBMint, this.poolState.lpMint].map((key) => getOrCreateATAInstruction(key, owner, this.program.provider.connection)));
            createUserAIx && preInstructions.push(createUserAIx);
            createUserBIx && preInstructions.push(createUserBIx);
            createLpTokenIx && preInstructions.push(createLpTokenIx);
            const postInstructions = [];
            if ([this.tokenAMint.address.toBase58(), this.tokenBMint.address.toBase58()].includes(NATIVE_MINT.toBase58())) {
                const closeWrappedSOLIx = yield unwrapSOLInstruction(owner);
                closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
            }
            const programMethod = this.isStablePool && (tokenAOutAmount.isZero() || tokenBOutAmount.isZero())
                ? this.program.methods.removeLiquiditySingleSide(lpTokenAmount, new BN(0)).accounts({
                    aTokenVault: this.vaultA.vaultState.tokenVault,
                    aVault: this.poolState.aVault,
                    aVaultLp: this.poolState.aVaultLp,
                    aVaultLpMint: this.vaultA.vaultState.lpMint,
                    bTokenVault: this.vaultB.vaultState.tokenVault,
                    bVault: this.poolState.bVault,
                    bVaultLp: this.poolState.bVaultLp,
                    bVaultLpMint: this.vaultB.vaultState.lpMint,
                    lpMint: this.poolState.lpMint,
                    pool: this.address,
                    userDestinationToken: tokenBOutAmount.isZero() ? userAToken : userBToken,
                    userPoolLp,
                    user: owner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    vaultProgram: this.vaultProgram.programId,
                })
                : this.program.methods.removeBalanceLiquidity(lpTokenAmount, tokenAOutAmount, tokenBOutAmount).accounts({
                    pool: this.address,
                    lpMint: this.poolState.lpMint,
                    aVault: this.poolState.aVault,
                    aTokenVault: this.vaultA.vaultState.tokenVault,
                    aVaultLp: this.poolState.aVaultLp,
                    aVaultLpMint: this.vaultA.vaultState.lpMint,
                    bVault: this.poolState.bVault,
                    bTokenVault: this.vaultB.vaultState.tokenVault,
                    bVaultLp: this.poolState.bVaultLp,
                    bVaultLpMint: this.vaultB.vaultState.lpMint,
                    userAToken,
                    userBToken,
                    user: owner,
                    userPoolLp,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    vaultProgram: this.vaultProgram.programId,
                });
            const withdrawTx = yield programMethod
                .remainingAccounts(this.swapCurve.getRemainingAccounts())
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction();
            return new Transaction(Object.assign({ feePayer: owner }, (yield this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)))).add(withdrawTx);
        });
    }
    getUserLockEscrow(owner) {
        return __awaiter(this, void 0, void 0, function* () {
            const [lockEscrowPK] = deriveLockEscrowPda(this.address, owner, this.program.programId);
            const lockEscrowAccount = yield this.program.account.lockEscrow.fetchNullable(lockEscrowPK);
            if (!lockEscrowAccount)
                return null;
            const lockEscrowVault = yield this.program.provider.connection.getTokenAccountBalance(lockEscrowAccount.escrowVault);
            const [lockEscrow, _lockEscrowBump] = deriveLockEscrowPda(this.address, owner, this.program.programId);
            const unClaimedFee = calculateUnclaimedLockEscrowFee(lockEscrowAccount.totalLockedAmount, lockEscrowAccount.lpPerToken, lockEscrowAccount.unclaimedFeePending, this.poolInfo.virtualPriceRaw);
            // Patch the bug from v1 impl
            const escrowVaultAmount = new BN(lockEscrowVault.value.amount);
            const unclaimedFeeCap = unClaimedFee.gt(escrowVaultAmount) ? escrowVaultAmount : unClaimedFee;
            const { tokenAOutAmount, tokenBOutAmount } = this.getWithdrawQuote(unclaimedFeeCap, 0);
            return {
                address: lockEscrow,
                amount: lockEscrowAccount.totalLockedAmount || new BN(0),
                fee: {
                    claimed: {
                        tokenA: lockEscrowAccount.aFee || new BN(0),
                        tokenB: lockEscrowAccount.bFee || new BN(0),
                    },
                    unClaimed: {
                        lp: unclaimedFeeCap,
                        tokenA: tokenAOutAmount || new BN(0),
                        tokenB: tokenBOutAmount || new BN(0),
                    },
                },
            };
        });
    }
    /**
     * `lockLiquidity` is a function that lock liquidity in Meteora pool, owner is able to claim fee later,
     * @param {PublicKey} owner - PublicKey - The public key of the escrow's owner, who get the locked liquidity, and can claim fee later
     * @param {BN} amount - The amount of LP tokens to lock.
     * @param {BN} feePayer - The payer of that lock liquidity.
     * @returns A transaction object
     */
    lockLiquidity(owner, amount, feePayer) {
        return __awaiter(this, void 0, void 0, function* () {
            const payer = feePayer ? feePayer : owner;
            const [lockEscrowPK] = deriveLockEscrowPda(this.address, owner, this.program.programId);
            const preInstructions = [];
            const lockEscrowAccount = yield this.program.account.lockEscrow.fetchNullable(lockEscrowPK);
            if (!lockEscrowAccount) {
                const createLockEscrowIx = yield this.program.methods
                    .createLockEscrow()
                    .accounts({
                    pool: this.address,
                    lockEscrow: lockEscrowPK,
                    owner,
                    lpMint: this.poolState.lpMint,
                    payer,
                    systemProgram: SystemProgram.programId,
                })
                    .instruction();
                preInstructions.push(createLockEscrowIx);
            }
            const [[userAta, createUserAtaIx], [escrowAta, createEscrowAtaIx]] = yield Promise.all([
                getOrCreateATAInstruction(this.poolState.lpMint, payer, this.program.provider.connection, payer),
                getOrCreateATAInstruction(this.poolState.lpMint, lockEscrowPK, this.program.provider.connection, payer),
            ]);
            createUserAtaIx && preInstructions.push(createUserAtaIx);
            createEscrowAtaIx && preInstructions.push(createEscrowAtaIx);
            const lockTx = yield this.program.methods
                .lock(amount)
                .accounts({
                pool: this.address,
                lockEscrow: lockEscrowPK,
                owner: payer,
                lpMint: this.poolState.lpMint,
                sourceTokens: userAta,
                escrowVault: escrowAta,
                tokenProgram: TOKEN_PROGRAM_ID,
                aVault: this.poolState.aVault,
                bVault: this.poolState.bVault,
                aVaultLp: this.poolState.aVaultLp,
                bVaultLp: this.poolState.bVaultLp,
                aVaultLpMint: this.vaultA.vaultState.lpMint,
                bVaultLpMint: this.vaultB.vaultState.lpMint,
            })
                .preInstructions(preInstructions)
                .transaction();
            return new Transaction(Object.assign({ feePayer: payer }, (yield this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)))).add(lockTx);
        });
    }
    claimLockFee(owner, maxAmount) {
        return __awaiter(this, void 0, void 0, function* () {
            const [lockEscrowPK] = deriveLockEscrowPda(this.address, owner, this.program.programId);
            const preInstructions = [];
            const [[userAta, createUserAtaIx], [escrowAta, createEscrowAtaIx], [tokenAAta, createTokenAAtaIx], [tokenBAta, createTokenBAtaIx],] = yield Promise.all([
                getOrCreateATAInstruction(this.poolState.lpMint, owner, this.program.provider.connection),
                getOrCreateATAInstruction(this.poolState.lpMint, lockEscrowPK, this.program.provider.connection),
                getOrCreateATAInstruction(this.poolState.tokenAMint, owner, this.program.provider.connection),
                getOrCreateATAInstruction(this.poolState.tokenBMint, owner, this.program.provider.connection),
            ]);
            createUserAtaIx && preInstructions.push(createUserAtaIx);
            createEscrowAtaIx && preInstructions.push(createEscrowAtaIx);
            createTokenAAtaIx && preInstructions.push(createTokenAAtaIx);
            createTokenBAtaIx && preInstructions.push(createTokenBAtaIx);
            const postInstructions = [];
            if ([this.poolState.tokenAMint.toBase58(), this.poolState.tokenBMint.toBase58()].includes(NATIVE_MINT.toBase58())) {
                const closeWrappedSOLIx = yield unwrapSOLInstruction(owner);
                closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
            }
            const tx = yield this.program.methods
                .claimFee(maxAmount)
                .accounts({
                pool: this.address,
                lockEscrow: lockEscrowPK,
                owner,
                lpMint: this.poolState.lpMint,
                sourceTokens: userAta,
                escrowVault: escrowAta,
                tokenProgram: TOKEN_PROGRAM_ID,
                aVault: this.poolState.aVault,
                bVault: this.poolState.bVault,
                aVaultLp: this.poolState.aVaultLp,
                bVaultLp: this.poolState.bVaultLp,
                aVaultLpMint: this.vaultA.vaultState.lpMint,
                bVaultLpMint: this.vaultB.vaultState.lpMint,
                vaultProgram: this.vaultProgram.programId,
                aTokenVault: this.vaultA.vaultState.tokenVault,
                bTokenVault: this.vaultB.vaultState.tokenVault,
                userAToken: tokenAAta,
                userBToken: tokenBAta,
            })
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction();
            return new Transaction(Object.assign({ feePayer: owner }, (yield this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)))).add(tx);
        });
    }
    createATAPreInstructions(owner, mintList) {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.all(mintList.map((mint) => {
                return getOrCreateATAInstruction(mint, owner, this.program.provider.connection);
            }));
        });
    }
    calculateProtocolTradingFee(amount) {
        const { protocolTradeFeeDenominator, protocolTradeFeeNumerator } = this.poolState.fees;
        return amount.mul(protocolTradeFeeNumerator).div(protocolTradeFeeDenominator);
    }
    calculateTradingFee(amount) {
        const { tradeFeeDenominator, tradeFeeNumerator } = this.poolState.fees;
        return amount.mul(tradeFeeNumerator).div(tradeFeeDenominator);
    }
    computeActualInAmount(poolTokenAmount, poolLpSupply, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, vaultAWithdrawableAmount, vaultBWithdrawableAmount) {
        const aVaultLpMinted = this.getShareByAmount(poolTokenAmount, poolLpSupply, poolVaultALp, true);
        const bVaultLpMinted = this.getShareByAmount(poolTokenAmount, poolLpSupply, poolVaultBLp, true);
        const actualTokenAInAmount = this.getAmountByShare(aVaultLpMinted, vaultAWithdrawableAmount, vaultALpSupply, true);
        const actualTokenBInAmount = this.getAmountByShare(bVaultLpMinted, vaultBWithdrawableAmount, vaultBLpSupply, true);
        return [actualTokenAInAmount, actualTokenBInAmount];
    }
    getShareByAmount(amount, tokenAmount, lpSupply, roundUp) {
        if (tokenAmount.isZero())
            return new BN(0);
        return roundUp ? amount.mul(lpSupply).divRound(tokenAmount) : amount.mul(lpSupply).div(tokenAmount);
    }
    getAmountByShare(amount, tokenAmount, lpSupply, roundUp) {
        if (lpSupply.isZero())
            return new BN(0);
        return roundUp ? amount.mul(tokenAmount).divRound(lpSupply) : amount.mul(tokenAmount).div(lpSupply);
    }
}
//# sourceMappingURL=index.js.map