import { PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
export function findProgramAddress(
  seeds: Buffer[],
  programId: PublicKey
): { publicKey: PublicKey; nonce: number } {
  const [publicKey, nonce] = PublicKey.findProgramAddressSync(seeds, programId);
  return { publicKey, nonce };
}
export function getATAAddress(
  owner: PublicKey,
  mint: PublicKey,
  programId?: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress(
    [owner.toBuffer(), (programId ?? TOKEN_PROGRAM_ID).toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  );
}

const AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed", "utf8");
const AMM_CONFIG_SEED = Buffer.from("amm_config", "utf8");
const POOL_SEED = Buffer.from("pool", "utf8");
const POOL_LP_MINT_SEED = Buffer.from("pool_lp_mint", "utf8");
const POOL_VAULT_SEED = Buffer.from("pool_vault", "utf8");
const OBSERVATION_SEED = Buffer.from("observation", "utf8");

export function getPdaPoolAuthority(programId: PublicKey): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([AUTH_SEED], programId);
}

export function getCpmmPdaAmmConfigId(
  programId: PublicKey,
  index: number,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([AMM_CONFIG_SEED, Buffer.from(u16ToBytes(index))], programId);
}


export function getCpmmPdaPoolId(
  programId: PublicKey,
  ammConfigId: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  creator: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([POOL_SEED, ammConfigId.toBuffer(), mintA.toBuffer(), mintB.toBuffer()], programId);
}

export function getPdaLpMint(
  programId: PublicKey,
  poolId: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([POOL_LP_MINT_SEED, poolId.toBuffer()], programId);
}

export function getPdaVault(
  programId: PublicKey,
  poolId: PublicKey,
  mint: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([POOL_VAULT_SEED, poolId.toBuffer(), mint.toBuffer()], programId);
}

export function getPdaObservationId(
  programId: PublicKey,
  poolId: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([OBSERVATION_SEED, poolId.toBuffer()], programId);
}

function u16ToBytes(num: number): Uint8Array {
  const arr = new ArrayBuffer(2);
  const view = new DataView(arr);
  view.setUint16(0, num, false);
  return new Uint8Array(arr);
}

export function getCreatePoolKeys({
  creator,
  programId,
  mintA,
  mintB,
  configId
}: {
  creator: PublicKey;
  programId: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  configId: PublicKey;
}): {
  poolId: PublicKey;
  authority: PublicKey;
  lpMint: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  observationId: PublicKey;
  configId: PublicKey;
} {
  const authority = getPdaPoolAuthority(programId).publicKey;
  const poolId = getCpmmPdaPoolId(programId, configId, mintA, mintB, creator).publicKey;
  const lpMint = getPdaLpMint(programId, poolId).publicKey;
  const vaultA = getPdaVault(programId, poolId, mintA).publicKey;
  const vaultB = getPdaVault(programId, poolId, mintB).publicKey;
  const observationId = getPdaObservationId(programId, poolId).publicKey;

  return {
    poolId,
    configId,
    authority,
    lpMint,
    vaultA,
    vaultB,
    observationId,
  };
}
