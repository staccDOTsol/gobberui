"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const vault_sdk_1 = __importStar(require("@mercurial-finance/vault-sdk"));
const invariant_1 = __importDefault(require("invariant"));
const types_1 = require("./types");
const constants_1 = require("./constants");
const curve_1 = require("./curve");
const constant_product_1 = require("./curve/constant-product");
const utils_1 = require("./utils");
const bytes_1 = require("@coral-xyz/anchor/dist/cjs/utils/bytes");
const getAllPoolState = async (poolMints, program) => {
    const poolStates = (await (0, utils_1.chunkedFetchMultiplePoolAccount)(program, poolMints));
    (0, invariant_1.default)(poolStates.length === poolMints.length, 'Some of the pool state not found');
    const poolLpMints = poolStates.map((poolState) => poolState.lpMint);
    const lpMintAccounts = await (0, utils_1.chunkedGetMultipleAccountInfos)(program.provider.connection, poolLpMints);
    return poolStates.map((poolState, idx) => {
        const lpMintAccount = lpMintAccounts[idx];
        (0, invariant_1.default)(lpMintAccount, constants_1.ERROR.INVALID_ACCOUNT);
        const lpSupply = new anchor_1.BN(spl_token_1.MintLayout.decode(lpMintAccount.data).supply.toString());
        return { ...poolState, lpSupply };
    });
};
const getPoolState = async (poolMint, program) => {
    const poolState = (await program.account.pool.fetchNullable(poolMint));
    (0, invariant_1.default)(poolState, `Pool ${poolMint.toBase58()} not found`);
    const account = await program.provider.connection.getTokenSupply(poolState.lpMint);
    (0, invariant_1.default)(account.value.amount, constants_1.ERROR.INVALID_ACCOUNT);
    return { ...poolState, lpSupply: new anchor_1.BN(account.value.amount) };
};
const decodeAccountTypeMapper = (type) => {
    const decoder = {
        [types_1.AccountType.VAULT_A_RESERVE]: (accountData) => new anchor_1.BN(spl_token_1.AccountLayout.decode(accountData).amount.toString()),
        [types_1.AccountType.VAULT_B_RESERVE]: (accountData) => new anchor_1.BN(spl_token_1.AccountLayout.decode(accountData).amount.toString()),
        [types_1.AccountType.VAULT_A_LP]: (accountData) => new anchor_1.BN(spl_token_1.MintLayout.decode(accountData).supply.toString()),
        [types_1.AccountType.VAULT_B_LP]: (accountData) => new anchor_1.BN(spl_token_1.MintLayout.decode(accountData).supply.toString()),
        [types_1.AccountType.POOL_VAULT_A_LP]: (accountData) => new anchor_1.BN(spl_token_1.AccountLayout.decode(accountData).amount.toString()),
        [types_1.AccountType.POOL_VAULT_B_LP]: (accountData) => new anchor_1.BN(spl_token_1.AccountLayout.decode(accountData).amount.toString()),
        [types_1.AccountType.POOL_LP_MINT]: (accountData) => new anchor_1.BN(spl_token_1.MintLayout.decode(accountData).supply.toString()),
        [types_1.AccountType.SYSVAR_CLOCK]: (accountData) => new anchor_1.BN(accountData.readBigInt64LE(32).toString()),
    };
    return decoder[type];
};
const getAccountsBuffer = async (connection, accountsToFetch) => {
    const accounts = await (0, utils_1.chunkedGetMultipleAccountInfos)(connection, accountsToFetch.map((account) => account.pubkey));
    return accountsToFetch.reduce((accMap, account, index) => {
        const accountInfo = accounts[index];
        accMap.set(account.pubkey.toBase58(), {
            type: account.type,
            account: accountInfo,
        });
        return accMap;
    }, new Map());
};
const deserializeAccountsBuffer = (accountInfoMap) => {
    return Array.from(accountInfoMap).reduce((accValue, [publicKey, { type, account }]) => {
        const decodedAccountInfo = decodeAccountTypeMapper(type);
        accValue.set(publicKey, decodedAccountInfo(account.data));
        return accValue;
    }, new Map());
};
class AmmImpl {
    address;
    program;
    vaultProgram;
    tokenAMint;
    tokenBMint;
    poolState;
    poolInfo;
    vaultA;
    vaultB;
    accountsInfo;
    swapCurve;
    depegAccounts;
    opt = {
        cluster: 'mainnet-beta',
    };
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
            ...this.opt,
            ...opt,
        };
    }
    static async createConfig(connection, payer, tradeFeeBps, protocolFeeBps, vaultConfigKey, activationDuration, poolCreatorAuthority, activationType, opt) {
        const { ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const configs = await this.getFeeConfigurations(connection, opt);
        let index = 0;
        while (true) {
            const configPda = (0, utils_1.deriveConfigPda)(new anchor_1.BN(index), ammProgram.programId);
            if (!configs.find((c) => c.publicKey.equals(configPda))) {
                const createConfigTx = await ammProgram.methods
                    .createConfig({
                    // Default fee denominator is 100_000
                    tradeFeeNumerator: tradeFeeBps.mul(new anchor_1.BN(10)),
                    protocolTradeFeeNumerator: protocolFeeBps.mul(new anchor_1.BN(10)),
                    vaultConfigKey,
                    activationDuration,
                    poolCreatorAuthority,
                    index: new anchor_1.BN(index),
                    activationType,
                })
                    .accounts({
                    config: configPda,
                    systemProgram: web3_js_1.SystemProgram.programId,
                    admin: payer,
                })
                    .transaction();
                return new web3_js_1.Transaction({
                    feePayer: payer,
                    ...(await ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)),
                }).add(createConfigTx);
            }
            else {
                index++;
            }
        }
    }
    static async searchPoolsByToken(connection, tokenMint) {
        const { ammProgram } = (0, utils_1.createProgram)(connection);
        const [poolsForTokenAMint, poolsForTokenBMint] = await Promise.all([
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
    }
    static async createPermissionlessConstantProductPoolWithConfig2(connection, payer, tokenAMint, tokenBMint, tokenAAmount, tokenBAmount, config, opt) {
        const { vaultProgram, ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const [{ vaultPda: aVault, tokenVaultPda: aTokenVault, lpMintPda: aLpMintPda }, { vaultPda: bVault, tokenVaultPda: bTokenVault, lpMintPda: bLpMintPda },] = [(0, vault_sdk_1.getVaultPdas)(tokenAMint, vaultProgram.programId), (0, vault_sdk_1.getVaultPdas)(tokenBMint, vaultProgram.programId)];
        const [aVaultAccount, bVaultAccount] = await Promise.all([
            vaultProgram.account.vault.fetchNullable(aVault),
            vaultProgram.account.vault.fetchNullable(bVault),
        ]);
        let aVaultLpMint = aLpMintPda;
        let bVaultLpMint = bLpMintPda;
        let preInstructions = [];
        if (!aVaultAccount) {
            const createVaultAIx = await vault_sdk_1.default.createPermissionlessVaultInstruction(connection, payer, tokenAMint);
            createVaultAIx && preInstructions.push(createVaultAIx);
        }
        else {
            aVaultLpMint = aVaultAccount.lpMint; // Old vault doesn't have lp mint pda
        }
        if (!bVaultAccount) {
            const createVaultBIx = await vault_sdk_1.default.createPermissionlessVaultInstruction(connection, payer, tokenBMint);
            createVaultBIx && preInstructions.push(createVaultBIx);
        }
        else {
            bVaultLpMint = bVaultAccount.lpMint; // Old vault doesn't have lp mint pda
        }
        const poolPubkey = (0, utils_1.derivePoolAddressWithConfig)(tokenAMint, tokenBMint, config, ammProgram.programId);
        const [lpMint] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.LP_MINT), poolPubkey.toBuffer()], ammProgram.programId);
        const [[aVaultLp], [bVaultLp]] = [
            web3_js_1.PublicKey.findProgramAddressSync([aVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            web3_js_1.PublicKey.findProgramAddressSync([bVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
        ];
        const [[payerTokenA, createPayerTokenAIx], [payerTokenB, createPayerTokenBIx]] = await Promise.all([
            (0, utils_1.getOrCreateATAInstruction)(tokenAMint, payer, connection),
            (0, utils_1.getOrCreateATAInstruction)(tokenBMint, payer, connection),
        ]);
        createPayerTokenAIx && preInstructions.push(createPayerTokenAIx);
        createPayerTokenBIx && preInstructions.push(createPayerTokenBIx);
        const [[protocolTokenAFee], [protocolTokenBFee]] = [
            web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.FEE), tokenAMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.FEE), tokenBMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
        ];
        const payerPoolLp = await (0, utils_1.getAssociatedTokenAccount)(lpMint, payer);
        if (tokenAMint.equals(spl_token_1.NATIVE_MINT)) {
            preInstructions = preInstructions.concat((0, utils_1.wrapSOLInstruction)(payer, payerTokenA, BigInt(tokenAAmount.toString())));
        }
        if (tokenBMint.equals(spl_token_1.NATIVE_MINT)) {
            preInstructions = preInstructions.concat((0, utils_1.wrapSOLInstruction)(payer, payerTokenB, BigInt(tokenBAmount.toString())));
        }
        const [mintMetadata, _mintMetadataBump] = (0, utils_1.deriveMintMetadata)(lpMint);
        const activationPoint = opt?.activationPoint || null;
        const createPermissionlessPoolTx = await ammProgram.methods
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
            metadataProgram: constants_1.METAPLEX_PROGRAM,
            payer,
            config,
            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            vaultProgram: vaultProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
            associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
        })
            .transaction();
        const resultTx = [];
        if (preInstructions.length) {
            const preInstructionTx = new web3_js_1.Transaction({
                feePayer: payer,
                ...(await ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)),
            }).add(...preInstructions);
            resultTx.push(preInstructionTx);
        }
        const setComputeUnitLimitIx = web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_400_000,
        });
        const mainTx = new web3_js_1.Transaction({
            feePayer: payer,
            ...(await ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)),
        })
            .add(setComputeUnitLimitIx);
        if (opt?.lockLiquidity) {
            const preLockLiquidityIx = [];
            const [lockEscrowPK] = (0, utils_1.deriveLockEscrowPda)(poolPubkey, payer, ammProgram.programId);
            const createLockEscrowIx = await ammProgram.methods
                .createLockEscrow()
                .accounts({
                pool: poolPubkey,
                lockEscrow: lockEscrowPK,
                owner: payer,
                lpMint,
                payer,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .instruction();
            preLockLiquidityIx.push(createLockEscrowIx);
            const [escrowAta, createEscrowAtaIx] = await (0, utils_1.getOrCreateATAInstruction)(lpMint, lockEscrowPK, connection, payer);
            createEscrowAtaIx && preLockLiquidityIx.push(createEscrowAtaIx);
            const lockTx = await ammProgram.methods
                .lock(constants_1.U64_MAX)
                .accounts({
                pool: poolPubkey,
                lockEscrow: lockEscrowPK,
                owner: payer,
                lpMint,
                sourceTokens: payerPoolLp,
                escrowVault: escrowAta,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
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
    }
    static async createPermissionlessConstantProductPoolWithConfig(connection, payer, tokenAMint, tokenBMint, tokenAAmount, tokenBAmount, config, program, opt) {
        const { vaultProgram, ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const [{ vaultPda: aVault, tokenVaultPda: aTokenVault, lpMintPda: aLpMintPda }, { vaultPda: bVault, tokenVaultPda: bTokenVault, lpMintPda: bLpMintPda },] = [(0, vault_sdk_1.getVaultPdas)(tokenAMint, vaultProgram.programId), (0, vault_sdk_1.getVaultPdas)(tokenBMint, vaultProgram.programId)];
        const [aVaultAccount, bVaultAccount] = await Promise.all([
            vaultProgram.account.vault.fetchNullable(aVault),
            vaultProgram.account.vault.fetchNullable(bVault),
        ]);
        let aVaultLpMint = aLpMintPda;
        let bVaultLpMint = bLpMintPda;
        let preInstructions = [];
        if (!aVaultAccount) {
            const createVaultAIx = await vault_sdk_1.default.createPermissionlessVaultInstruction(connection, payer, tokenAMint);
            createVaultAIx && preInstructions.push(createVaultAIx);
        }
        else {
            aVaultLpMint = aVaultAccount.lpMint; // Old vault doesn't have lp mint pda
        }
        if (!bVaultAccount) {
            const createVaultBIx = await vault_sdk_1.default.createPermissionlessVaultInstruction(connection, payer, tokenBMint);
            createVaultBIx && preInstructions.push(createVaultBIx);
        }
        else {
            bVaultLpMint = bVaultAccount.lpMint; // Old vault doesn't have lp mint pda
        }
        const poolPubkey = (0, utils_1.derivePoolAddressWithConfig)(tokenAMint, tokenBMint, config, ammProgram.programId);
        const [lpMint] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.LP_MINT), poolPubkey.toBuffer()], ammProgram.programId);
        const [[aVaultLp], [bVaultLp]] = [
            web3_js_1.PublicKey.findProgramAddressSync([aVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            web3_js_1.PublicKey.findProgramAddressSync([bVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
        ];
        const [[payerTokenA, createPayerTokenAIx], [payerTokenB, createPayerTokenBIx]] = await Promise.all([
            (0, utils_1.getOrCreateATAInstruction)(tokenAMint, payer, connection),
            (0, utils_1.getOrCreateATAInstruction)(tokenBMint, payer, connection),
        ]);
        createPayerTokenAIx && !opt?.skipAAta && preInstructions.push(createPayerTokenAIx);
        createPayerTokenBIx && !opt?.skipBAta && preInstructions.push(createPayerTokenBIx);
        const [[protocolTokenAFee], [protocolTokenBFee]] = [
            web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.FEE), tokenAMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.FEE), tokenBMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
        ];
        const payerPoolLp = await (0, utils_1.getAssociatedTokenAccount)(lpMint, payer);
        const [mintMetadata, _mintMetadataBump] = (0, utils_1.deriveMintMetadata)(lpMint);
        const createPermissionlessPoolTx = await ammProgram.methods
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
            metadataProgram: constants_1.METAPLEX_PROGRAM,
            payer,
            config,
            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            vaultProgram: vaultProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
            associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
        })
            .transaction();
        const resultTx = [];
        if (preInstructions.length) {
            const preInstructionTx = new web3_js_1.Transaction({
                feePayer: payer,
                ...(await ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)),
            }).add(...preInstructions);
            resultTx.push(preInstructionTx);
        }
        const bondingCurve = (web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new web3_js_1.PublicKey(tokenBMint).toBuffer()], program.programId))[0];
        if (opt?.lockLiquidity) {
            const preLockLiquidityIx = [];
            const [lockEscrowPK] = (0, utils_1.deriveLockEscrowPda)(poolPubkey, bondingCurve, ammProgram.programId);
            const [escrowAta, createEscrowAtaIx] = await (0, utils_1.getOrCreateATAInstruction)(lpMint, lockEscrowPK, connection, payer);
            createEscrowAtaIx && preLockLiquidityIx.push(createEscrowAtaIx);
            console.log({ pool: poolPubkey,
                lockEscrow: lockEscrowPK,
                owner: bondingCurve,
                lpMint,
                sourceTokens: (0, utils_1.getAssociatedTokenAccount)(lpMint, bondingCurve),
                escrowVault: escrowAta,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                aVault,
                bVault,
                aVaultLp,
                lockEscrowTokenAccount: escrowAta,
                config,
                bVaultLp,
                tokenAMint,
                payerTokenA: (0, utils_1.getAssociatedTokenAccount)(tokenBMint, bondingCurve),
                payerTokenB,
                tokenBMint,
                aVaultLpMint,
                bondingCurve,
                vaultProgram: ammProgram.programId,
                bVaultLpMint,
                associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
                mintMetadata: web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("metadata"), new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(), lpMint.toBuffer()], new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"))[0],
                metadataProgram: new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
                payerPoolLp: (0, utils_1.getAssociatedTokenAccount)(lpMint, bondingCurve),
                protocolTokenAFee: (0, utils_1.getAssociatedTokenAccount)(tokenAMint, bondingCurve),
                protocolTokenBFee: (0, utils_1.getAssociatedTokenAccount)(tokenBMint, bondingCurve),
                aTokenVault: aTokenVault,
                payer: payer,
                rent: web3_js_1.SYSVAR_RENT_PUBKEY,
                bTokenVault: bTokenVault });
            const [[protocolTokenAFee], [protocolTokenBFee]] = [
                web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.FEE), tokenAMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
                web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.FEE), tokenBMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            ];
            const lockTx = await program.methods
                .createPermissionlessConstantProductPoolWithConfig(tokenAAmount, tokenBAmount)
                .accounts({
                pool: poolPubkey,
                lockEscrow: lockEscrowPK,
                owner: bondingCurve,
                lpMint,
                sourceTokens: (0, utils_1.getAssociatedTokenAccount)(lpMint, bondingCurve),
                escrowVault: escrowAta,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                aVault,
                bVault,
                aVaultLp,
                lockEscrowTokenAccount: escrowAta,
                config,
                bVaultLp,
                tokenAMint,
                dynamicAmmProgram: ammProgram.programId,
                payerTokenA: (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAMint, payer, true),
                payerTokenB: (0, spl_token_1.getAssociatedTokenAddressSync)(tokenBMint, payer, true),
                tokenBMint,
                bondingB: (0, spl_token_1.getAssociatedTokenAddressSync)(tokenBMint, bondingCurve, true),
                aVaultLpMint,
                bondingCurve,
                vaultProgram: vaultProgram.programId,
                bVaultLpMint,
                associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
                mintMetadata: web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("metadata"), new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(), lpMint.toBuffer()], new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"))[0],
                metadataProgram: new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
                payerPoolLp: (0, utils_1.getAssociatedTokenAccount)(lpMint, payer),
                bondingPoolLp: (0, spl_token_1.getAssociatedTokenAddressSync)(lpMint, bondingCurve, true),
                protocolTokenAFee: protocolTokenAFee,
                protocolTokenBFee: protocolTokenBFee,
                aTokenVault: aTokenVault,
                payer: payer,
                rent: web3_js_1.SYSVAR_RENT_PUBKEY,
                bTokenVault: bTokenVault
            })
                .preInstructions([web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
                .transaction();
            const anotherTx = await program.methods
                .create2()
                .accounts({
                pool: poolPubkey,
                dynamicAmmProgram: ammProgram.programId,
                lockEscrow: lockEscrowPK,
                owner: bondingCurve,
                lpMint,
                sourceTokens: (0, utils_1.getAssociatedTokenAccount)(lpMint, bondingCurve),
                escrowVault: escrowAta,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                aVault,
                bVault, bondingPoolLp: (0, spl_token_1.getAssociatedTokenAddressSync)(lpMint, bondingCurve, true),
                bondingB: (0, spl_token_1.getAssociatedTokenAddressSync)(tokenBMint, bondingCurve, true),
                aVaultLp,
                lockEscrowTokenAccount: escrowAta,
                config,
                bVaultLp,
                tokenAMint,
                payerTokenA: (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAMint, bondingCurve, true),
                payerTokenB: (0, spl_token_1.getAssociatedTokenAddressSync)(tokenBMint, bondingCurve, true),
                tokenBMint,
                aVaultLpMint,
                bondingCurve,
                vaultProgram: ammProgram.programId,
                bVaultLpMint,
                associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
                mintMetadata: web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("metadata"), new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(), lpMint.toBuffer()], new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"))[0],
                metadataProgram: new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
                payerPoolLp: (0, utils_1.getAssociatedTokenAccount)(lpMint, bondingCurve),
                protocolTokenAFee: protocolTokenAFee,
                protocolTokenBFee: protocolTokenBFee,
                aTokenVault: aTokenVault,
                payer: payer,
                rent: web3_js_1.SYSVAR_RENT_PUBKEY,
                bTokenVault: bTokenVault
            })
                .preInstructions([web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 })])
                .transaction();
            const preTx = new web3_js_1.Transaction().add(...([web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 }), web3_js_1.SystemProgram.transfer({
                    fromPubkey: payer,
                    toPubkey: (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAMint, bondingCurve, true),
                    lamports: BigInt(tokenAAmount.toString())
                }),
                (0, spl_token_1.createAssociatedTokenAccountInstruction)(payer, (0, spl_token_1.getAssociatedTokenAddressSync)(spl_token_1.NATIVE_MINT, bondingCurve, true), bondingCurve, spl_token_1.NATIVE_MINT), ...(0, utils_1.wrapSOLInstruction)(payer, (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAMint, bondingCurve, true), BigInt(tokenAAmount.toString()))]));
            if (createEscrowAtaIx) {
                anotherTx.instructions.unshift(createEscrowAtaIx);
            }
            preTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            preTx.feePayer = payer;
            anotherTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            anotherTx.feePayer = payer;
            lockTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            lockTx.feePayer = payer;
            resultTx.push(preTx);
            resultTx.push(lockTx);
            resultTx.push(anotherTx);
        }
        return resultTx;
    }
    static async createPermissionlessPool(connection, payer, tokenInfoA, tokenInfoB, tokenAAmount, tokenBAmount, isStable, tradeFeeBps, opt) {
        const { vaultProgram, ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const curveType = (0, utils_1.generateCurveType)(tokenInfoA, tokenInfoB, isStable);
        const tokenAMint = new web3_js_1.PublicKey(tokenInfoA.address);
        const tokenBMint = new web3_js_1.PublicKey(tokenInfoB.address);
        const [{ vaultPda: aVault, tokenVaultPda: aTokenVault, lpMintPda: aLpMintPda }, { vaultPda: bVault, tokenVaultPda: bTokenVault, lpMintPda: bLpMintPda },] = [(0, vault_sdk_1.getVaultPdas)(tokenAMint, vaultProgram.programId), (0, vault_sdk_1.getVaultPdas)(tokenBMint, vaultProgram.programId)];
        const [aVaultAccount, bVaultAccount] = await Promise.all([
            vaultProgram.account.vault.fetchNullable(aVault),
            vaultProgram.account.vault.fetchNullable(bVault),
        ]);
        let aVaultLpMint = aLpMintPda;
        let bVaultLpMint = bLpMintPda;
        let preInstructions = [];
        const setComputeUnitLimitIx = web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
            units: 600_000,
        });
        preInstructions.push(setComputeUnitLimitIx);
        if (!aVaultAccount) {
            const createVaultAIx = await vault_sdk_1.default.createPermissionlessVaultInstruction(connection, payer, new web3_js_1.PublicKey(tokenInfoA.address));
            createVaultAIx && preInstructions.push(createVaultAIx);
        }
        else {
            aVaultLpMint = aVaultAccount.lpMint; // Old vault doesn't have lp mint pda
        }
        if (!bVaultAccount) {
            const createVaultBIx = await vault_sdk_1.default.createPermissionlessVaultInstruction(connection, payer, new web3_js_1.PublicKey(tokenInfoB.address));
            createVaultBIx && preInstructions.push(createVaultBIx);
        }
        else {
            bVaultLpMint = bVaultAccount.lpMint; // Old vault doesn't have lp mint pda
        }
        const poolPubkey = (0, utils_1.derivePoolAddress)(connection, tokenInfoA, tokenInfoB, isStable, tradeFeeBps, {
            programId: opt?.programId,
        });
        const [[aVaultLp], [bVaultLp]] = [
            web3_js_1.PublicKey.findProgramAddressSync([aVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            web3_js_1.PublicKey.findProgramAddressSync([bVault.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
        ];
        const [[payerTokenA, createPayerTokenAIx], [payerTokenB, createPayerTokenBIx]] = await Promise.all([
            (0, utils_1.getOrCreateATAInstruction)(tokenAMint, payer, connection),
            (0, utils_1.getOrCreateATAInstruction)(tokenBMint, payer, connection),
        ]);
        createPayerTokenAIx && preInstructions.push(createPayerTokenAIx);
        createPayerTokenBIx && preInstructions.push(createPayerTokenBIx);
        const [[protocolTokenAFee], [protocolTokenBFee]] = [
            web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.FEE), tokenAMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
            web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.FEE), tokenBMint.toBuffer(), poolPubkey.toBuffer()], ammProgram.programId),
        ];
        const [lpMint] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.SEEDS.LP_MINT), poolPubkey.toBuffer()], ammProgram.programId);
        const payerPoolLp = await (0, utils_1.getAssociatedTokenAccount)(lpMint, payer);
        if (tokenAMint.equals(spl_token_1.NATIVE_MINT)) {
            preInstructions = preInstructions.concat((0, utils_1.wrapSOLInstruction)(payer, payerTokenA, BigInt(tokenAAmount.toString())));
        }
        if (tokenBMint.equals(spl_token_1.NATIVE_MINT)) {
            preInstructions = preInstructions.concat((0, utils_1.wrapSOLInstruction)(payer, payerTokenB, BigInt(tokenBAmount.toString())));
        }
        const [mintMetadata, _mintMetadataBump] = (0, utils_1.deriveMintMetadata)(lpMint);
        const createPermissionlessPoolTx = await ammProgram.methods
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
            metadataProgram: constants_1.METAPLEX_PROGRAM,
            feeOwner: constants_1.FEE_OWNER,
            payer,
            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            vaultProgram: vaultProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
            associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
        })
            .preInstructions(preInstructions)
            .transaction();
        return new web3_js_1.Transaction({
            feePayer: payer,
            ...(await ammProgram.provider.connection.getLatestBlockhash(ammProgram.provider.connection.commitment)),
        }).add(createPermissionlessPoolTx);
    }
    static async createMultiple(connection, poolList, opt) {
        const cluster = opt?.cluster ?? 'mainnet-beta';
        const { provider, vaultProgram, ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const poolInfoMap = new Map();
        const poolsState = await getAllPoolState(poolList, ammProgram);
        const PdaInfos = poolList.reduce((accList, _, index) => {
            const poolState = poolsState[index];
            return [...accList, poolState.aVault, poolState.bVault];
        }, []);
        const vaultsImpl = await vault_sdk_1.default.createMultipleWithPda(connection, PdaInfos);
        const accountsToFetch = await Promise.all(poolsState.map(async (poolState, index) => {
            const pool = poolList[index];
            const vaultA = vaultsImpl.find(({ vaultPda }) => vaultPda.equals(poolState.aVault));
            const vaultB = vaultsImpl.find(({ vaultPda }) => vaultPda.equals(poolState.bVault));
            (0, invariant_1.default)(vaultA, `Vault ${poolState.tokenAMint.toBase58()} not found`);
            (0, invariant_1.default)(vaultB, `Vault ${poolState.tokenBMint.toBase58()} not found`);
            poolInfoMap.set(poolState.lpMint.toBase58(), {
                pool,
                poolState,
                vaultA,
                vaultB,
                tokenAMint: vaultA.tokenMint,
                tokenBMint: vaultB.tokenMint,
            });
            return [
                { pubkey: vaultA.vaultState.tokenVault, type: types_1.AccountType.VAULT_A_RESERVE },
                { pubkey: vaultB.vaultState.tokenVault, type: types_1.AccountType.VAULT_B_RESERVE },
                { pubkey: vaultA.vaultState.lpMint, type: types_1.AccountType.VAULT_A_LP },
                { pubkey: vaultB.vaultState.lpMint, type: types_1.AccountType.VAULT_B_LP },
                { pubkey: poolState.aVaultLp, type: types_1.AccountType.POOL_VAULT_A_LP },
                { pubkey: poolState.bVaultLp, type: types_1.AccountType.POOL_VAULT_B_LP },
                { pubkey: poolState.lpMint, type: types_1.AccountType.POOL_LP_MINT },
            ];
        }));
        const flatAccountsToFetch = accountsToFetch.flat();
        const accountsBufferMap = await getAccountsBuffer(connection, [
            ...flatAccountsToFetch,
            { pubkey: web3_js_1.SYSVAR_CLOCK_PUBKEY, type: types_1.AccountType.SYSVAR_CLOCK },
        ]);
        const clockAccount = accountsBufferMap.get(web3_js_1.SYSVAR_CLOCK_PUBKEY.toBase58());
        (0, invariant_1.default)(clockAccount, 'Clock account not found');
        const clock = types_1.ClockLayout.decode(clockAccount.account.data);
        const accountsInfoMap = deserializeAccountsBuffer(accountsBufferMap);
        const depegAccounts = await (0, utils_1.getDepegAccounts)(ammProgram.provider.connection, poolsState);
        const ammImpls = await Promise.all(accountsToFetch.map(async (accounts) => {
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
            (0, invariant_1.default)(!!currentTime &&
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
            (0, invariant_1.default)(poolInfoData, 'Cannot find pool info');
            const { pool, poolState, vaultA, vaultB, tokenAMint, tokenBMint } = poolInfoData;
            let swapCurve;
            if ('stable' in poolState.curveType) {
                const { amp, depeg, tokenMultiplier } = poolState.curveType['stable'];
                swapCurve = new curve_1.StableSwap(amp.toNumber(), tokenMultiplier, depeg, depegAccounts, currentTime, poolState.stake);
            }
            else {
                swapCurve = new constant_product_1.ConstantProductSwap();
            }
            const poolInfo = (0, utils_1.calculatePoolInfo)(currentTime, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, poolLpSupply, swapCurve, vaultA.vaultState, vaultB.vaultState);
            return new AmmImpl(pool, ammProgram, vaultProgram, tokenAMint, tokenBMint, poolState, poolInfo, vaultA, vaultB, accountsInfo, swapCurve, depegAccounts, {
                cluster,
            });
        }));
        return ammImpls;
    }
    /**
     * Retrieves the pool configuration with the authority of the pool creator.
     *
     * @param {Connection} connection - The connection to the Solana network.
     * @param {PublicKey} wallet - The public key of the wallet.
     * @param {Object} [opt] - Optional parameters.
     * @return {Promise<Array<Account<Config>>>} A promise that resolves to an array of pool configuration accounts which the wallet can used to create pools.
     */
    static async getPoolConfigsWithPoolCreatorAuthority(connection, wallet, opt) {
        const { ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const configAccounts = await ammProgram.account.config.all([
            {
                memcmp: {
                    offset: 8 + 72,
                    bytes: wallet.toBase58(),
                },
            },
        ]);
        return configAccounts;
    }
    static async getPoolConfig(connection, config, opt) {
        const { ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const configAccount = await ammProgram.account.config.fetch(config);
        return configAccount;
    }
    static async getFeeConfigurations(connection, opt) {
        const { ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const configs = await ammProgram.account.config.all();
        return configs.map((configAccount) => {
            const { poolFees } = configAccount.account;
            return {
                publicKey: configAccount.publicKey,
                tradeFeeBps: poolFees.tradeFeeNumerator.mul(new anchor_1.BN(10000)).div(poolFees.tradeFeeDenominator),
                protocolTradeFeeBps: poolFees.protocolTradeFeeNumerator
                    .mul(new anchor_1.BN(10000))
                    .div(poolFees.protocolTradeFeeDenominator),
            };
        });
    }
    static async getLockedLpAmountByUser(connection, userPubKey, opt) {
        const { ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const lockEscrows = await ammProgram.account.lockEscrow.all([
            {
                memcmp: {
                    bytes: bytes_1.bs58.encode(userPubKey.toBuffer()),
                    offset: 8 + 32,
                },
            },
        ]);
        return lockEscrows.reduce((accMap, { account }) => {
            return accMap.set(account.pool.toBase58(), account);
        }, new Map());
    }
    static async fetchMultipleUserBalance(connection, lpMintList, owner) {
        const ataAccounts = await Promise.all(lpMintList.map((lpMint) => (0, utils_1.getAssociatedTokenAccount)(lpMint, owner)));
        const accountsInfo = await (0, utils_1.chunkedGetMultipleAccountInfos)(connection, ataAccounts);
        return accountsInfo.map((accountInfo) => {
            if (!accountInfo)
                return new anchor_1.BN(0);
            const accountBalance = (0, utils_1.deserializeAccount)(accountInfo.data);
            if (!accountBalance)
                throw new Error('Failed to parse user account for LP token.');
            return new anchor_1.BN(accountBalance.amount.toString());
        });
    }
    static async create(connection, pool, opt) {
        const cluster = opt?.cluster ?? 'mainnet-beta';
        const { vaultProgram, ammProgram } = (0, utils_1.createProgram)(connection, opt?.programId);
        const poolState = await getPoolState(pool, ammProgram);
        const pdaInfos = [poolState.aVault, poolState.bVault];
        const [vaultA, vaultB] = await vault_sdk_1.default.createMultipleWithPda(connection, pdaInfos, {
            seedBaseKey: opt?.vaultSeedBaseKey,
        });
        const accountsBufferMap = await getAccountsBuffer(connection, [
            { pubkey: vaultA.vaultState.tokenVault, type: types_1.AccountType.VAULT_A_RESERVE },
            { pubkey: vaultB.vaultState.tokenVault, type: types_1.AccountType.VAULT_B_RESERVE },
            { pubkey: vaultA.vaultState.lpMint, type: types_1.AccountType.VAULT_A_LP },
            { pubkey: vaultB.vaultState.lpMint, type: types_1.AccountType.VAULT_B_LP },
            { pubkey: poolState.aVaultLp, type: types_1.AccountType.POOL_VAULT_A_LP },
            { pubkey: poolState.bVaultLp, type: types_1.AccountType.POOL_VAULT_B_LP },
            { pubkey: poolState.lpMint, type: types_1.AccountType.POOL_LP_MINT },
            { pubkey: web3_js_1.SYSVAR_CLOCK_PUBKEY, type: types_1.AccountType.SYSVAR_CLOCK },
        ]);
        const accountsInfoMap = deserializeAccountsBuffer(accountsBufferMap);
        const clockAccount = accountsBufferMap.get(web3_js_1.SYSVAR_CLOCK_PUBKEY.toBase58());
        (0, invariant_1.default)(clockAccount, 'Clock account not found');
        const clock = types_1.ClockLayout.decode(clockAccount.account.data);
        const poolVaultALp = accountsInfoMap.get(poolState.aVaultLp.toBase58());
        const poolVaultBLp = accountsInfoMap.get(poolState.bVaultLp.toBase58());
        const vaultALpSupply = accountsInfoMap.get(vaultA.vaultState.lpMint.toBase58());
        const vaultBLpSupply = accountsInfoMap.get(vaultB.vaultState.lpMint.toBase58());
        const vaultAReserve = accountsInfoMap.get(vaultA.vaultState.tokenVault.toBase58());
        const vaultBReserve = accountsInfoMap.get(vaultB.vaultState.tokenVault.toBase58());
        const poolLpSupply = accountsInfoMap.get(poolState.lpMint.toBase58());
        const currentTime = clock.unixTimestamp;
        const currentSlot = clock.slot;
        (0, invariant_1.default)(!!currentTime &&
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
        const depegAccounts = await (0, utils_1.getDepegAccounts)(ammProgram.provider.connection, [poolState]);
        let swapCurve;
        if ('stable' in poolState.curveType) {
            const { amp, depeg, tokenMultiplier } = poolState.curveType['stable'];
            swapCurve = new curve_1.StableSwap(amp.toNumber(), tokenMultiplier, depeg, depegAccounts, currentTime, poolState.stake);
        }
        else {
            swapCurve = new constant_product_1.ConstantProductSwap();
        }
        const poolInfo = (0, utils_1.calculatePoolInfo)(currentTime, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, poolLpSupply, swapCurve, vaultA.vaultState, vaultB.vaultState);
        return new AmmImpl(pool, ammProgram, vaultProgram, vaultA.tokenMint, vaultB.tokenMint, poolState, poolInfo, vaultA, vaultB, accountsInfo, swapCurve, depegAccounts, {
            cluster,
        });
    }
    get decimals() {
        return Math.max(this.tokenAMint.decimals, this.tokenBMint.decimals);
    }
    get isStablePool() {
        return 'stable' in this.poolState.curveType;
    }
    get isLST() {
        if (!this.isStablePool || !this.swapCurve.depeg?.depegType)
            return false;
        return !Object.keys(this.swapCurve.depeg.depegType).includes('none');
    }
    get feeBps() {
        return this.poolState.fees.tradeFeeNumerator.mul(new anchor_1.BN(10000)).div(this.poolState.fees.tradeFeeDenominator);
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
            .mul(new anchor_1.BN(2))
            .div(totalTokenBalance)
            .mul(new anchor_1.BN(100))
            .gt(new anchor_1.BN(95));
        const isTokenBDepeg = this.poolInfo.tokenBAmount
            .mul(new anchor_1.BN(2))
            .div(totalTokenBalance)
            .mul(new anchor_1.BN(100))
            .gt(new anchor_1.BN(95));
        if (isTokenADepeg)
            return this.tokenAMint;
        if (isTokenBDepeg)
            return this.tokenBMint;
        return null;
    }
    async getLockedAtaAmount() {
        try {
            const poolLpAta = await (0, utils_1.getAssociatedTokenAccount)(this.poolState.lpMint, this.address);
            const info = await this.program.provider.connection.getTokenAccountBalance(poolLpAta);
            return new anchor_1.BN(info.value.amount);
        }
        catch (e) {
            return new anchor_1.BN(0);
        }
    }
    async getLockedLpAmount() {
        return (await this.getLockedAtaAmount()).add(this.poolState.totalLockedLp);
    }
    /**
     * It updates the state of the pool
     */
    async updateState() {
        const [poolState] = await Promise.all([
            getPoolState(this.address, this.program),
            this.vaultA.refreshVaultState(),
            this.vaultB.refreshVaultState(),
        ]);
        this.poolState = poolState;
        const accountsBufferMap = await getAccountsBuffer(this.program.provider.connection, [
            { pubkey: this.vaultA.vaultState.tokenVault, type: types_1.AccountType.VAULT_A_RESERVE },
            { pubkey: this.vaultB.vaultState.tokenVault, type: types_1.AccountType.VAULT_B_RESERVE },
            { pubkey: this.vaultA.vaultState.lpMint, type: types_1.AccountType.VAULT_A_LP },
            { pubkey: this.vaultB.vaultState.lpMint, type: types_1.AccountType.VAULT_B_LP },
            { pubkey: poolState.aVaultLp, type: types_1.AccountType.POOL_VAULT_A_LP },
            { pubkey: poolState.bVaultLp, type: types_1.AccountType.POOL_VAULT_B_LP },
            { pubkey: poolState.lpMint, type: types_1.AccountType.POOL_LP_MINT },
            { pubkey: web3_js_1.SYSVAR_CLOCK_PUBKEY, type: types_1.AccountType.SYSVAR_CLOCK },
        ]);
        const accountsInfoMap = deserializeAccountsBuffer(accountsBufferMap);
        const clockAccount = accountsBufferMap.get(web3_js_1.SYSVAR_CLOCK_PUBKEY.toBase58());
        (0, invariant_1.default)(clockAccount, 'Clock account not found');
        const clock = types_1.ClockLayout.decode(clockAccount.account.data);
        const poolVaultALp = accountsInfoMap.get(poolState.aVaultLp.toBase58());
        const poolVaultBLp = accountsInfoMap.get(poolState.bVaultLp.toBase58());
        const vaultALpSupply = accountsInfoMap.get(this.vaultA.vaultState.lpMint.toBase58());
        const vaultBLpSupply = accountsInfoMap.get(this.vaultB.vaultState.lpMint.toBase58());
        const vaultAReserve = accountsInfoMap.get(this.vaultA.vaultState.tokenVault.toBase58());
        const vaultBReserve = accountsInfoMap.get(this.vaultB.vaultState.tokenVault.toBase58());
        const poolLpSupply = accountsInfoMap.get(poolState.lpMint.toBase58());
        const currentTime = clock.unixTimestamp;
        const currentSlot = clock.slot;
        (0, invariant_1.default)(!!currentTime &&
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
        this.depegAccounts = await (0, utils_1.getDepegAccounts)(this.program.provider.connection, [poolState]);
        if ('stable' in poolState.curveType) {
            const { amp, depeg, tokenMultiplier } = poolState.curveType['stable'];
            this.swapCurve = new curve_1.StableSwap(amp.toNumber(), tokenMultiplier, depeg, this.depegAccounts, currentTime, poolState.stake);
        }
        else {
            this.swapCurve = new constant_product_1.ConstantProductSwap();
        }
        this.poolInfo = (0, utils_1.calculatePoolInfo)(currentTime, poolVaultALp, poolVaultBLp, vaultALpSupply, vaultBLpSupply, poolLpSupply, this.swapCurve, this.vaultA.vaultState, this.vaultB.vaultState);
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
    async getLpSupply() {
        const account = await this.program.provider.connection.getTokenSupply(this.poolState.lpMint);
        (0, invariant_1.default)(account.value.amount, constants_1.ERROR.INVALID_ACCOUNT);
        return new anchor_1.BN(account.value.amount);
    }
    /**
     * Get the user's balance by looking up the account associated with the user's public key
     * @param {PublicKey} owner - PublicKey - The public key of the user you want to get the balance of
     * @returns The amount of tokens the user has.
     */
    async getUserBalance(owner) {
        const account = await (0, utils_1.getAssociatedTokenAccount)(this.poolState.lpMint, owner);
        if (!account)
            return new anchor_1.BN(0);
        const parsedAccountInfo = await this.program.provider.connection.getParsedAccountInfo(account);
        if (!parsedAccountInfo.value)
            return new anchor_1.BN(0);
        const accountInfoData = parsedAccountInfo.value.data.parsed;
        return new anchor_1.BN(accountInfoData.info.tokenAmount.amount);
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
        const { amountOut, fee, priceImpact } = (0, utils_1.calculateSwapQuote)(inTokenMint, inAmountLamport, {
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
            minSwapOutAmount: (0, utils_1.getMinAmountWithSlippage)(amountOut, slippage),
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
        (0, invariant_1.default)(tokenMint.equals(this.poolState.tokenAMint) || tokenMint.equals(this.poolState.tokenBMint), constants_1.ERROR.INVALID_MINT);
        const [outTokenMint, swapSourceAmount, swapDestAmount, tradeDirection] = tokenMint.equals(this.poolState.tokenAMint)
            ? [this.poolState.tokenBMint, this.poolInfo.tokenAAmount, this.poolInfo.tokenBAmount, curve_1.TradeDirection.AToB]
            : [this.poolState.tokenAMint, this.poolInfo.tokenBAmount, this.poolInfo.tokenAAmount, curve_1.TradeDirection.BToA];
        let maxOutAmount = this.getMaxSwapOutAmount(outTokenMint);
        // Impossible to deplete the pool, therefore if maxOutAmount is equals to tokenAmount in pool, subtract it by 1
        if (maxOutAmount.eq(swapDestAmount)) {
            maxOutAmount = maxOutAmount.sub(new anchor_1.BN(1)); // Left 1 token in pool
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
        return (0, utils_1.calculateMaxSwapOutAmount)(tokenMint, this.poolState.tokenAMint, this.poolState.tokenBMint, this.poolInfo.tokenAAmount, this.poolInfo.tokenBAmount, this.accountsInfo.vaultAReserve, this.accountsInfo.vaultBReserve);
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
    async swap(owner, inTokenMint, inAmountLamport, outAmountLamport, referralOwner) {
        const [sourceToken, destinationToken] = this.tokenAMint.address.equals(inTokenMint)
            ? [this.poolState.tokenAMint, this.poolState.tokenBMint]
            : [this.poolState.tokenBMint, this.poolState.tokenAMint];
        const protocolTokenFee = this.tokenAMint.address.equals(inTokenMint)
            ? this.poolState.protocolTokenAFee
            : this.poolState.protocolTokenBFee;
        let preInstructions = [];
        const [[userSourceToken, createUserSourceIx], [userDestinationToken, createUserDestinationIx]] = await this.createATAPreInstructions(owner, [sourceToken, destinationToken]);
        createUserSourceIx && preInstructions.push(createUserSourceIx);
        createUserDestinationIx && preInstructions.push(createUserDestinationIx);
        if (sourceToken.equals(spl_token_1.NATIVE_MINT)) {
            preInstructions = preInstructions.concat((0, utils_1.wrapSOLInstruction)(owner, userSourceToken, BigInt(inAmountLamport.toString())));
        }
        const postInstructions = [];
        if (spl_token_1.NATIVE_MINT.equals(destinationToken)) {
            const unwrapSOLIx = await (0, utils_1.unwrapSOLInstruction)(owner);
            unwrapSOLIx && postInstructions.push(unwrapSOLIx);
        }
        const remainingAccounts = this.swapCurve.getRemainingAccounts();
        if (referralOwner) {
            const [referralTokenAccount, createReferralTokenAccountIx] = await (0, utils_1.getOrCreateATAInstruction)(inTokenMint, referralOwner, this.program.provider.connection, owner);
            createReferralTokenAccountIx && preInstructions.push(createReferralTokenAccountIx);
            remainingAccounts.push({
                isSigner: false,
                isWritable: true,
                pubkey: referralTokenAccount,
            });
        }
        const swapTx = await this.program.methods
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
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            vaultProgram: this.vaultProgram.programId,
        })
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction();
        return new web3_js_1.Transaction({
            feePayer: owner,
            ...(await this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)),
        }).add(swapTx);
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
        (0, invariant_1.default)(!(!this.isStablePool &&
            !tokenAInAmount.isZero() &&
            !tokenBInAmount.isZero() &&
            !this.accountsInfo.poolLpSupply.isZero()), 'Constant product only supports balanced deposit');
        (0, invariant_1.default)(!(!tokenAInAmount.isZero() && !tokenBInAmount.isZero() && balance), 'Deposit balance is not possible when both token in amount is non-zero');
        if (this.accountsInfo.poolLpSupply.isZero()) {
            const poolTokenAmountOut = this.swapCurve.computeD(tokenAInAmount, tokenBInAmount);
            return {
                poolTokenAmountOut,
                minPoolTokenAmountOut: poolTokenAmountOut,
                tokenAInAmount: tokenAInAmount,
                tokenBInAmount: tokenBInAmount,
            };
        }
        const vaultAWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(this.accountsInfo.currentTime.toNumber(), this.vaultA.vaultState);
        const vaultBWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(this.accountsInfo.currentTime.toNumber(), this.vaultB.vaultState);
        if (tokenAInAmount.isZero() && balance) {
            const poolTokenAmountOut = this.getShareByAmount(tokenBInAmount, this.poolInfo.tokenBAmount, this.accountsInfo.poolLpSupply);
            const bufferedPoolTokenAmountOut = (0, utils_1.getMinAmountWithSlippage)(poolTokenAmountOut, constants_1.UNLOCK_AMOUNT_BUFFER);
            // Calculate for stable pool balance deposit but used `addImbalanceLiquidity`
            if (this.isStablePool) {
                return {
                    poolTokenAmountOut: bufferedPoolTokenAmountOut,
                    minPoolTokenAmountOut: (0, utils_1.getMinAmountWithSlippage)(bufferedPoolTokenAmountOut, slippage),
                    tokenAInAmount: tokenBInAmount.mul(this.poolInfo.tokenAAmount).div(this.poolInfo.tokenBAmount),
                    tokenBInAmount,
                };
            }
            // Constant product pool balance deposit
            const [actualTokenAInAmount, actualTokenBInAmount] = this.computeActualInAmount(poolTokenAmountOut, this.accountsInfo.poolLpSupply, this.accountsInfo.poolVaultALp, this.accountsInfo.poolVaultBLp, this.accountsInfo.vaultALpSupply, this.accountsInfo.vaultBLpSupply, vaultAWithdrawableAmount, vaultBWithdrawableAmount);
            return {
                poolTokenAmountOut: bufferedPoolTokenAmountOut,
                minPoolTokenAmountOut: (0, utils_1.getMinAmountWithSlippage)(bufferedPoolTokenAmountOut, slippage),
                tokenAInAmount: (0, utils_1.getMaxAmountWithSlippage)(actualTokenAInAmount, slippage),
                tokenBInAmount: (0, utils_1.getMaxAmountWithSlippage)(actualTokenBInAmount, slippage),
            };
        }
        if (tokenBInAmount.isZero() && balance) {
            const poolTokenAmountOut = this.getShareByAmount(tokenAInAmount, this.poolInfo.tokenAAmount, this.accountsInfo.poolLpSupply);
            const bufferedPoolTokenAmountOut = (0, utils_1.getMinAmountWithSlippage)(poolTokenAmountOut, constants_1.UNLOCK_AMOUNT_BUFFER);
            // Calculate for stable pool balance deposit but used `addImbalanceLiquidity`
            if (this.isStablePool) {
                return {
                    poolTokenAmountOut: bufferedPoolTokenAmountOut,
                    minPoolTokenAmountOut: (0, utils_1.getMinAmountWithSlippage)(bufferedPoolTokenAmountOut, slippage),
                    tokenAInAmount,
                    tokenBInAmount: tokenAInAmount.mul(this.poolInfo.tokenBAmount).div(this.poolInfo.tokenAAmount),
                };
            }
            // Constant product pool
            const [actualTokenAInAmount, actualTokenBInAmount] = this.computeActualInAmount(poolTokenAmountOut, this.accountsInfo.poolLpSupply, this.accountsInfo.poolVaultALp, this.accountsInfo.poolVaultBLp, this.accountsInfo.vaultALpSupply, this.accountsInfo.vaultBLpSupply, vaultAWithdrawableAmount, vaultBWithdrawableAmount);
            return {
                poolTokenAmountOut: bufferedPoolTokenAmountOut,
                minPoolTokenAmountOut: (0, utils_1.getMinAmountWithSlippage)(bufferedPoolTokenAmountOut, slippage),
                tokenAInAmount: (0, utils_1.getMaxAmountWithSlippage)(actualTokenAInAmount, slippage),
                tokenBInAmount: (0, utils_1.getMaxAmountWithSlippage)(actualTokenBInAmount, slippage),
            };
        }
        // Imbalance deposit
        const actualDepositAAmount = (0, utils_1.computeActualDepositAmount)(tokenAInAmount, this.poolInfo.tokenAAmount, this.accountsInfo.poolVaultALp, this.accountsInfo.vaultALpSupply, vaultAWithdrawableAmount);
        const actualDepositBAmount = (0, utils_1.computeActualDepositAmount)(tokenBInAmount, this.poolInfo.tokenBAmount, this.accountsInfo.poolVaultBLp, this.accountsInfo.vaultBLpSupply, vaultBWithdrawableAmount);
        const poolTokenAmountOut = this.swapCurve.computeImbalanceDeposit(actualDepositAAmount, actualDepositBAmount, this.poolInfo.tokenAAmount, this.poolInfo.tokenBAmount, this.accountsInfo.poolLpSupply, this.poolState.fees);
        return {
            poolTokenAmountOut,
            minPoolTokenAmountOut: (0, utils_1.getMinAmountWithSlippage)(poolTokenAmountOut, slippage),
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
    async deposit(owner, tokenAInAmount, tokenBInAmount, poolTokenAmount) {
        const { tokenAMint, tokenBMint, lpMint, lpSupply } = this.poolState;
        const [[userAToken, createTokenAIx], [userBToken, createTokenBIx], [userPoolLp, createLpMintIx]] = await this.createATAPreInstructions(owner, [tokenAMint, tokenBMint, lpMint]);
        let preInstructions = [];
        createTokenAIx && preInstructions.push(createTokenAIx);
        createTokenBIx && preInstructions.push(createTokenBIx);
        createLpMintIx && preInstructions.push(createLpMintIx);
        if (spl_token_1.NATIVE_MINT.equals(this.tokenAMint.address)) {
            preInstructions = preInstructions.concat((0, utils_1.wrapSOLInstruction)(owner, userAToken, BigInt(tokenAInAmount.toString())));
        }
        if (spl_token_1.NATIVE_MINT.equals(this.tokenBMint.address)) {
            preInstructions = preInstructions.concat((0, utils_1.wrapSOLInstruction)(owner, userBToken, BigInt(tokenBInAmount.toString())));
        }
        const postInstructions = [];
        if ([this.tokenAMint.address.toBase58(), this.tokenBMint.address.toBase58()].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, utils_1.unwrapSOLInstruction)(owner);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const programMethod = () => {
            if (lpSupply.isZero())
                return this.program.methods.bootstrapLiquidity(tokenAInAmount, tokenBInAmount);
            if (this.isStablePool)
                return this.program.methods.addImbalanceLiquidity(poolTokenAmount, tokenAInAmount, tokenBInAmount);
            return this.program.methods.addBalanceLiquidity(poolTokenAmount, tokenAInAmount, tokenBInAmount);
        };
        const depositTx = await programMethod()
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
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            vaultProgram: this.vaultProgram.programId,
            userPoolLp,
        })
            .remainingAccounts(this.swapCurve.getRemainingAccounts())
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction();
        return new web3_js_1.Transaction({
            feePayer: owner,
            ...(await this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)),
        }).add(depositTx);
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
        const vaultAWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(this.accountsInfo.currentTime.toNumber(), this.vaultA.vaultState);
        const vaultBWithdrawableAmount = (0, vault_sdk_1.calculateWithdrawableAmount)(this.accountsInfo.currentTime.toNumber(), this.vaultB.vaultState);
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
                minTokenAOutAmount: (0, utils_1.getMinAmountWithSlippage)(tokenAOutAmount, slippage),
                minTokenBOutAmount: (0, utils_1.getMinAmountWithSlippage)(tokenBOutAmount, slippage),
            };
        }
        // Imbalance withdraw
        const isWithdrawingTokenA = tokenMint.equals(this.tokenAMint.address);
        const isWithdrawingTokenB = tokenMint.equals(this.tokenBMint.address);
        (0, invariant_1.default)(isWithdrawingTokenA || isWithdrawingTokenB, constants_1.ERROR.INVALID_MINT);
        const tradeDirection = tokenMint.equals(this.poolState.tokenAMint) ? curve_1.TradeDirection.BToA : curve_1.TradeDirection.AToB;
        const outAmount = this.swapCurve.computeWithdrawOne(withdrawTokenAmount, this.accountsInfo.poolLpSupply, this.poolInfo.tokenAAmount, this.poolInfo.tokenBAmount, this.poolState.fees, tradeDirection);
        const [vaultLpSupply, vaultTotalAmount] = tradeDirection == curve_1.TradeDirection.AToB
            ? [this.accountsInfo.vaultBLpSupply, vaultBWithdrawableAmount]
            : [this.accountsInfo.vaultALpSupply, vaultAWithdrawableAmount];
        const vaultLpToBurn = outAmount.mul(vaultLpSupply).div(vaultTotalAmount);
        // "Actual" out amount (precision loss)
        const realOutAmount = vaultLpToBurn.mul(vaultTotalAmount).div(vaultLpSupply);
        const minRealOutAmount = (0, utils_1.getMinAmountWithSlippage)(realOutAmount, slippage);
        return {
            poolTokenAmountIn: withdrawTokenAmount,
            tokenAOutAmount: isWithdrawingTokenA ? realOutAmount : new anchor_1.BN(0),
            tokenBOutAmount: isWithdrawingTokenB ? realOutAmount : new anchor_1.BN(0),
            minTokenAOutAmount: isWithdrawingTokenA ? minRealOutAmount : new anchor_1.BN(0),
            minTokenBOutAmount: isWithdrawingTokenB ? minRealOutAmount : new anchor_1.BN(0),
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
    async withdraw(owner, lpTokenAmount, tokenAOutAmount, tokenBOutAmount) {
        const preInstructions = [];
        const [[userAToken, createUserAIx], [userBToken, createUserBIx], [userPoolLp, createLpTokenIx]] = await Promise.all([this.poolState.tokenAMint, this.poolState.tokenBMint, this.poolState.lpMint].map((key) => (0, utils_1.getOrCreateATAInstruction)(key, owner, this.program.provider.connection)));
        createUserAIx && preInstructions.push(createUserAIx);
        createUserBIx && preInstructions.push(createUserBIx);
        createLpTokenIx && preInstructions.push(createLpTokenIx);
        const postInstructions = [];
        if ([this.tokenAMint.address.toBase58(), this.tokenBMint.address.toBase58()].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, utils_1.unwrapSOLInstruction)(owner);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const programMethod = this.isStablePool && (tokenAOutAmount.isZero() || tokenBOutAmount.isZero())
            ? this.program.methods.removeLiquiditySingleSide(lpTokenAmount, new anchor_1.BN(0)).accounts({
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
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
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
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                vaultProgram: this.vaultProgram.programId,
            });
        const withdrawTx = await programMethod
            .remainingAccounts(this.swapCurve.getRemainingAccounts())
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction();
        return new web3_js_1.Transaction({
            feePayer: owner,
            ...(await this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)),
        }).add(withdrawTx);
    }
    async getUserLockEscrow(owner) {
        const [lockEscrowPK] = (0, utils_1.deriveLockEscrowPda)(this.address, owner, this.program.programId);
        const lockEscrowAccount = await this.program.account.lockEscrow.fetchNullable(lockEscrowPK);
        if (!lockEscrowAccount)
            return null;
        const lockEscrowVault = await this.program.provider.connection.getTokenAccountBalance(lockEscrowAccount.escrowVault);
        const [lockEscrow, _lockEscrowBump] = (0, utils_1.deriveLockEscrowPda)(this.address, owner, this.program.programId);
        const unClaimedFee = (0, utils_1.calculateUnclaimedLockEscrowFee)(lockEscrowAccount.totalLockedAmount, lockEscrowAccount.lpPerToken, lockEscrowAccount.unclaimedFeePending, this.poolInfo.virtualPriceRaw);
        // Patch the bug from v1 impl
        const escrowVaultAmount = new anchor_1.BN(lockEscrowVault.value.amount);
        const unclaimedFeeCap = unClaimedFee.gt(escrowVaultAmount) ? escrowVaultAmount : unClaimedFee;
        const { tokenAOutAmount, tokenBOutAmount } = this.getWithdrawQuote(unclaimedFeeCap, 0);
        return {
            address: lockEscrow,
            amount: lockEscrowAccount.totalLockedAmount || new anchor_1.BN(0),
            fee: {
                claimed: {
                    tokenA: lockEscrowAccount.aFee || new anchor_1.BN(0),
                    tokenB: lockEscrowAccount.bFee || new anchor_1.BN(0),
                },
                unClaimed: {
                    lp: unclaimedFeeCap,
                    tokenA: tokenAOutAmount || new anchor_1.BN(0),
                    tokenB: tokenBOutAmount || new anchor_1.BN(0),
                },
            },
        };
    }
    /**
     * `lockLiquidity` is a function that lock liquidity in Meteora pool, owner is able to claim fee later,
     * @param {PublicKey} owner - PublicKey - The public key of the escrow's owner, who get the locked liquidity, and can claim fee later
     * @param {BN} amount - The amount of LP tokens to lock.
     * @param {BN} feePayer - The payer of that lock liquidity.
     * @returns A transaction object
     */
    async lockLiquidity(owner, amount, feePayer) {
        const payer = feePayer ? feePayer : owner;
        const [lockEscrowPK] = (0, utils_1.deriveLockEscrowPda)(this.address, owner, this.program.programId);
        const preInstructions = [];
        const lockEscrowAccount = await this.program.account.lockEscrow.fetchNullable(lockEscrowPK);
        if (!lockEscrowAccount) {
            const createLockEscrowIx = await this.program.methods
                .createLockEscrow()
                .accounts({
                pool: this.address,
                lockEscrow: lockEscrowPK,
                owner,
                lpMint: this.poolState.lpMint,
                payer,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .instruction();
            preInstructions.push(createLockEscrowIx);
        }
        const [[userAta, createUserAtaIx], [escrowAta, createEscrowAtaIx]] = await Promise.all([
            (0, utils_1.getOrCreateATAInstruction)(this.poolState.lpMint, payer, this.program.provider.connection, payer),
            (0, utils_1.getOrCreateATAInstruction)(this.poolState.lpMint, lockEscrowPK, this.program.provider.connection, payer),
        ]);
        createUserAtaIx && preInstructions.push(createUserAtaIx);
        createEscrowAtaIx && preInstructions.push(createEscrowAtaIx);
        const lockTx = await this.program.methods
            .lock(amount)
            .accounts({
            pool: this.address,
            lockEscrow: lockEscrowPK,
            owner: payer,
            lpMint: this.poolState.lpMint,
            sourceTokens: userAta,
            escrowVault: escrowAta,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            aVault: this.poolState.aVault,
            bVault: this.poolState.bVault,
            aVaultLp: this.poolState.aVaultLp,
            bVaultLp: this.poolState.bVaultLp,
            aVaultLpMint: this.vaultA.vaultState.lpMint,
            bVaultLpMint: this.vaultB.vaultState.lpMint,
        })
            .preInstructions(preInstructions)
            .transaction();
        return new web3_js_1.Transaction({
            feePayer: payer,
            ...(await this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)),
        }).add(lockTx);
    }
    async claimLockFee(owner, maxAmount) {
        const [lockEscrowPK] = (0, utils_1.deriveLockEscrowPda)(this.address, owner, this.program.programId);
        const preInstructions = [];
        const [[userAta, createUserAtaIx], [escrowAta, createEscrowAtaIx], [tokenAAta, createTokenAAtaIx], [tokenBAta, createTokenBAtaIx],] = await Promise.all([
            (0, utils_1.getOrCreateATAInstruction)(this.poolState.lpMint, owner, this.program.provider.connection),
            (0, utils_1.getOrCreateATAInstruction)(this.poolState.lpMint, lockEscrowPK, this.program.provider.connection),
            (0, utils_1.getOrCreateATAInstruction)(this.poolState.tokenAMint, owner, this.program.provider.connection),
            (0, utils_1.getOrCreateATAInstruction)(this.poolState.tokenBMint, owner, this.program.provider.connection),
        ]);
        createUserAtaIx && preInstructions.push(createUserAtaIx);
        createEscrowAtaIx && preInstructions.push(createEscrowAtaIx);
        createTokenAAtaIx && preInstructions.push(createTokenAAtaIx);
        createTokenBAtaIx && preInstructions.push(createTokenBAtaIx);
        const postInstructions = [];
        if ([this.poolState.tokenAMint.toBase58(), this.poolState.tokenBMint.toBase58()].includes(spl_token_1.NATIVE_MINT.toBase58())) {
            const closeWrappedSOLIx = await (0, utils_1.unwrapSOLInstruction)(owner);
            closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
        }
        const tx = await this.program.methods
            .claimFee(maxAmount)
            .accounts({
            pool: this.address,
            lockEscrow: lockEscrowPK,
            owner,
            lpMint: this.poolState.lpMint,
            sourceTokens: userAta,
            escrowVault: escrowAta,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
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
        return new web3_js_1.Transaction({
            feePayer: owner,
            ...(await this.program.provider.connection.getLatestBlockhash(this.program.provider.connection.commitment)),
        }).add(tx);
    }
    async createATAPreInstructions(owner, mintList) {
        return Promise.all(mintList.map((mint) => {
            return (0, utils_1.getOrCreateATAInstruction)(mint, owner, this.program.provider.connection);
        }));
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
            return new anchor_1.BN(0);
        return roundUp ? amount.mul(lpSupply).divRound(tokenAmount) : amount.mul(lpSupply).div(tokenAmount);
    }
    getAmountByShare(amount, tokenAmount, lpSupply, roundUp) {
        if (lpSupply.isZero())
            return new anchor_1.BN(0);
        return roundUp ? amount.mul(tokenAmount).divRound(lpSupply) : amount.mul(tokenAmount).div(lpSupply);
    }
}
exports.default = AmmImpl;
//# sourceMappingURL=index.js.map