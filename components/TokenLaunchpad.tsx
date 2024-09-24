// @ts-nocheck
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {  SystemProgram, ComputeBudgetProgram, Transaction } from '@solana/web3.js'
import { AnchorWallet, useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import {  Program } from '@coral-xyz/anchor'
import { createAssociatedTokenAccountInstruction, createSyncNativeInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { ammProgramId as gobblerAmmProgramId, getAmmConfigAddress as getGobblerAmmConfigAddress, getAuthAddress as getGobblerAuthAddress, getOrcleAccountAddress as getGobblerOrcleAccountAddress, getPoolAddress as getGobblerPoolAddress, getPoolLpMintAddress as getGobblerPoolLpMintAddress, getPoolVaultAddress as getGobblerPoolVaultAddress } from "../components/types/gobbler";
import { CurveLaunchpad } from "./types/curve_launchpad"
import * as IDL from "./types/curve_launchpad.json"
import { CurveLaunchpad as CurveLaunchpad2 } from "./types/curve_launchpad2"
import * as IDL2 from "./types/curve_launchpad2.json"
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { TextInput, Textarea, FileInput, Checkbox, NumberInput, Button, Box, Title, Stack } from '@mantine/core'
import { AMM } from '@/utils/amm'
import { createPoolFee, getAmmConfigAddress, getAuthAddress, getOrcleAccountAddress, getPoolAddress, getPoolLpMintAddress, getPoolVaultAddress } from './types/raydium'

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { Wallet, AnchorProvider } from '@coral-xyz/anchor';
import AmmImpl from  "./ts-client/dist/amm"
import { PROGRAM_ID, SEEDS } from './ts-client/dist/amm/constants';
import {
  getAssociatedTokenAccount,
  derivePoolAddressWithConfig as deriveConstantProductPoolAddressWithConfig,
} from './ts-client/dist/amm/utils'
import fs from 'fs';


type AllocationByPercentage = {
  address: PublicKey;
  percentage: number;
};

type AllocationByAmount = {
  address: PublicKey;
  amount: BN;
};

function fromAllocationsToAmount(lpAmount: BN, allocations: AllocationByPercentage[]): AllocationByAmount[] {
  const sumPercentage = allocations.reduce((partialSum, a) => partialSum + a.percentage, 0);
  if (sumPercentage === 0) {
    throw Error('sumPercentage is zero');
  }

  let amounts: AllocationByAmount[] = [];
  let sum = new BN(0);
  for (let i = 0; i < allocations.length - 1; i++) {
    const amount = lpAmount.mul(new BN(allocations[i].percentage)).div(new BN(sumPercentage));
    sum = sum.add(amount);
    amounts.push({
      address: allocations[i].address,
      amount,
    });
  }
  // the last wallet get remaining amount
  amounts.push({
    address: allocations[allocations.length - 1].address,
    amount: lpAmount.sub(sum),
  });
  return amounts;
}

async function createPoolAndLockLiquidity(
  tokenAMint: PublicKey,
  tokenBMint: PublicKey,
  tokenAAmount: BN,
  tokenBAmount: BN,
  provider: AnchorProvider,
  payerWallet: AnchorWallet,
  program: Program
) {
  const programID = new PublicKey(PROGRAM_ID);
  // 2. Configuration address for the pool. It will decide the fees of the pool.
  const config = new PublicKey('FiENCCbPi3rFh5pW2AJ59HC53yM32eLaCjMKxRqanKFJ');

  const poolPubkey = deriveConstantProductPoolAddressWithConfig(tokenAMint, tokenBMint, config, programID);
  
  // Create the pool
  console.log('create pool %s', poolPubkey);
  let transactions = await AmmImpl.createPermissionlessConstantProductPoolWithConfig(
    provider.connection,
    payerWallet.publicKey,
    tokenAMint,
    tokenBMint,
    
    tokenAAmount,
    tokenBAmount,
    config,
    program,
    {lockLiquidity: true, skipBAta:true, skipAAta: true}
  );

  console.log('transactions', transactions.map(t => t.instructions.map(i => i.programId.toBase58())))
  return transactions
  // Create escrow and lock liquidity
}

/**
 * Example script to create a new pool and lock liquidity to it
 */
export default function CreateToken() {
  const router = useRouter()
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const { publicKey } = useWallet()
  const wallet2 = useWallet()
  const [tokenName, setTokenName] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenDescription, setTokenDescription] = useState('')
  const [tokenImage, setTokenImage] = useState<File | null>(null)
  const [isFirstBuyer, setIsFirstBuyer] = useState(false)
  const [firstBuyAmount, setFirstBuyAmount] = useState('')
  const [firstSolAmount, setFirstSolAmount] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [migrateToGobbler, setMigrateToGobbler] = useState(false)

  const program = wallet ? new Program<CurveLaunchpad>(IDL as any, new AnchorProvider(connection, wallet, {})) : null

  const umi = publicKey ? createUmi(connection.rpcEndpoint)
    .use(irysUploader())
    .use(mplToolbox())
    .use(walletAdapterIdentity(wallet2 as any)) : null

  const handleCreate = useCallback(async () => {
    if (!program || !wallet || !umi) {
      console.error('Missing required dependencies')
      return
    }

    const program2 = new Program<CurveLaunchpad2>(IDL2 as any, new AnchorProvider(connection, wallet, {})) 

    setIsCreating(true)
    try {
      const mint = Keypair.generate()
      console.log('Generated mint keypair:', mint.publicKey.toBase58())

      let imageUri = ''
      if (tokenImage) {
        console.log('Uploading token image')
        const genericFile = {
          buffer: new Uint8Array(await tokenImage.arrayBuffer()),
          fileName: tokenImage.name,
          displayName: tokenImage.name,
          uniqueName: `${Date.now()}-${tokenImage.name}`,
          contentType: tokenImage.type,
          extension: tokenImage.name.split('.').pop() || '',
          tags: []
        }
        const [uploadedUri] = await umi.uploader.upload([genericFile])
        console.log('Image uploaded, URI:', uploadedUri)
        const response = await fetch(uploadedUri)
        imageUri = response.url
        console.log('Image URI:', imageUri)
      }

      const metadata = {
        name: tokenName,
        symbol: tokenSymbol,
        description: tokenDescription + ' ' + 'launched on fomo3d.fun',
        image: imageUri,
      }
      console.log('Prepared metadata:', metadata)

      console.log('Uploading metadata')
      const metadataUri = await umi.uploader.uploadJson(metadata)
      console.log('Metadata uploaded, URI:', metadataUri)
      const metadataResponse = await fetch(metadataUri)
      const tokenUri = metadataResponse.url
      console.log('Token URI:', tokenUri)

      console.log('Preparing create instruction')
      const ix = await program.methods
        .create(tokenName, tokenSymbol, tokenUri)
        .accounts({
          mint: mint.publicKey,
          creator: wallet.publicKey,
          program: program.programId,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        })
        .instruction()
      console.log('Create instruction prepared')

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 666_000 }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: mint.publicKey,
          lamports: 0.007 * 10 ** 9
        }),
        ix,
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          getAssociatedTokenAddressSync(mint.publicKey, wallet.publicKey, true, TOKEN_2022_PROGRAM_ID),
          wallet.publicKey,
          mint.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      )
      const withdrawAuthority = Keypair.generate() 


      if (isFirstBuyer && firstBuyAmount) {
        const tokenAmount = new BN(Number(firstBuyAmount) * 10 ** 6)

        console.log('First buyer detected, buying tokens')
        const maxSolAmount = new BN(Number.MAX_SAFE_INTEGER) // This should be calculated based on your AMM logic
        const buyIx = await program.methods
          .buy(tokenAmount, maxSolAmount)
         
          .accounts({
            hydra: new PublicKey("AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ"),
            user: wallet.publicKey,
            mint: mint.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: program.programId,
          })
          .instruction()
          
          
        tx.add(buyIx)
      }

      console.log('Fetching latest blockhash')
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
      
        tx.sign(mint)


      if (migrateToGobbler) {

      console.log('Preparing create instruction')
      const ix = await program2.methods
        .create(tokenName, tokenSymbol, tokenUri)
        .accounts({
          mint: mint.publicKey,
          creator: wallet.publicKey,
          program: program2.programId,
        })
        .instruction()
      console.log('Create instruction prepared')

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 666_000 }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: mint.publicKey,
          lamports: 0.007 * 10 ** 9
        }),
        ix,
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          getAssociatedTokenAddressSync(mint.publicKey, wallet.publicKey, true),
          wallet.publicKey,
          mint.publicKey,
        )
      )
      const withdrawAuthority = Keypair.generate() 


      if (isFirstBuyer && firstBuyAmount) {
        const tokenAmount = new BN(Number(firstBuyAmount) * 10 ** 6)

        console.log('First buyer detected, buying tokens')
        const maxSolAmount = new BN(Number.MAX_SAFE_INTEGER) // This should be calculated based on your AMM logic
        const buyIx = await program2.methods
          .buy(tokenAmount, maxSolAmount)
         
          .accounts({
            feeRecipient: new PublicKey("AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ"),
            user: wallet.publicKey,
            mint: mint.publicKey,
            program: program2.programId,
          })
          .instruction()
          
          
        tx.add(buyIx)
      }

      console.log('Fetching latest blockhash')
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
      
        tx.sign(mint)


        const txs =  await createPoolAndLockLiquidity(NATIVE_MINT, mint.publicKey, new BN(Number(firstSolAmount) * 10 ** 9), new BN(1_000_000_000_000_000), new AnchorProvider(connection, wallet, {}), wallet, program2 as any);
      // cretae a tx to wrap sol for token
        console.log('Signing transaction with wallet')
        const signed = await wallet.signAllTransactions([tx,...txs])
        
        console.log('Sending transaction')
        for (const signedTx of signed) {    
          const txSignature = await connection.sendRawTransaction(signedTx.serialize())
          const awaited = await connection.confirmTransaction(txSignature, "confirmed")
          console.log('Transaction successful:', awaited)
        }
      
      }
else {
  console.log('Sending transaction')
  const txSignature = await connection.sendRawTransaction(tx.serialize())
  const awaited = await connection.confirmTransaction(txSignature, "confirmed")
  console.log('Transaction successful:', awaited)
}
      router.push(`/${mint.publicKey.toBase58()}`)
    } catch (error) {
      console.error('Error creating token:', error)
    } finally {
      setIsCreating(false)
    }
  }, [program, wallet, umi, connection, router, tokenName, tokenSymbol, tokenDescription, tokenImage, isFirstBuyer, firstBuyAmount])

  return (<Box maw={400} mx="auto" className='flex flex-col items-center justify-center h-screen text-white'>
    <Title order={1} ta="center" mb="xl">Create New Token</Title>
  
      <Stack>
        <TextInput
          label="Token Name"
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
        />
        <TextInput
          label="Token Symbol"
          value={tokenSymbol}
          onChange={(e) => setTokenSymbol(e.target.value)}
        />
        <Textarea
          label="Token Description"
          value={tokenDescription}
          onChange={(e) => setTokenDescription(e.target.value)}
        />
        <FileInput
          label="Token Image"
          placeholder="Choose file"
          accept="image/*"
          onChange={setTokenImage}
        />
        <Checkbox
          label="I want to be the first buyer"
          checked={isFirstBuyer}
          onChange={(e) => setIsFirstBuyer(e.target.checked)}
        />
        <Checkbox
          label="Create Meteora Pool"
          checked={migrateToGobbler}
          onChange={(e) => setMigrateToGobbler(e.target.checked)}
        />
        {migrateToGobbler && (
          <NumberInput
            label="First Sol Amount"
            value={firstSolAmount}
            onChange={(value) => setFirstSolAmount(value?.toString() || '')}
            min={0}
            step={0.1}
          />
        )}
        {isFirstBuyer && (
          <NumberInput
            label="First Buy Amount"
            value={firstBuyAmount}
            onChange={(value) => setFirstBuyAmount(value?.toString() || '')}
            min={0}
            step={0.1}
          />
        )}
        <Button
          onClick={handleCreate}
          loading={isCreating}
          fullWidth
        >
          {isCreating ? 'Creating...' : 'Create Token'}
        </Button>
      </Stack>
    </Box>
  )
}