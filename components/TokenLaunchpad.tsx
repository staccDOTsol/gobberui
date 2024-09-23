'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram, Transaction } from '@solana/web3.js'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { createAssociatedTokenAccountInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import BN from 'bn.js'
import { ammProgramId as gobblerAmmProgramId, getAmmConfigAddress as getGobblerAmmConfigAddress, getAuthAddress as getGobblerAuthAddress, getOrcleAccountAddress as getGobblerOrcleAccountAddress, getPoolAddress as getGobblerPoolAddress, getPoolLpMintAddress as getGobblerPoolLpMintAddress, getPoolVaultAddress as getGobblerPoolVaultAddress } from "../components/types/gobbler";
import { CurveLaunchpad } from "./types/curve_launchpad"
import * as IDL from "./types/curve_launchpad.json"
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { TextInput, Textarea, FileInput, Checkbox, NumberInput, Button, Box, Title, Stack } from '@mantine/core'
import { AMM } from '@/utils/amm'
import { createPoolFee, getAmmConfigAddress, getAuthAddress, getOrcleAccountAddress, getPoolAddress, getPoolLpMintAddress, getPoolVaultAddress } from './types/raydium'


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
        description: tokenDescription,
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
     

      console.log('Signing transaction with wallet')
      const signed = await wallet.signTransaction(tx)
      
      console.log('Sending transaction')
      const txSignature = await connection.sendRawTransaction(signed.serialize())
      const awaited = await connection.confirmTransaction(txSignature, "finalized")

      if (migrateToGobbler) {

        const tx = new Transaction()
        console.log('Migrating to Gobbler')



const DEFAULT_DECIMALS = 6n;
const DEFAULT_TOKEN_BALANCE =
  1_000_000_000n * BigInt(10 ** Number(DEFAULT_DECIMALS));
const DEFAULT_INITIAL_TOKEN_RESERVES = 793_100_000_000_000n;
const DEFAULT_INITIAL_VIRTUAL_SOL_RESERVE = 30_000_000_000n;
const DEFUALT_INITIAL_VIRTUAL_TOKEN_RESERVE = 1_073_000_000_000_000n;
const DEFAULT_FEE_BASIS_POINTS = 50n;

async function getAmmFromBondingCurve(mint: PublicKey) {
  const bondingCurvePDA = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve"), mint.toBuffer()],
      new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9")
  )[0];
  
  let bondingCurveAccount = await program?.account.bondingCurve.fetch(
      bondingCurvePDA, 'confirmed'
  );
  
  // console.log(`Price:`, bondingCurveAccount.virtualSolReserves.div(bondingCurveAccount.virtualTokenReserves).toNumber());
  
  return new AMM(
      BigInt(bondingCurveAccount?.virtualSolReserves.toString() || "0"  ),
      BigInt(bondingCurveAccount?.virtualTokenReserves.toString() || "0"),
      BigInt(bondingCurveAccount?.realSolReserves.toString() || "0"),
      BigInt(bondingCurveAccount?.realTokenReserves.toString() || "0"),
      BigInt(DEFUALT_INITIAL_VIRTUAL_TOKEN_RESERVE.toString()),
  );
  };
        const amm =await getAmmFromBondingCurve(mint.publicKey);
        const tokenAmount = new BN(Number(firstBuyAmount) * 10 ** 6)

        const toBuy = amm.getBuyPrice(BigInt(tokenAmount.toString()))
        console.log("toBuy", toBuy)
const ammProgramId = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")
const ammConfig = getAmmConfigAddress(0, ammProgramId)[0];

const wsolMint = NATIVE_MINT;
const tokenMint = mint.publicKey;

const creatorTokenAccount = getAssociatedTokenAddressSync(tokenMint, withdrawAuthority.publicKey, true, TOKEN_2022_PROGRAM_ID);
const poolState = getPoolAddress(ammConfig, wsolMint, tokenMint, ammProgramId)[0];
const ammAuthority = getAuthAddress(ammProgramId)[0];
const token0Vault = getPoolVaultAddress(poolState, wsolMint, ammProgramId)[0];
const token1Vault = getPoolVaultAddress(poolState, tokenMint, ammProgramId)[0];
const observationState = getOrcleAccountAddress(poolState, ammProgramId)[0];
const lpMint = getPoolLpMintAddress(poolState, ammProgramId)[0];
const creatorLpToken = getAssociatedTokenAddressSync(lpMint, withdrawAuthority.publicKey);
        const migrateIx = await program.methods
          .migrate(true, new BN(tokenAmount.toNumber()))
          .accounts({

            creator: withdrawAuthority.publicKey,
            ammConfig,
            authority: ammAuthority,
            poolState,
            tokenMint,
            createPoolFee: createPoolFee, // You might want to make this configurable
            token0Vault,
            token1Vault,
            hydra: new PublicKey("AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ"),
            lpMint,
            creatorTokenAccount,
            creatorLpToken,
            tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
            metadata: PublicKey.findProgramAddressSync(
              [
                Buffer.from("metadata"),
                new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
                lpMint.toBuffer()
              ],
              new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
            )[0],
            observationState,
            cpSwapProgram: ammProgramId,
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenProgram2022: TOKEN_2022_PROGRAM_ID,
          })
          .instruction()

          
          tx.add(SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: withdrawAuthority.publicKey,
            lamports:292520880+29252880+29252880+ 29252880+0.03 * 10 ** 9 + Number(toBuy.toString())
          }))
          tx.add(createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            getAssociatedTokenAddressSync(mint.publicKey, withdrawAuthority.publicKey, true, TOKEN_2022_PROGRAM_ID),
            withdrawAuthority.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID
          ))
          tx.add(createTransferCheckedInstruction(
            getAssociatedTokenAddressSync(mint.publicKey, wallet.publicKey, true, TOKEN_2022_PROGRAM_ID),
            mint.publicKey,
            getAssociatedTokenAddressSync(mint.publicKey, withdrawAuthority.publicKey, true, TOKEN_2022_PROGRAM_ID),
            wallet.publicKey,
            Number(tokenAmount.toString()),
            Number(DEFAULT_DECIMALS),[],
            TOKEN_2022_PROGRAM_ID
          ))
        tx.add(migrateIx)
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        tx.feePayer = wallet.publicKey
        tx.sign(withdrawAuthority, mint)
        const signed = await wallet.signTransaction(tx)
        console.log('Sending transaction')
        const txSignature = await connection.sendRawTransaction(signed.serialize())
        console.log('Transaction successful:', txSignature)
      }
      console.log('Transaction successful:', txSignature)

      router.push(`/${mint.publicKey.toBase58()}`)
    } catch (error) {
      console.error('Error creating token:', error)
    } finally {
      setIsCreating(false)
    }
  }, [program, wallet, umi, connection, router, tokenName, tokenSymbol, tokenDescription, tokenImage, isFirstBuyer, firstBuyAmount])

  return (<Box maw={400} mx="auto">
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
          label="Migrate to Gobbler"
          checked={migrateToGobbler}
          onChange={(e) => setMigrateToGobbler(e.target.checked)}
        />
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