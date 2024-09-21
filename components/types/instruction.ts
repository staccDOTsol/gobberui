// @ts-ignore
import BN from "bn.js";

import { AccountMeta, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SYSTEM_PROGRAM_ID, RENT_PROGRAM_ID, MEMO_PROGRAM_ID2, createLogger } from "tokengobbler";

import { struct, u64 } from "tokengobbler";
import { getPdaVault } from "./pda";
const logger = createLogger("Raydium_cpmm");
const anchorDataBuf = {
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  swapBaseInput: [143, 190, 90, 218, 196, 30, 51, 222],
  swapBaseOutput: [55, 217, 98, 86, 163, 74, 180, 173],
  createAmmConfig: [137, 52, 237, 212, 215, 117, 108, 104],
  initializeMetadata:  [35, 215, 241, 156, 122, 208, 206, 212]
};

export const MAX_NAME_LENGTH = 32;
export const MAX_URI_LENGTH = 200;
export const MAX_SYMBOL_LENGTH = 10;
export const MAX_CREATOR_LEN = 32 + 1 + 1;
export const MAX_CREATOR_LIMIT = 5;

export function makeCreateCpmmPoolInInstruction(
  programId: PublicKey,
  creator: PublicKey,
  configId: PublicKey,
  authority: PublicKey,
  poolId: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  lpMint: PublicKey,
  userVaultA: PublicKey,
  userVaultB: PublicKey,
  userLpAccount: PublicKey,
  vaultA: PublicKey,
  vaultB: PublicKey,

  mintProgramA: PublicKey,
  mintProgramB: PublicKey,
  observationId: PublicKey,

  amountMaxA: BN,
  amountMaxB: BN,
  openTime: BN,
): TransactionInstruction {
  const dataLayout = struct([u64("amountMaxA"), u64("amountMaxB"), u64("openTime")]);
  const keys: Array<AccountMeta> = [
    { pubkey: creator, isSigner: true, isWritable: true },
    { pubkey: configId, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: mintA, isSigner: false, isWritable: false },
    { pubkey: mintB, isSigner: false, isWritable: false },
    { pubkey: lpMint, isSigner: false, isWritable: true },
    { pubkey: userVaultA, isSigner: false, isWritable: true },
    { pubkey: userVaultB, isSigner: false, isWritable: true },
    { pubkey: userLpAccount, isSigner: false, isWritable: true },
    { pubkey: vaultA, isSigner: false, isWritable: true },
    { pubkey: vaultB, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: mintProgramA, isSigner: false, isWritable: false },
    { pubkey: mintProgramB, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: RENT_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: observationId, isSigner: false, isWritable: true },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      amountMaxA,
      amountMaxB,
      openTime,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.initialize, ...data]),
  });
}

export function makeCreateAmmConfig(
  programId: PublicKey,
  owner: PublicKey,
  ammConfigId: PublicKey,
  index: BN,
  token1LpRate: BN,
  token0LpRate: BN,
  token0CreatorRate: BN,
  token1CreatorRate: BN,
): TransactionInstruction {
  const dataLayout = struct([
    u64("index"),
    u64("token1LpRate"),
    u64("token0LpRate"),
    u64("token0CreatorRate"),
    u64("token1CreatorRate"),
  ]);

  const keys: Array<AccountMeta> = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: ammConfigId, isSigner: false, isWritable: true },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      index,
      token1LpRate,
      token0LpRate,
      token0CreatorRate,
      token1CreatorRate,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.createAmmConfig, ...data]),
  });
}

export function makeInitializeMetadata(
  programId: PublicKey,
  creator: PublicKey,
  authority: PublicKey,
  lpMint: PublicKey,
  tokenMetadataProgram: PublicKey,
  metadata: PublicKey,
  systemProgram: PublicKey,
  rent: PublicKey,
  ammConfig: PublicKey,
  poolState: PublicKey,
  observationState: PublicKey,
  name: string,
  symbol: string,
  uri: string,
): TransactionInstruction {
  // Validate and potentially shorten the URI
  if (uri.length > MAX_URI_LENGTH) {
    uri = uri.substring(0, MAX_URI_LENGTH);
  }

  // Validate name and symbol lengths
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Name exceeds maximum length of ${MAX_NAME_LENGTH} characters`);
  }
  if (symbol.length > MAX_SYMBOL_LENGTH) {
    throw new Error(`Symbol exceeds maximum length of ${MAX_SYMBOL_LENGTH} characters`);
  }
  const keys: Array<AccountMeta> = [
    { pubkey: creator, isSigner: true, isWritable: true },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: lpMint, isSigner: false, isWritable: true },
    { pubkey: tokenMetadataProgram, isSigner: false, isWritable: false },
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: systemProgram, isSigner: false, isWritable: false },
    { pubkey: rent, isSigner: false, isWritable: false },
    { pubkey: ammConfig, isSigner: false, isWritable: false },
    { pubkey: observationState, isSigner: false, isWritable: true },
    { pubkey: poolState, isSigner: false, isWritable: true },
  ];

  const nameBuffer = Buffer.from(name);
  const symbolBuffer = Buffer.from(symbol);
  const uriBuffer = Buffer.from(uri);

  const bufferSize = 4 + nameBuffer.length + 4 + symbolBuffer.length + 4 + uriBuffer.length;
  const data = Buffer.alloc(bufferSize);

  let offset = 0;
  data.writeUInt32LE(nameBuffer.length, offset);
  offset += 4;
  nameBuffer.copy(data, offset);
  offset += nameBuffer.length;

  data.writeUInt32LE(symbolBuffer.length, offset);
  offset += 4;
  symbolBuffer.copy(data, offset);
  offset += symbolBuffer.length;

  data.writeUInt32LE(uriBuffer.length, offset);
  offset += 4;
  uriBuffer.copy(data, offset);

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.concat([Buffer.from(anchorDataBuf.initializeMetadata), data]),
  });
}

export function makeDepositCpmmInInstruction(
  programId: PublicKey,
  owner: PublicKey,
  authority: PublicKey,
  poolId: PublicKey,
  userLpAccount: PublicKey,
  userVaultA: PublicKey,
  userVaultB: PublicKey,
  vaultA: PublicKey,
  vaultB: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  lpMint: PublicKey,

  lpAmount: BN,
  amountMaxA: BN,
  amountMaxB: BN,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey
): TransactionInstruction {
  const dataLayout = struct([u64("lpAmount"), u64("amountMaxA"), u64("amountMaxB")]);

  const keys: Array<AccountMeta> = [
    { pubkey: owner, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(lpMint, owner, true, TOKEN_PROGRAM_ID), isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(mintA, owner, true, tokenProgramA), isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(mintB, owner, true, tokenProgramB), isSigner: false, isWritable: true },
    { pubkey: getPdaVault(programId, poolId, mintA).publicKey, isSigner: false, isWritable: true },
    { pubkey: getPdaVault(programId, poolId, mintB).publicKey, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: mintA, isSigner: false, isWritable: false },
    { pubkey: mintB, isSigner: false, isWritable: false },
    { pubkey: lpMint, isSigner: false, isWritable: true },
  ];

  const data = Buffer.alloc(dataLayout.span);
  logger.debug("cpmm deposit data", {
    lpAmount: lpAmount.toString(),
    amountMaxA: amountMaxA.toString(),
    amountMaxB: amountMaxB.toString(),
  });
  dataLayout.encode(
    {
      lpAmount,
      amountMaxA,
      amountMaxB,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.deposit, ...data]),
  });
}

export function makeWithdrawCpmmInInstruction(
  programId: PublicKey,
  owner: PublicKey,
  authority: PublicKey,
  poolId: PublicKey,
  userLpAccount: PublicKey,
  userVaultA: PublicKey,
  userVaultB: PublicKey,
  vaultA: PublicKey,
  vaultB: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  lpMint: PublicKey,

  lpAmount: BN,
  amountMinA: BN,
  amountMinB: BN,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey
): TransactionInstruction {
  const dataLayout = struct([u64("lpAmount"), u64("amountMinA"), u64("amountMinB")]);

  const keys: Array<AccountMeta> = [
    { pubkey: owner, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(lpMint, owner), isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(mintA, owner, true, tokenProgramA), isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(mintB, owner, true, tokenProgramB), isSigner: false, isWritable: true },
    { pubkey: getPdaVault(programId, poolId, mintA).publicKey, isSigner: false, isWritable: true },
    { pubkey: getPdaVault(programId, poolId, mintB ).publicKey, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: mintA, isSigner: false, isWritable: false },
    { pubkey: mintB, isSigner: false, isWritable: false },
    { pubkey: lpMint, isSigner: false, isWritable: true },
    { pubkey: MEMO_PROGRAM_ID2, isSigner: false, isWritable: false },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      lpAmount,
      amountMinA,
      amountMinB,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.withdraw, ...data]),
  });
}

export function makeSwapCpmmBaseInInInstruction(
  programId: PublicKey,
  payer: PublicKey,
  authority: PublicKey,
  configId: PublicKey,
  poolId: PublicKey,
  userInputAccount: PublicKey,
  userOutputAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  observationId: PublicKey,

  amountIn: BN,
  amounOutMin: BN,
): TransactionInstruction {
  const dataLayout = struct([u64("amountIn"), u64("amounOutMin")]);

  const keys: Array<AccountMeta> = [
    { pubkey: payer, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: configId, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(inputMint, payer, false, inputTokenProgram), isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(outputMint, payer, false, outputTokenProgram), isSigner: false, isWritable: true },
    { pubkey: getPdaVault(programId, poolId, inputMint).publicKey, isSigner: false, isWritable: true },
    { pubkey: getPdaVault(programId, poolId, outputMint).publicKey, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationId, isSigner: false, isWritable: true },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      amountIn,
      amounOutMin,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.swapBaseInput, ...data]),
  });
}
export function makeSwapCpmmBaseOutInInstruction(
  programId: PublicKey,
  payer: PublicKey,
  authority: PublicKey,
  configId: PublicKey,
  poolId: PublicKey,
  userInputAccount: PublicKey,
  userOutputAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  observationId: PublicKey,

  amountInMax: BN,
  amountOut: BN,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey
): TransactionInstruction {
  const dataLayout = struct([u64("amountInMax"), u64("amountOut")]);

  const keys: Array<AccountMeta> = [
    { pubkey: payer, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: configId, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(inputMint, payer, true, tokenProgramA), isSigner: false, isWritable: true },
    { pubkey: getAssociatedTokenAddressSync(outputMint, payer, true, tokenProgramB), isSigner: false, isWritable: true },
    { pubkey: getPdaVault(programId, poolId, inputMint).publicKey, isSigner: false, isWritable: true },
    { pubkey: getPdaVault(programId, poolId, outputMint).publicKey, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationId, isSigner: false, isWritable: true },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      amountInMax,
      amountOut,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.swapBaseOutput, ...data]),
  });
}
