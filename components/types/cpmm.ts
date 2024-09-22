import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import { ApiV3PoolInfoConcentratedItem, ApiV3PoolInfoStandardItemCpmm, CpmmKeys } from "@/api/type";
import { Percent } from "@/module";
import { BN_ZERO } from "@/common/bignumber";
import { getATAAddress } from "@/common/pda";
import { RENT_PROGRAM_ID, SYSTEM_PROGRAM_ID, WSOLMint } from "@/common/pubKey";
import { InstructionType, TxVersion } from "@/common/txTool/txType";
import { MakeTxData } from "@/common/txTool/txTool";
import { CurveCalculator } from "../../app/curve/calculator";

import ModuleBase, { ModuleBaseProps } from "../moduleBase";
import {
  CreateCpmmPoolParam,
  CreateCpmmPoolAddress,
  AddCpmmLiquidityParams,
  WithdrawCpmmLiquidityParams,
  CpmmSwapParams,
  ComputePairAmountParams,
  CpmmRpcData,
  CpmmComputeData,
} from "./type";
import { getCreatePoolKeys, getPdaObservationId } from "./pda";
import {
  makeCreateCpmmPoolInInstruction,
  makeDepositCpmmInInstruction,
  makeWithdrawCpmmInInstruction,
  makeSwapCpmmBaseInInInstruction,
  makeSwapCpmmBaseOutInInstruction,
  makeCreateAmmConfig,
  makeInitializeMetadata,
  MAX_URI_LENGTH,
} from "../../app/instruction";
import BN from "bn.js";
import { CpmmPoolInfoLayout, CpmmConfigInfoLayout } from "../../app/layout";
import Decimal from "decimal.js";
import { fetchMultipleMintInfos, getMultipleAccountsInfoWithCustomFlags, getTransferAmountFeeV2 } from "@/common";
import { GetTransferAmountFee, ReturnTypeFetchMultipleMintInfos } from "@/raydium/type";
import { toApiV3Token, toFeeConfig } from "../token";
import { getPdaPoolAuthority } from "./pda";

export default class CpmmModule extends ModuleBase {
  constructor(params: ModuleBaseProps) {
    super(params);
  }

  public async load(): Promise<void> {
    this.checkDisabled();
  }

  public async getCpmmPoolKeys(poolId: string): Promise<CpmmKeys> {
    return ((await this.scope.api.fetchPoolKeysById({ idList: [poolId] })) as CpmmKeys[])[0];
  }

  public async getRpcPoolInfo(poolId: string, fetchConfigInfo?: boolean): Promise<CpmmRpcData> {
    return (await this.getRpcPoolInfos([poolId], fetchConfigInfo))[poolId];
  }

  public async getRpcPoolInfos(
    poolIds: string[],
    fetchConfigInfo?: boolean,
  ): Promise<{
    [poolId: string]: CpmmRpcData;
  }> {
    const accounts = await getMultipleAccountsInfoWithCustomFlags(
      this.scope.connection,
      poolIds.map((i) => ({ pubkey: new PublicKey(i) })),
    );
    const poolInfos: { [poolId: string]: ReturnType<typeof CpmmPoolInfoLayout.decode> & { programId: PublicKey } } = {};

    const needFetchConfigId = new Set<string>();
    const needFetchVaults: PublicKey[] = [];

    for (let i = 0; i < poolIds.length; i++) {
      const item = accounts[i];
      if (item.accountInfo === null) throw Error("fetch pool info error: " + String(poolIds[i]));
      const rpc = CpmmPoolInfoLayout.decode(item.accountInfo.data);
      poolInfos[String(poolIds[i])] = {
        ...rpc,
        programId: item.accountInfo.owner,
      };
      needFetchConfigId.add(String(rpc.configId));

      needFetchVaults.push(rpc.vaultA, rpc.vaultB);
    }

    const configInfo: { [configId: string]: ReturnType<typeof CpmmConfigInfoLayout.decode> } = {};

    if (fetchConfigInfo) {
      const configIds = [...needFetchConfigId];
      const configState = await getMultipleAccountsInfoWithCustomFlags(
        this.scope.connection,
        configIds.map((i) => ({ pubkey: new PublicKey(i) })),
      );

      for (let i = 0; i < configIds.length; i++) {
        const configItemInfo = configState[i].accountInfo;
        if (configItemInfo === null) throw Error("fetch pool config error: " + configIds[i]);
        configInfo[configIds[i]] = CpmmConfigInfoLayout.decode(configItemInfo.data);
      }
    }

    const vaultInfo: { [vaultId: string]: BN } = {};

    const vaultAccountInfo = await getMultipleAccountsInfoWithCustomFlags(
      this.scope.connection,
      needFetchVaults.map((i) => ({ pubkey: new PublicKey(i) })),
    );

    for (let i = 0; i < needFetchVaults.length; i++) {
      const vaultItemInfo = vaultAccountInfo[i].accountInfo;
      if (vaultItemInfo === null) throw Error("fetch vault info error: " + needFetchVaults[i]);

      vaultInfo[String(needFetchVaults[i])] = new BN(AccountLayout.decode(vaultItemInfo.data).amount.toString());
    }

    const returnData: { [poolId: string]: CpmmRpcData } = {};

    for (const [id, info] of Object.entries(poolInfos)) {
      const baseReserve = vaultInfo[info.vaultA.toString()].sub(info.protocolFeesMintA).sub(info.fundFeesMintA);
      const quoteReserve = vaultInfo[info.vaultB.toString()].sub(info.protocolFeesMintB).sub(info.fundFeesMintB);
      returnData[id] = {
        ...info,
        baseReserve,
        quoteReserve,
        vaultAAmount: vaultInfo[info.vaultA.toString()],
        vaultBAmount: vaultInfo[info.vaultB.toString()],
        configInfo: configInfo[info.configId.toString()],
        poolPrice: new Decimal(quoteReserve.toString())
          .div(new Decimal(10).pow(info.mintDecimalB))
          .div(new Decimal(baseReserve.toString()).div(new Decimal(10).pow(info.mintDecimalA))),
      };
    }

    return returnData;
  }

  public toComputePoolInfos({
    pools,
    mintInfos,
  }: {
    pools: Record<string, CpmmRpcData>;
    mintInfos: ReturnTypeFetchMultipleMintInfos;
  }): Record<string, CpmmComputeData> {
    return Object.keys(pools).reduce((acc, cur) => {
      const pool = pools[cur];
      const [mintA, mintB] = [pool.mintA.toBase58(), pool.mintB.toBase58()];

      return {
        ...acc,
        [cur]: {
          ...pool,
          id: new PublicKey(cur),
          configInfo: pool.configInfo!,
          version: 7 as const,
          authority: getPdaPoolAuthority(pool.programId).publicKey,
          mintA: toApiV3Token({
            address: mintA,
            decimals: pool.mintDecimalA,
            programId: pool.mintProgramA.toBase58(),
            extensions: {
              feeConfig: mintInfos[mintA]?.feeConfig ? toFeeConfig(mintInfos[mintA]?.feeConfig) : undefined,
            },
          }),
          mintB: toApiV3Token({
            address: mintB,
            decimals: pool.mintDecimalB,
            programId: pool.mintProgramB.toBase58(),
            extensions: {
              feeConfig: mintInfos[mintB]?.feeConfig ? toFeeConfig(mintInfos[mintB]?.feeConfig) : undefined,
            },
          }),
        },
      };
    }, {} as Record<string, CpmmComputeData>);
  }

  public async getPoolInfoFromRpc(poolId: string): Promise<{
    poolInfo: ApiV3PoolInfoStandardItemCpmm;
    poolKeys: CpmmKeys;
    rpcData: CpmmRpcData;
  }> {
    const rpcData = await this.getRpcPoolInfo(poolId, true);
    const mintInfos = await fetchMultipleMintInfos({
      connection: this.scope.connection,
      mints: [rpcData.mintA, rpcData.mintB],
    });

    const mintA = toApiV3Token({
      address: rpcData.mintA.toBase58(),
      decimals: rpcData.mintDecimalA,
      programId: rpcData.mintProgramA.toBase58(),
      extensions: {
        feeConfig: mintInfos[rpcData.mintA.toBase58()].feeConfig
          ? toFeeConfig(mintInfos[rpcData.mintA.toBase58()].feeConfig)
          : undefined,
      },
    });
    const mintB = toApiV3Token({
      address: rpcData.mintB.toBase58(),
      decimals: rpcData.mintDecimalB,
      programId: rpcData.mintProgramB.toBase58(),
      extensions: {
        feeConfig: mintInfos[rpcData.mintB.toBase58()].feeConfig
          ? toFeeConfig(mintInfos[rpcData.mintB.toBase58()].feeConfig)
          : undefined,
      },
    });

    const lpMint = toApiV3Token({
      address: rpcData.mintLp.toBase58(),
      decimals: rpcData.lpDecimals,
      programId: TOKEN_PROGRAM_ID.toBase58(),
    });

    const configInfo = {
      id: rpcData.configId.toBase58(),
      index: rpcData.configInfo!.index,
      protocolFeeRate: rpcData.configInfo!.protocolFeeRate.toNumber(),
      tradeFeeRate: rpcData.configInfo!.tradeFeeRate.toNumber(),
      fundFeeRate: rpcData.configInfo!.fundFeeRate.toNumber(),
      createPoolFee: rpcData.configInfo!.createPoolFee.toString(),
    };

    const mockRewardData = {
      volume: 0,
      volumeQuote: 0,
      volumeFee: 0,
      apr: 0,
      feeApr: 0,
      priceMin: 0,
      priceMax: 0,
      rewardApr: [],
    };

    return {
      poolInfo: {
        programId: "CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj",
        id: poolId,
        type: "Standard",
        lpMint,
        lpPrice: 0,
        lpAmount: rpcData.lpAmount.toNumber(),
        config: configInfo,
        mintA,
        mintB,
        rewardDefaultInfos: [],
        rewardDefaultPoolInfos: "Ecosystem",
        price: rpcData.poolPrice.toNumber(),
        mintAmountA: new Decimal(rpcData.vaultAAmount.toString()).div(10 ** mintA.decimals).toNumber(),
        mintAmountB: new Decimal(rpcData.vaultBAmount.toString()).div(10 ** mintB.decimals).toNumber(),
        feeRate: rpcData.configInfo!.tradeFeeRate.toNumber(),
        tvl: 0,

        day: mockRewardData,
        week: mockRewardData,
        month: mockRewardData,
        pooltype: [],

        farmUpcomingCount: 0,
        farmOngoingCount: 0,
        farmFinishedCount: 0,
      },
      poolKeys: {
        programId: "CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj",
        id: poolId,
        mintA,
        mintB,
        vault: { A: rpcData.vaultA.toBase58(), B: rpcData.vaultB.toBase58() },
        authority: getPdaPoolAuthority(rpcData.programId).publicKey.toBase58(),
        mintLp: lpMint,
        config: configInfo,
      },
      rpcData,
    };
  }

  public async createPool<T extends TxVersion>({
    programId,
    poolFeeAccount,
    startTime,
    ownerInfo,
    associatedOnly = false,
    checkCreateATAOwner = false,
    txVersion,
    computeBudgetConfig,
    name,
    symbol,
    uri,
    ...params
  }: CreateCpmmPoolParam<T>): Promise<MakeTxData<T, { address: CreateCpmmPoolAddress }>> {
    const payer = ownerInfo.feePayer || this.scope.owner?.publicKey;
    const isFront = new BN(new PublicKey(params.mintA.address).toBuffer()).lte(
      new BN(new PublicKey(params.mintB.address).toBuffer()),
    );

    const [mintA, mintB] = isFront ? [params.mintA, params.mintB] : [params.mintB, params.mintA];
    const [mintAAmount, mintBAmount] = isFront
      ? [params.mintAAmount, params.mintBAmount]
      : [params.mintBAmount, params.mintAAmount];

    const mintAUseSOLBalance = ownerInfo.useSOLBalance && mintA.address === NATIVE_MINT.toBase58();
    const mintBUseSOLBalance = ownerInfo.useSOLBalance && mintB.address === NATIVE_MINT.toBase58();
    const [mintAPubkey, mintBPubkey] = [new PublicKey(mintA.address), new PublicKey(mintB.address)];
    const txBuilder = this.createTxBuilder();

    const { account: userVaultA, instructionParams: userVaultAInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: mintAPubkey,
        tokenProgram: mintA.programId,
        owner: this.scope.ownerPubKey,
        createInfo: mintAUseSOLBalance
          ? {
              payer: payer!,
              amount: mintAAmount,
            }
          : undefined,
        notUseTokenAccount: mintAUseSOLBalance,
        skipCloseAccount: !mintAUseSOLBalance,
        associatedOnly: mintAUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    txBuilder.addInstruction(userVaultAInstruction || {});
    const { account: userVaultB, instructionParams: userVaultBInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: new PublicKey(mintB.address),
        tokenProgram: mintB.programId,
        owner: this.scope.ownerPubKey,
        createInfo: mintBUseSOLBalance
          ? {
              payer: payer!,
              amount: mintBAmount,
            }
          : undefined,

        notUseTokenAccount: mintBUseSOLBalance,
        skipCloseAccount: !mintBUseSOLBalance,
        associatedOnly: mintBUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    txBuilder.addInstruction(userVaultBInstruction || {});

    if (userVaultA === undefined || userVaultB === undefined) throw Error("you don't has some token account");

    const configid = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
    const [ammConfigKey, _bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("amm_config"), new BN(configid).toArrayLike(Buffer, 'be', 8)],
        programId
    );
    const poolKeys = getCreatePoolKeys({
      creator: this.scope.ownerPubKey,
      programId,
      mintA: mintAPubkey,
      mintB: mintBPubkey,
      configId: ammConfigKey
    });
    poolKeys.configId = ammConfigKey;

    async function shortenUrl(url: string): Promise<string> {
      try {
        const response = await fetch(`http://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
        return await response.text();
      } catch (error) {
        console.error('Error shortening URL:', error);
        return url.substring(0, MAX_URI_LENGTH);
      }
    }
    txBuilder.addInstruction({
      instructions: [
        makeCreateAmmConfig(
          programId,
          this.scope.ownerPubKey,
          ammConfigKey,
          new BN(configid),
          new BN(2500), // token1LpRate
          new BN(2500), // token0LpRate
          new BN(2500), // token0CreatorRate
          new BN(2500)  // token1CreatorRate
        ),
        makeCreateCpmmPoolInInstruction(
          programId,
          this.scope.ownerPubKey,
          ammConfigKey,
          poolKeys.authority,
          poolKeys.poolId,
          mintAPubkey,
          mintBPubkey,
          poolKeys.lpMint,
          userVaultA,
          userVaultB,
          getATAAddress(this.scope.ownerPubKey, poolKeys.lpMint).publicKey,
          poolKeys.vaultA,
          poolKeys.vaultB,
          new PublicKey(mintA.programId ?? TOKEN_PROGRAM_ID),
          new PublicKey(mintB.programId ?? TOKEN_PROGRAM_ID),
          poolKeys.observationId,
          mintAAmount,
          mintBAmount,
          startTime,
        ),
        makeInitializeMetadata(
          programId,
          this.scope.ownerPubKey,
          poolKeys.authority,
          poolKeys.lpMint,
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), // Token Metadata Program ID
          PublicKey.findProgramAddressSync(
            [
              Buffer.from("metadata"),
              new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
              poolKeys.lpMint.toBuffer(),
            ],
            new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
          )[0],
          SYSTEM_PROGRAM_ID,
          RENT_PROGRAM_ID,
          ammConfigKey,
          poolKeys.poolId,
          poolKeys.observationId,
          name,
          symbol,
          await shortenUrl(uri)
        ),
      ],
      instructionTypes: [InstructionType.CpmmCreatePool],
    });

    txBuilder.addCustomComputeBudget(computeBudgetConfig);

    return txBuilder.versionBuild({
      txVersion,
      extInfo: {
        address: { ...poolKeys, mintA, mintB, programId, poolFeeAccount },
      },
    }) as Promise<MakeTxData<T, { address: CreateCpmmPoolAddress }>>;
  }

  public async addLiquidity<T extends TxVersion>(params: AddCpmmLiquidityParams<T>): Promise<MakeTxData<T>> {
    const {
      poolInfo,
      poolKeys: propPoolKeys,
      inputAmount,
      baseIn,
      slippage,
      computeResult,
      computeBudgetConfig,
      config,
      txVersion,
    } = params;

    if (this.scope.availability.addStandardPosition === false)
      this.logAndCreateError("add liquidity feature disabled in your region");

    if (inputAmount.isZero())
      this.logAndCreateError("amounts must greater than zero", "amountInA", {
        amountInA: inputAmount.toString(),
      });
    const { account } = this.scope;
    const { bypassAssociatedCheck, checkCreateATAOwner } = {
      // default
      ...{ bypassAssociatedCheck: false, checkCreateATAOwner: false },
      // custom
      ...config,
    };
    const rpcPoolData = computeResult ? undefined : await this.getRpcPoolInfo(poolInfo.id);

    const {
      liquidity,
      inputAmountFee,
      anotherAmount: _anotherAmount,
    } = computeResult ||
    this.computePairAmount({
      poolInfo: {
        ...poolInfo,
        lpAmount: new Decimal(rpcPoolData!.lpAmount.toString()).div(10 ** poolInfo.lpMint.decimals).toNumber(),
      },
      baseReserve: rpcPoolData!.baseReserve,
      quoteReserve: rpcPoolData!.quoteReserve,
      slippage: new Percent(0),
      baseIn,
      epochInfo: await this.scope.fetchEpochInfo(),
      amount: new Decimal(inputAmount.toString()).div(
        10 ** (baseIn ? poolInfo.mintA.decimals : poolInfo.mintB.decimals),
      ),
    });

    const anotherAmount = _anotherAmount.amount;
    const mintAUseSOLBalance = poolInfo.mintA.address === NATIVE_MINT.toString();
    const mintBUseSOLBalance = poolInfo.mintB.address === NATIVE_MINT.toString();

    const txBuilder = this.createTxBuilder();
    const [mintA, mintB] = [new PublicKey(poolInfo.mintA.address), new PublicKey(poolInfo.mintB.address)];

    const { account: tokenAccountA, instructionParams: _tokenAccountAInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        tokenProgram: poolInfo.mintA.programId,
        mint: new PublicKey(poolInfo.mintA.address),
        owner: this.scope.ownerPubKey,

        createInfo:
          mintAUseSOLBalance || (baseIn ? inputAmount : anotherAmount).isZero()
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseIn ? inputAmount : anotherAmount,
              }
            : undefined,
        skipCloseAccount: !mintAUseSOLBalance,
        notUseTokenAccount: mintAUseSOLBalance,
        associatedOnly: false,
        checkCreateATAOwner,
      });

    txBuilder.addInstruction(_tokenAccountAInstruction || {});

    const { account: tokenAccountB, instructionParams: _tokenAccountBInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        tokenProgram: poolInfo.mintB.programId,
        mint: new PublicKey(poolInfo.mintB.address),
        owner: this.scope.ownerPubKey,

        createInfo:
          mintBUseSOLBalance || (baseIn ? anotherAmount : inputAmount).isZero()
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseIn ? anotherAmount : inputAmount,
              }
            : undefined,
        skipCloseAccount: !mintBUseSOLBalance,
        notUseTokenAccount: mintBUseSOLBalance,
        associatedOnly: false,
        checkCreateATAOwner,
      });

    txBuilder.addInstruction(_tokenAccountBInstruction || {});

    if (!tokenAccountA && !tokenAccountB)
      this.logAndCreateError("cannot found target token accounts", "tokenAccounts", account.tokenAccounts);
    const lpTokenAccount = await account.getCreatedTokenAccount({
      mint: new PublicKey(poolInfo.lpMint.address),
    });
    const { tokenAccount: _lpTokenAccount, ...lpInstruction } = await account.handleTokenAccount({
      side: "out",
      amount: 0,
      mint: new PublicKey(poolInfo.lpMint.address),
      tokenAccount: lpTokenAccount,
      bypassAssociatedCheck,
      checkCreateATAOwner,
    });
    txBuilder.addInstruction(lpInstruction);
    const poolKeys = propPoolKeys ?? (await this.getCpmmPoolKeys(poolInfo.id));
    const _slippage = new Percent(new BN(1)).sub(slippage);

    txBuilder.addInstruction({
      instructions: [
        makeDepositCpmmInInstruction(
          new PublicKey(poolInfo.programId),
          this.scope.ownerPubKey,
          new PublicKey(poolKeys.authority),
          new PublicKey(poolInfo.id),
          _lpTokenAccount!,
          tokenAccountA!,
          tokenAccountB!,
          new PublicKey(poolKeys.vault.A),
          new PublicKey(poolKeys.vault.B),
          mintA,
          mintB,
          new PublicKey(poolInfo.lpMint.address),

          computeResult ? computeResult?.liquidity : _slippage.mul(liquidity).quotient,
          baseIn ? inputAmountFee.amount : anotherAmount,
          baseIn ? anotherAmount : inputAmountFee.amount,
          new PublicKey(poolInfo.mintA.programId),
          new PublicKey(poolInfo.mintB.programId)
        ),
      ],
      instructionTypes: [InstructionType.CpmmAddLiquidity],
      lookupTableAddress: poolKeys.lookupTableAccount ? [poolKeys.lookupTableAccount] : [],
    });
    txBuilder.addCustomComputeBudget(computeBudgetConfig);
    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public async withdrawLiquidity<T extends TxVersion>(params: WithdrawCpmmLiquidityParams<T>): Promise<MakeTxData<T>> {
    const { poolInfo, poolKeys: propPoolKeys, lpAmount, slippage, computeBudgetConfig, txVersion } = params;

    if (this.scope.availability.addStandardPosition === false)
      this.logAndCreateError("add liquidity feature disabled in your region");

    const _slippage = new Percent(new BN(1)).sub(slippage);

    const rpcPoolData = await this.getRpcPoolInfo(poolInfo.id);
    const [amountMintA, amountMintB] = [
      _slippage.mul(lpAmount.mul(rpcPoolData.baseReserve).div(rpcPoolData.lpAmount)).quotient,
      _slippage.mul(lpAmount.mul(rpcPoolData.quoteReserve).div(rpcPoolData.lpAmount)).quotient,
    ];

    const epochInfo = await this.scope.fetchEpochInfo();
    const [mintAAmountFee, mintBAmountFee] = [
      getTransferAmountFeeV2(amountMintA, poolInfo.mintA.extensions.feeConfig, epochInfo, false),
      getTransferAmountFeeV2(amountMintB, poolInfo.mintB.extensions.feeConfig, epochInfo, false),
    ];

    const { account } = this.scope;
    const txBuilder = this.createTxBuilder();
    const [mintA, mintB] = [new PublicKey(poolInfo.mintA.address), new PublicKey(poolInfo.mintB.address)];

    const mintAUseSOLBalance = mintA.equals(WSOLMint);
    const mintBUseSOLBalance = mintB.equals(WSOLMint);

    let tokenAccountA: PublicKey | undefined = undefined;
    let tokenAccountB: PublicKey | undefined = undefined;
    const { account: _ownerTokenAccountA, instructionParams: accountAInstructions } =
      await this.scope.account.getOrCreateTokenAccount({
        tokenProgram: poolInfo.mintA.programId,
        mint: new PublicKey(poolInfo.mintA.address),
        notUseTokenAccount: mintAUseSOLBalance,
        owner: this.scope.ownerPubKey,
        createInfo: {
          payer: this.scope.ownerPubKey,
          amount: 0,
        },
        skipCloseAccount: !mintAUseSOLBalance,
        associatedOnly: mintAUseSOLBalance ? false : true,
        checkCreateATAOwner: false,
      });
    tokenAccountA = _ownerTokenAccountA;
    accountAInstructions && txBuilder.addInstruction(accountAInstructions);

    const { account: _ownerTokenAccountB, instructionParams: accountBInstructions } =
      await this.scope.account.getOrCreateTokenAccount({
        tokenProgram: poolInfo.mintB.programId,
        mint: new PublicKey(poolInfo.mintB.address),
        notUseTokenAccount: mintBUseSOLBalance,
        owner: this.scope.ownerPubKey,
        createInfo: {
          payer: this.scope.ownerPubKey,
          amount: 0,
        },
        skipCloseAccount: !mintBUseSOLBalance,
        associatedOnly: mintBUseSOLBalance ? false : true,
        checkCreateATAOwner: false,
      });
    tokenAccountB = _ownerTokenAccountB;
    accountBInstructions && txBuilder.addInstruction(accountBInstructions);

    if (!tokenAccountA || !tokenAccountB)
      this.logAndCreateError("cannot found target token accounts", "tokenAccounts", account.tokenAccounts);

    const lpTokenAccount = await account.getCreatedTokenAccount({
      mint: new PublicKey(poolInfo.lpMint.address),
    });

    if (!lpTokenAccount)
      this.logAndCreateError("cannot found lp token account", "tokenAccounts", account.tokenAccounts);
    const poolKeys = propPoolKeys ?? (await this.getCpmmPoolKeys(poolInfo.id));
    txBuilder.addInstruction({
      instructions: [
        makeWithdrawCpmmInInstruction(
          new PublicKey(poolInfo.programId),
          this.scope.ownerPubKey,
          new PublicKey(poolKeys.authority),
          new PublicKey(poolInfo.id),
          lpTokenAccount!,
          tokenAccountA!,
          tokenAccountB!,
          new PublicKey(poolKeys.vault.A),
          new PublicKey(poolKeys.vault.B),
          mintA,
          mintB,
          new PublicKey(poolInfo.lpMint.address),

          lpAmount,
          amountMintA.sub(mintAAmountFee.fee ?? new BN(0)),
          amountMintB.sub(mintBAmountFee.fee ?? new BN(0)),
          new PublicKey(poolInfo.mintA.programId),
          new PublicKey(poolInfo.mintB.programId)
        ),
      ],
      instructionTypes: [InstructionType.CpmmWithdrawLiquidity],
      lookupTableAddress: poolKeys.lookupTableAccount ? [poolKeys.lookupTableAccount] : [],
    });
    txBuilder.addCustomComputeBudget(computeBudgetConfig);
    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public async swap<T extends TxVersion>(params: CpmmSwapParams): Promise<MakeTxData<T>> {
    const {
      poolInfo,
      poolKeys: propPoolKeys,
      baseIn,
      inputAmount,
      swapResult,
      slippage = 0,
      config,
      computeBudgetConfig,
      txVersion,
    } = params;

    const { bypassAssociatedCheck, checkCreateATAOwner, associatedOnly } = {
      // default
      ...{ bypassAssociatedCheck: false, checkCreateATAOwner: false, associatedOnly: true },
      // custom
      ...config,
    };

    const txBuilder = this.createTxBuilder();

    const [mintA, mintB] = [new PublicKey(poolInfo.mintA.address), new PublicKey(poolInfo.mintB.address)];
    swapResult.destinationAmountSwapped = swapResult.destinationAmountSwapped
      .mul(new BN((1 - slippage) * 10000))
      .div(new BN(10000));

    const mintAUseSOLBalance = poolInfo.mintA.address === WSOLMint.toBase58();
    const mintBUseSOLBalance = poolInfo.mintB.address === WSOLMint.toBase58();
    const { account: mintATokenAcc, instructionParams: mintATokenAccInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: mintA,
        tokenProgram: new PublicKey(poolInfo.mintA.programId ?? TOKEN_PROGRAM_ID),
        owner: this.scope.ownerPubKey,
        createInfo:
          mintAUseSOLBalance || !baseIn
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseIn ? swapResult.sourceAmountSwapped : 0,
              }
            : undefined,
        notUseTokenAccount: mintAUseSOLBalance,
        skipCloseAccount: !mintAUseSOLBalance,
        associatedOnly: mintAUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    mintATokenAccInstruction && txBuilder.addInstruction(mintATokenAccInstruction);

    const { account: mintBTokenAcc, instructionParams: mintBTokenAccInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: mintB,
        tokenProgram: new PublicKey(poolInfo.mintB.programId ?? TOKEN_PROGRAM_ID),
        owner: this.scope.ownerPubKey,
        createInfo:
          mintBUseSOLBalance || baseIn
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseIn ? 0 : swapResult.sourceAmountSwapped,
              }
            : undefined,
        notUseTokenAccount: mintBUseSOLBalance,
        skipCloseAccount: !mintBUseSOLBalance,
        associatedOnly: mintBUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    mintBTokenAccInstruction && txBuilder.addInstruction(mintBTokenAccInstruction);

    if (!mintATokenAcc || !mintBTokenAcc)
      this.logAndCreateError("user do not have token account", {
        mintA: poolInfo.mintA.symbol || poolInfo.mintA.address,
        mintB: poolInfo.mintB.symbol || poolInfo.mintB.address,
        mintATokenAcc,
        mintBTokenAcc,
        mintAUseSOLBalance,
        mintBUseSOLBalance,
        associatedOnly,
      });

    const poolKeys = propPoolKeys ?? (await this.getCpmmPoolKeys(poolInfo.id));

    txBuilder.addInstruction({
      instructions: [
        makeSwapCpmmBaseInInInstruction(
          new PublicKey(poolInfo.programId),
          this.scope.ownerPubKey,
          new PublicKey(poolKeys.authority),
          new PublicKey(poolKeys.config.id),
          new PublicKey(poolInfo.id),
          baseIn ? mintATokenAcc! : mintBTokenAcc!,
          baseIn ? mintBTokenAcc! : mintATokenAcc!,
          new PublicKey(poolKeys.vault[baseIn ? "A" : "B"]),
          new PublicKey(poolKeys.vault[baseIn ? "B" : "A"]),
          new PublicKey(poolInfo[baseIn ? "mintA" : "mintB"].programId ?? TOKEN_PROGRAM_ID),
          new PublicKey(poolInfo[baseIn ? "mintB" : "mintA"].programId ?? TOKEN_PROGRAM_ID),
          baseIn ? mintA : mintB,
          baseIn ? mintB : mintA,
          getPdaObservationId(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,

          inputAmount,
          swapResult.destinationAmountSwapped,
        ),
        // baseIn
        //   ? makeSwapCpmmBaseInInInstruction(
        //       new PublicKey(poolInfo.programId),
        //       this.scope.ownerPubKey,
        //       new PublicKey(poolKeys.authority),
        //       new PublicKey(poolKeys.config.id),
        //       new PublicKey(poolInfo.id),
        //       mintATokenAcc!,
        //       mintBTokenAcc!,
        //       new PublicKey(poolKeys.vault.A),
        //       new PublicKey(poolKeys.vault.B),
        //       new PublicKey(poolInfo.mintA.programId ?? TOKEN_PROGRAM_ID),
        //       new PublicKey(poolInfo.mintB.programId ?? TOKEN_PROGRAM_ID),
        //       mintA,
        //       mintB,
        //       getPdaObservationId(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,

        //       swapResult.sourceAmountSwapped,
        //       swapResult.destinationAmountSwapped,
        //     )
        //   : makeSwapCpmmBaseOutInInstruction(
        //       new PublicKey(poolInfo.programId),
        //       this.scope.ownerPubKey,
        //       new PublicKey(poolKeys.authority),
        //       new PublicKey(poolKeys.config.id),
        //       new PublicKey(poolInfo.id),

        //       mintBTokenAcc!,
        //       mintATokenAcc!,

        //       new PublicKey(poolKeys.vault.B),
        //       new PublicKey(poolKeys.vault.A),

        //       new PublicKey(poolInfo.mintB.programId ?? TOKEN_PROGRAM_ID),
        //       new PublicKey(poolInfo.mintA.programId ?? TOKEN_PROGRAM_ID),

        //       mintB,
        //       mintA,

        //       getPdaObservationId(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,

        //       swapResult.sourceAmountSwapped,
        //       swapResult.destinationAmountSwapped,
        //     ),
      ],
      instructionTypes: [baseIn ? InstructionType.CpmmSwapBaseIn : InstructionType.CpmmSwapBaseOut],
    });

    txBuilder.addCustomComputeBudget(computeBudgetConfig);

    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public computeSwapAmount({
    pool,
    amountIn,
    outputMint,
    slippage,
  }: {
    pool: CpmmComputeData;
    amountIn: BN;
    outputMint: string | PublicKey;
    slippage: number;
  }): {
    allTrade: boolean;
    amountIn: BN;
    amountOut: BN;
    minAmountOut: BN;
    fee: BN;
    executionPrice: Decimal;
    priceImpact: any;
  } {
    const isBaseIn = outputMint.toString() === pool.mintB.address;

    const swapResult = CurveCalculator.swap(
      amountIn,
      isBaseIn ? pool.baseReserve : pool.quoteReserve,
      isBaseIn ? pool.quoteReserve : pool.baseReserve,
      pool.configInfo.tradeFeeRate,
    );

    const executionPrice = new Decimal(swapResult.destinationAmountSwapped.toString()).div(
      swapResult.sourceAmountSwapped.toString(),
    );

    const minAmountOut = swapResult.destinationAmountSwapped.mul(new BN((1 - slippage) * 10000)).div(new BN(10000));

    return {
      allTrade: swapResult.sourceAmountSwapped.eq(amountIn),
      amountIn,
      amountOut: swapResult.destinationAmountSwapped,
      minAmountOut,
      executionPrice,
      fee: swapResult.tradeFee,
      priceImpact: pool.poolPrice.sub(executionPrice).div(pool.poolPrice),
    };
  }

  public computePairAmount({
    poolInfo,
    baseReserve,
    quoteReserve,
    amount,
    slippage,
    epochInfo,
    baseIn,
  }: ComputePairAmountParams): {
    inputAmountFee: GetTransferAmountFee;
    anotherAmount: GetTransferAmountFee;
    maxAnotherAmount: GetTransferAmountFee;
    liquidity: BN;
  } {
    const coefficient = 1 - Number(slippage.toSignificant()) / 100;
    const inputAmount = new BN(
      new Decimal(amount)
        .mul(10 ** poolInfo[baseIn ? "mintA" : "mintB"].decimals)
        .mul(coefficient)
        .toFixed(0),
    );
    const inputAmountFee = getTransferAmountFeeV2(
      inputAmount,
      poolInfo[baseIn ? "mintA" : "mintB"].extensions.feeConfig,
      epochInfo,
      false,
    );
    const _inputAmountWithoutFee = inputAmount.sub(inputAmountFee.fee ?? new BN(0));

    const lpAmount = new BN(
      new Decimal(poolInfo.lpAmount).mul(10 ** poolInfo.lpMint.decimals).toFixed(0, Decimal.ROUND_DOWN),
    );
    this.logDebug("baseReserve:", baseReserve.toString(), "quoteReserve:", quoteReserve.toString());

    this.logDebug(
      "tokenIn:",
      baseIn ? poolInfo.mintA.symbol : poolInfo.mintB.symbol,
      "amountIn:",
      inputAmount.toString(),
      "amountInFee:",
      inputAmountFee.fee?.toString() ?? 0,
      "anotherToken:",
      baseIn ? poolInfo.mintB.symbol : poolInfo.mintA.symbol,
      "slippage:",
      `${slippage.toSignificant()}%`,
    );

    // input is fixed
    const input = baseIn ? "base" : "quote";
    this.logDebug("input side:", input);

    const liquidity = _inputAmountWithoutFee.mul(lpAmount).div(input === "base" ? baseReserve : quoteReserve);
    let anotherAmountFee: GetTransferAmountFee = {
      amount: BN_ZERO,
      fee: undefined,
      expirationTime: undefined,
    };
    if (!_inputAmountWithoutFee.isZero()) {
      const lpAmountData = lpToAmount(liquidity, baseReserve, quoteReserve, lpAmount);
      this.logDebug("lpAmountData:", {
        amountA: lpAmountData.amountA.toString(),
        amountB: lpAmountData.amountB.toString(),
      });
      anotherAmountFee = getTransferAmountFeeV2(
        lpAmountData[baseIn ? "amountB" : "amountA"],
        poolInfo[baseIn ? "mintB" : "mintA"].extensions.feeConfig,
        epochInfo,
        true,
      );
    }

    const _slippage = new Percent(new BN(1)).add(slippage);
    const slippageAdjustedAmount = getTransferAmountFeeV2(
      _slippage.mul(anotherAmountFee.amount.sub(anotherAmountFee.fee ?? new BN(0))).quotient,
      poolInfo[baseIn ? "mintB" : "mintA"].extensions.feeConfig,
      epochInfo,
      true,
    );

    this.logDebug(
      "anotherAmount:",
      anotherAmountFee.amount.toString(),
      "anotherAmountFee:",
      anotherAmountFee.fee?.toString() ?? 0,
      "maxAnotherAmount:",
      slippageAdjustedAmount.amount.toString(),
      "maxAnotherAmountFee:",
      slippageAdjustedAmount.fee?.toString() ?? 0,
    );

    return {
      inputAmountFee,
      anotherAmount: anotherAmountFee,
      maxAnotherAmount: slippageAdjustedAmount,
      liquidity,
    };
  }
}

function lpToAmount(lp: BN, poolAmountA: BN, poolAmountB: BN, supply: BN): { amountA: BN; amountB: BN } {
  let amountA = lp.mul(poolAmountA).div(supply);
  if (!amountA.isZero() && !lp.mul(poolAmountA).mod(supply).isZero()) amountA = amountA.add(new BN(1));
  let amountB = lp.mul(poolAmountB).div(supply);
  if (!amountB.isZero() && !lp.mul(poolAmountB).mod(supply).isZero()) amountB = amountB.add(new BN(1));

  return {
    amountA,
    amountB,
  };
}
