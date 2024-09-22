'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram, Transaction } from '@solana/web3.js'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"
import BN from 'bn.js'
import { CurveLaunchpad } from "./types/curve_launchpad"
import * as IDL from "./types/curve_launchpad.json"
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { TextInput, Textarea, FileInput, Checkbox, NumberInput, Button, Box, Title, Stack } from '@mantine/core'


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

      if (isFirstBuyer && firstBuyAmount) {
        console.log('First buyer detected, buying tokens')
        const tokenAmount = new BN(Number(firstBuyAmount) * 10 ** 6)
        const maxSolAmount = new BN(Number.MAX_SAFE_INTEGER) // This should be calculated based on your AMM logic
        const buyIx = await program.methods
          .buy(tokenAmount, maxSolAmount)
          .accounts({
            // @ts-ignore
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
      
      console.log('Signing transaction with mint')
      tx.sign(mint)

      console.log('Signing transaction with wallet')
      const signed = await wallet.signTransaction(tx)
      
      console.log('Sending transaction')
      const txSignature = await connection.sendRawTransaction(signed.serialize())
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