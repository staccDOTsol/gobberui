// @ts-nocheck
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SystemProgram, ComputeBudgetProgram, Transaction, Connection, PublicKey, Keypair, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { AnchorWallet, useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { FaTwitter, FaTelegram, FaDiscord, FaGithub } from 'react-icons/fa'

import {
  createAssociatedTokenAccountInstruction,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync
} from '@solana/spl-token'
import {
  Input,
  Textarea,
  Checkbox,
  NumberInput,
  Button,
  Box,
  Heading,
  VStack,
  Text,
  HStack,
  FormControl,
  FormLabel,
  Stack,
  useToast,
  Icon,
  Flex,
  CheckboxGroup,
  NumberInputField
} from '@chakra-ui/react'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import {
  CREATE_CPMM_POOL_PROGRAM,
  getCreatePoolKeys,
  makeCreateAmmConfig,
  makeCreateCpmmPoolInInstruction,
  makeInitializeMetadata
} from 'tokengobbler'

import {
  ApiV3Token,
  CREATE_CPMM_POOL_FEE_ACC,
  getCreatePoolKeys as getRaydiumPoolKeys,
  makeCreateCpmmPoolInInstruction as makeRaydiumCreateCpmmPoolInInstruction,
  TokenInfo
} from '@raydium-io/raydium-sdk-v2'
import { METADATA_PROGRAM_ID, CREATE_CPMM_POOL_PROGRAM as cpmm } from '@raydium-io/raydium-sdk-v2'
import AmmImpl from 'components/ts-client/dist/esm'
import PanelCard from '@/components/PanelCard'
import SelectPoolTokenAndFee from '../ClmmPool/components/SelectPoolTokenAndFee'
import TokenInput from '@/components/TokenInput'
import AddLiquidityPlus from '@/icons/misc/AddLiquidityPlus'
import { Select } from '@/components/Select'
import { tokenAmount } from '@metaplex-foundation/umi'

async function shortenUrl(url: string): Promise<string> {
  try {
    const response = await fetch(`http://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`)
    return await response.text()
  } catch (error) {
    console.error('Error shortening URL:', error)
    return url.substring(0, 200)
  }
}
const PROGRAM_IDS = ['65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9', 'Ei1CgRq6SMB8wQScEKeRMGYkyb3YmRTaej1hpHcqAV9r']

export default function CreateToken() {
  const router = useRouter()
  const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW')
  const wallet = useAnchorWallet()
  const { publicKey } = useWallet()
  const walletAdapter = useWallet()

  const [tokenName, setTokenName] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenDescription, setTokenDescription] = useState('')
  const [tokenImage, setTokenImage] = useState<File | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [poolTypes, setPoolTypes] = useState({
    vanilla: true,
    gobbler: false,
    raydium: false,
    meteora: false
  })
  const toast = useToast()
  const [website, setWebsite] = useState('')
  const [telegramHandle, setTelegramHandle] = useState('')
  const [discordHandle, setDiscordHandle] = useState('')
  const [githubHandle, setGithubHandle] = useState('')
  const [twitterHandle, setTwitterHandle] = useState('')
  const [programs, setPrograms] = useState<{ [key: string]: Program<any> }>({})
  const createGobblerPools = async (
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    baseTokenInfo: TokenInfo,
    quoteTokenInfo: TokenInfo,
    tokenAAmount: BN,
    tokenBAmount: BN,
    provider: AnchorProvider,
    payerWallet: AnchorWallet,
    program: Program
  ) => {
    const poolImage = tokenImage
    const poolName = tokenName
    const poolSymbol = tokenSymbol
    const poolDescription = tokenDescription
    if (!wallet) {
      toast({
        title: 'Error',
        description: 'Please connect your wallet',
        status: 'error',
        duration: 5000,
        isClosable: true
      })
      return
    }
    if (!umi) {
      toast({
        title: 'Error',
        description: 'Please connect your wallet',
        status: 'error',
        duration: 5000,
        isClosable: true
      })
      return
    }

    if (!poolImage || !wallet.publicKey) {
      toast({
        title: 'Error',
        description: 'Please upload a pool image and connect your wallet',
        status: 'error',
        duration: 5000,
        isClosable: true
      })
      return
    }

    try {
      toast({
        title: 'Processing',
        description: 'Creating your memecoin...',
        status: 'info',
        duration: null,
        isClosable: false
      })

      const genericFile = {
        buffer: new Uint8Array(await poolImage.arrayBuffer()),
        fileName: poolImage.name,
        displayName: poolImage.name,
        uniqueName: `${Date.now()}-${poolImage.name}`,
        contentType: poolImage.type,
        extension: poolImage.name.split('.').pop() || '',
        tags: []
      }
      const [imageUri] = await umi.uploader.upload([genericFile])

      const metadata = {
        name: poolName,
        symbol: poolSymbol,
        description: poolDescription,
        seller_fee_basis_points: 500,
        image: imageUri,
        external_url: website,
        attributes: [],
        properties: {
          files: [
            {
              uri: imageUri,
              type: poolImage.type
            }
          ],
          category: 'image'
        },
        extensions: {
          website: website,
          telegram: telegramHandle,
          discord: discordHandle,
          github: githubHandle,
          twitter: twitterHandle
        }
      }

      if (poolImage.type.startsWith('video/')) {
        metadata.properties.category = 'video'
        // @ts-ignore
        metadata.animation_url = imageUri

        const video = document.createElement('video')
        video.src = URL.createObjectURL(poolImage)
        video.load()

        await new Promise<void>((resolve) => {
          video.onloadeddata = () => {
            video.currentTime = 1

            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight

            const ctx = canvas.getContext('2d')
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)

            const snapshotImageUri = canvas.toDataURL('image/jpeg')

            metadata.properties.files.push({
              uri: snapshotImageUri,
              type: 'image/jpeg'
            })
            resolve()
          }
        })
      } else if (poolImage.type.startsWith('audio/')) {
        metadata.properties.category = 'audio'
        // @ts-ignore
        metadata.animation_url = imageUri
      }

      const uri = await umi.uploader.uploadJson(metadata)

      const payer = wallet.publicKey
      const isFront = new BN(tokenAMint.toBuffer()).lte(new BN(tokenBMint.toBuffer()))

      const [mintA, mintB] = isFront ? [tokenAMint, tokenBMint] : [tokenBMint, tokenAMint]
      const [tokenAInfo, tokenBInfo] = isFront ? [baseTokenInfo, quoteTokenInfo] : [quoteTokenInfo, baseTokenInfo]
      const [mintAAmount, mintBAmount] = isFront ? [tokenAAmount, tokenBAmount] : [tokenBAmount, tokenAAmount]

      const [mintAPubkey, mintBPubkey] = [mintA, mintB]

      const configId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      const [ammConfigKey, _bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('amm_config'), new BN(configId).toArrayLike(Buffer, 'be', 8)],
        CREATE_CPMM_POOL_PROGRAM
      )
      const poolKeys = getCreatePoolKeys({
        creator: wallet.publicKey,
        programId: CREATE_CPMM_POOL_PROGRAM,
        mintA: mintAPubkey,
        mintB: mintBPubkey,
        configId: ammConfigKey
      })
      poolKeys.configId = ammConfigKey

      const startTimeValue = Math.floor(Date.now() / 1000)
      console.log(mintAAmount, mintBAmount)

      const instructions = [
        makeCreateAmmConfig(
          CREATE_CPMM_POOL_PROGRAM,
          wallet.publicKey,
          ammConfigKey,
          new BN(configId),
          new BN(6666), // token1LpRate
          new BN(6666), // token0LpRate
          new BN(6666), // token0CreatorRate
          new BN(6666) // token1CreatorRate
        ),
        makeCreateCpmmPoolInInstruction(
          CREATE_CPMM_POOL_PROGRAM,
          wallet.publicKey,
          ammConfigKey,
          poolKeys.authority,
          poolKeys.poolId,
          new PublicKey(tokenAInfo?.address as string),
          new PublicKey(tokenBInfo?.address as string),
          poolKeys.lpMint,
          getAssociatedTokenAddressSync(
            new PublicKey(tokenAInfo?.address as string),
            wallet.publicKey,
            true,
            new PublicKey(tokenAInfo?.programId as string)
          ),
          getAssociatedTokenAddressSync(
            new PublicKey(tokenBInfo?.address as string),
            wallet.publicKey,
            true,
            new PublicKey(tokenBInfo?.programId as string)
          ),
          getAssociatedTokenAddressSync(poolKeys.lpMint, wallet.publicKey, true, TOKEN_PROGRAM_ID),
          poolKeys.vaultA,
          poolKeys.vaultB,
          new PublicKey(tokenAInfo?.programId as string),
          new PublicKey(tokenBInfo?.programId as string),
          poolKeys.observationId,
          mintAAmount,
          mintBAmount,
          new BN(startTimeValue)
        ),
        makeInitializeMetadata(
          CREATE_CPMM_POOL_PROGRAM,
          wallet.publicKey,
          poolKeys.authority,
          poolKeys.lpMint,
          METADATA_PROGRAM_ID,
          PublicKey.findProgramAddressSync(
            [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), poolKeys.lpMint.toBuffer()],
            METADATA_PROGRAM_ID
          )[0],
          SystemProgram.programId,
          SYSVAR_RENT_PUBKEY,
          ammConfigKey,
          poolKeys.poolId,
          poolKeys.observationId,
          poolName,
          poolSymbol,
          await shortenUrl(uri)
        )
      ]
      instructions[1].keys.push({
        pubkey: wallet.publicKey,
        isSigner: false,
        isWritable: true
      })

      const transaction = new Transaction().add(...instructions).add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 }))
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = wallet.publicKey

      return [transaction]
    } catch (error) {
      console.error('Error creating pool:', error)
      toast({
        title: 'Error',
        description: 'Failed to create pool. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true
      })
    }
  }
  useEffect(() => {
    if (!wallet) return

    const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions())

    async function getProgram(programId: string): Promise<Program<any>> {
      try {
        const idl = await Program.fetchIdl(new PublicKey(programId), provider)
        if (!idl) {
          throw new Error('Failed to fetch IDL')
        }
        return new Program(idl, provider)
      } catch (error) {
        console.error('Error fetching IDL:', error)
        throw error
      }
    }

    async function fetchPrograms() {
      const programFetchPromises = PROGRAM_IDS.map((programId) => getProgram(programId))
      const fetchedPrograms = await Promise.all(programFetchPromises)
      const programsObject = PROGRAM_IDS.reduce((acc: { [key: string]: Program<any> }, programId: string, index: number) => {
        acc[programId] = fetchedPrograms[index]
        return acc
      }, {})
      setPrograms(programsObject)
    }

    fetchPrograms()
  }, [wallet, connection])

  // Helper functions
  function getFirstKey(a: PublicKey, b: PublicKey): Buffer {
    return Buffer.compare(a.toBuffer(), b.toBuffer()) < 0 ? a.toBuffer() : b.toBuffer()
  }

  function getSecondKey(a: PublicKey, b: PublicKey): Buffer {
    return Buffer.compare(a.toBuffer(), b.toBuffer()) < 0 ? b.toBuffer() : a.toBuffer()
  }

  type AllocationByPercentage = {
    address: PublicKey
    percentage: number
  }

  type AllocationByAmount = {
    address: PublicKey
    amount: BN
  }

  function fromAllocationsToAmount(lpAmount: BN, allocations: AllocationByPercentage[]): AllocationByAmount[] {
    const sumPercentage = allocations.reduce((partialSum, a) => partialSum + a.percentage, 0)
    if (sumPercentage === 0) {
      throw Error('sumPercentage is zero')
    }

    let amounts: AllocationByAmount[] = []
    let sum = new BN(0)
    for (let i = 0; i < allocations.length - 1; i++) {
      const amount = lpAmount.mul(new BN(allocations[i].percentage)).div(new BN(sumPercentage))
      sum = sum.add(amount)
      amounts.push({
        address: allocations[i].address,
        amount
      })
    }
    // the last wallet gets remaining amount
    amounts.push({
      address: allocations[allocations.length - 1].address,
      amount: lpAmount.sub(sum)
    })
    return amounts
  }

  async function createRaydiumPools(
    mintA: PublicKey,
    mintB: PublicKey,
    baseTokenInfo: TokenInfo,
    quoteTokenInfo: TokenInfo,
    tokenAAmount: BN,
    tokenBAmount: BN,
    provider: AnchorProvider,
    wallet: AnchorWallet,
    program: Program
  ) {
    const programID = cpmm

    const isFront = new BN(mintA.toBuffer()).lte(new BN(mintB.toBuffer()))

    const [tokenAMint, tokenBMint] = isFront ? [mintA, mintB] : [mintB, mintA]
    const [tokenAInfo, tokenBInfo] = isFront ? [baseTokenInfo, quoteTokenInfo] : [quoteTokenInfo, baseTokenInfo]
    const [mintAAmount, mintBAmount] = isFront ? [tokenAAmount, tokenBAmount] : [tokenBAmount, tokenAAmount]

    const [mintAPubkey, mintBPubkey] = [mintA, mintB]

    // Generate a unique config ID for the pool
    const configId = Math.floor(0)
    const ammConfigKey = new PublicKey('D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2')
    // Get pool keys using the Raydium SDK function
    const poolKeys = getRaydiumPoolKeys({
      programId: programID,
      mintA: tokenAInfo.address ? new PublicKey(tokenAInfo.address) : NATIVE_MINT,
      mintB: tokenBInfo.address ? new PublicKey(tokenBInfo.address) : NATIVE_MINT,
      configId: ammConfigKey
    })

    const startTimeValue = Math.floor(Date.now() / 1000)

    // Prepare instructions for creating the pool
    const instructions = [
      makeRaydiumCreateCpmmPoolInInstruction(
        programID,
        wallet.publicKey,
        ammConfigKey,
        poolKeys.authority,
        poolKeys.poolId,
        tokenAMint,
        tokenBMint,
        poolKeys.lpMint,
        getAssociatedTokenAddressSync(tokenAMint, wallet.publicKey, true, new PublicKey(tokenAInfo?.programId as string)),
        getAssociatedTokenAddressSync(tokenBMint, wallet.publicKey, true, new PublicKey(tokenBInfo?.programId as string)),
        getAssociatedTokenAddressSync(poolKeys.lpMint, wallet.publicKey, true, TOKEN_PROGRAM_ID),
        poolKeys.vaultA,
        poolKeys.vaultB,
        CREATE_CPMM_POOL_FEE_ACC, // createPoolFeeAccount
        new PublicKey(tokenAInfo?.programId as string),
        new PublicKey(tokenBInfo?.programId as string),
        poolKeys.observationId,
        tokenAAmount,
        tokenBAmount,
        new BN(startTimeValue)
      )
    ]

    // Create and configure the transaction
    const transaction = new Transaction().add(...instructions).add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 }))
    const { blockhash } = await provider.connection.getLatestBlockhash()
    transaction.recentBlockhash = blockhash
    transaction.feePayer = wallet.publicKey

    return [transaction]
  }

  // **createRaydiumPools function**
  async function createMeteoraPools(
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    tokenAInfo: TokenInfo,
    tokenBInfo: TokenInfo,
    tokenAAmount: BN,
    tokenBAmount: BN,
    provider: AnchorProvider,
    payerWallet: AnchorWallet,
    program: Program
  ) {
    const programID = cpmm
    // Configuration address for the pool. It will decide the fees of the pool.
    const config = new PublicKey('FiENCCbPi3rFh5pW2AJ59HC53yM32eLaCjMKxRqanKFJ')

    const poolPubkey = derivePoolAddressWithConfig(tokenAMint, tokenBMint, config, programID)

    // Create the pool
    console.log('Create pool %s', poolPubkey.toBase58())
    let transactions = await AmmImpl.createPermissionlessConstantProductPoolWithConfig(
      // @ts-ignore
      provider.connection,
      payerWallet.publicKey,
      tokenAMint,
      tokenBMint,
      tokenAAmount,
      tokenBAmount,

      config,
      program,
      { lockLiquidity: true, skipBAta: true, skipAAta: true }
    )

    console.log(
      'Transactions',
      transactions.map((t) => t.instructions.map((i) => i.programId.toBase58()))
    )
    if (!wallet) {
      console.error('Missing required dependencies')
      return
    }
    for (const tx of transactions) {
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
    }
    return transactions
  }
  function derivePoolAddressWithConfig(tokenA: PublicKey, tokenB: PublicKey, config: PublicKey, programId: PublicKey) {
    const [poolPubkey] = PublicKey.findProgramAddressSync(
      [getFirstKey(tokenA, tokenB), getSecondKey(tokenA, tokenB), config.toBuffer()],
      programId
    )

    return poolPubkey
  }

  const umi = publicKey
    ? createUmi(connection.rpcEndpoint)
        .use(irysUploader())
        .use(mplToolbox())
        .use(walletAdapterIdentity(walletAdapter as any))
    : null

  const handleCreate = useCallback(async () => {
    if (!wallet || !umi || Object.keys(programs).length === 0) {
      console.error('Missing required dependencies')
      return
    }

    const provider = new AnchorProvider(connection, wallet, {})
    const program = programs[PROGRAM_IDS[0]] // Use the appropriate program
    const program2 = programs[PROGRAM_IDS[1]] // Use the second program if needed

    setIsCreating(true)
    try {
      const mint = Keypair.generate()
      setBaseTokenInfo({
        address: mint.publicKey.toBase58(),
        name: tokenName ? tokenName : 'Memecoin',
        symbol: tokenSymbol ? tokenSymbol : 'MEME',
        decimals: 6,
        programId: TOKEN_2022_PROGRAM_ID.toBase58(),
        chainId: 101,
        logoURI: '',
        tags: [],
        extensions: {},
        priority: 1000
      })
      const baseTokenInfo = {
        address: mint.publicKey.toBase58(),
        name: tokenName ? tokenName : 'Memecoin',
        symbol: tokenSymbol ? tokenSymbol : 'MEME',
        decimals: 6,
        programId: TOKEN_2022_PROGRAM_ID.toBase58(),
        chainId: 101,
        logoURI: '',
        tags: [],
        extensions: {},
        priority: 1000
      }
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
        image: imageUri
      }
      console.log('Prepared metadata:', metadata)

      console.log('Uploading metadata')
      const metadataUri = await umi.uploader.uploadJson(metadata)
      console.log('Metadata uploaded, URI:', metadataUri)
      const metadataResponse = await fetch(metadataUri)
      const tokenUri = metadataResponse.url
      console.log('Token URI:', tokenUri)

      console.log('Preparing create instruction')
      // @ts-ignore
      const ix = await program.methods

        .create(tokenName, tokenSymbol, tokenUri)
        .accounts({
          mint: mint.publicKey,
          creator: wallet.publicKey,
          program: program.programId,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID
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
      if (poolTypes.vanilla) {
        const bAmount = new BN(Number(tokenAmount.base) * 10 ** 6)
        console.log('Creating vanilla pool')
        // @ts-ignore
        const buyIx = await program.methods
          // @ts-ignore
          .buy(bAmount, new BN(Number.MAX_SAFE_INTEGER))
          .accounts({
            hydra: new PublicKey('AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ'), // Replace with actual public key
            user: wallet.publicKey,
            mint: mint.publicKey,
            feeRecipient: new PublicKey('AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ'),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: program.programId
          })
          .instruction()
        tx.add(buyIx)
      }

      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 333333 }))
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
      tx.sign(mint)
      let transactions = [tx]

      if (poolTypes.gobbler) {
        console.log('Creating Gobbler pool')
        const gobblerTxs = await createGobblerPools(
          baseTokenInfo?.address ? new PublicKey(baseTokenInfo.address) : NATIVE_MINT,
          quoteTokenInfo?.address ? new PublicKey(quoteTokenInfo.address) : NATIVE_MINT,
          // @ts-ignore
          baseTokenInfo,

          // @ts-ignore
          quoteTokenInfo,
          new BN(Number(tokenAmount.base) * 10 ** 6).div(new BN(Object.values(poolTypes).filter(Boolean).length - 1)),
          new BN(Number(tokenAmount.quote) * 10 ** (quoteTokenInfo?.decimals || 0)).div(
            new BN(Object.values(poolTypes).filter(Boolean).length - 1)
          ),
          provider,
          wallet,
          program as any
        )
        if (gobblerTxs) {
          transactions = [...transactions, ...gobblerTxs]
        }
      }

      if (poolTypes.raydium) {
        console.log('Creating Raydium pool')
        const raydiumTxs = await createRaydiumPools(
          baseTokenInfo?.address ? new PublicKey(baseTokenInfo.address) : NATIVE_MINT,
          quoteTokenInfo?.address ? new PublicKey(quoteTokenInfo.address) : NATIVE_MINT,
          // @ts-ignore
          baseTokenInfo,
          // @ts-ignore
          quoteTokenInfo,
          new BN(Number(tokenAmount.base) * 10 ** 6).div(new BN(Object.values(poolTypes).filter(Boolean).length)),
          new BN(Number(tokenAmount.quote) * 10 ** (quoteTokenInfo?.decimals || 0)).div(
            new BN(Object.values(poolTypes).filter(Boolean).length - 1)
          ),
          provider,
          wallet,
          program as any
        )
        if (raydiumTxs) {
          // @ts-ignore
          transactions = [...transactions, ...raydiumTxs]
        }
      }

      if (poolTypes.meteora) {
        console.log('Creating Meteora pool')
        const meteoraTxs = await createMeteoraPools(
          baseTokenInfo?.address ? new PublicKey(baseTokenInfo.address) : NATIVE_MINT,
          quoteTokenInfo?.address ? new PublicKey(quoteTokenInfo.address) : NATIVE_MINT,
          // @ts-ignore
          baseTokenInfo,
          // @ts-ignore
          quoteTokenInfo,
          new BN(Number(tokenAmount.base) * 10 ** 6).div(new BN(Object.values(poolTypes).filter(Boolean).length)),
          new BN(Number(tokenAmount.quote) * 10 ** (quoteTokenInfo?.decimals || 0)).div(
            new BN(Object.values(poolTypes).filter(Boolean).length - 1)
          ),
          provider,
          wallet,
          program2 as any
        )
        if (meteoraTxs) {
          // @ts-ignore
          transactions = [...transactions, ...meteoraTxs]
        }
      }
      console.log('Signing transactions with wallet')
      const signed = await wallet.signAllTransactions(transactions)

      console.log('Sending transactions')
      for (const signedTx of signed) {
        const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true,
          maxRetries: 2
        })
        const awaited = await connection.confirmTransaction(txSignature, 'recent')
        console.log('Transaction successful:', txSignature)
      }

      router.push(`/${mint.publicKey.toBase58()}`)
    } catch (error) {
      console.error('Error creating token:', error)
    } finally {
      setIsCreating(false)
    }
  }, [wallet, umi, connection, router, tokenName, tokenSymbol, tokenDescription, tokenImage, poolTypes, programs])
  const handleSelectToken = (token: TokenInfo, type: 'input' | 'output') => {
    if (type === 'input') {
    } else {
      setQuoteTokenInfo(token)
    }
  }
  const [baseTokenInfo, setBaseTokenInfo] = useState<TokenInfo | null>(null)
  const [quoteTokenInfo, setQuoteTokenInfo] = useState<TokenInfo | null>(null)
  const [tokenAmount, setTokenAmount] = useState<{ base: string; quote: string }>({ base: '', quote: '' })
  const [step, setStep] = useState(1)

  return (
    <Box minH="100vh" bg="black" p={8} color="#39FF14">
      <Text fontSize="4xl" fontWeight="bold" mb={6} className="animate-pulse">
        Launch Your Memecoin 🚀
      </Text>
      <Text fontSize="xl" mb={6}>
        Gobbler Pool creators get half the swap fees for life! But, anything u create on this page has its liqudiity burned - srry
      </Text>
      <PanelCard>
        <Text fontSize="2xl" fontWeight="bold" mb={4}>
          Memecoin Details
        </Text>
        <VStack spacing={4} align="stretch">
          <Input placeholder="Pool Name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} required />
          <Input placeholder="Pool Symbol" value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)} required />
          <Textarea placeholder="Pool Description" value={tokenDescription} onChange={(e) => setTokenDescription(e.target.value)} />{' '}
          <Input placeholder="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <Text fontSize="sm" color="gray.500">
            Suggested links (optional):
          </Text>
          <Box>
            {twitterHandle != undefined ? (
              <Input placeholder="Twitter Handle" value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} />
            ) : (
              <Button variant="outline" leftIcon={<Icon as={FaTwitter} />} onClick={() => setTwitterHandle('')}>
                Add X (Twitter)
              </Button>
            )}
          </Box>
          <Box>
            {telegramHandle != undefined ? (
              <Input placeholder="Telegram Handle" value={telegramHandle} onChange={(e) => setTelegramHandle(e.target.value)} />
            ) : (
              <Button variant="outline" leftIcon={<Icon as={FaTelegram} />} onClick={() => setTelegramHandle('')}>
                Add Telegram
              </Button>
            )}
          </Box>
          <Box>
            {discordHandle != undefined ? (
              <Input placeholder="Discord Handle" value={discordHandle} onChange={(e) => setDiscordHandle(e.target.value)} />
            ) : (
              <Button variant="outline" leftIcon={<Icon as={FaDiscord} />} onClick={() => setDiscordHandle('')}>
                Add Discord
              </Button>
            )}
          </Box>
          <Box>
            {githubHandle != undefined ? (
              <Input placeholder="GitHub Handle" value={githubHandle} onChange={(e) => setGithubHandle(e.target.value)} />
            ) : (
              <Button variant="outline" leftIcon={<Icon as={FaGithub} />} onClick={() => setGithubHandle('')}>
                Add GitHub
              </Button>
            )}
          </Box>
          <Input type="file" accept="image/*,video/*,audio/*" onChange={(e) => setTokenImage(e.target.files?.[0] || null)} />
          <SelectPoolTokenAndFee
            customTokens={[]}
            completed={step > 1}
            isLoading={false}
            onEdit={(step) => {
              setStep(step + 2)
            }}
            onConfirm={({ token1, token2, ammConfig }) => {
              if (token2) {
                setQuoteTokenInfo(token2 as TokenInfo)
              }
            }}
          />
          <Flex direction="column" w="full" align={'center'}>
            {quoteTokenInfo && (
              <TokenInput
                ctrSx={{ w: '100%', textColor: 'gray.500' }}
                topLeftLabel="Base Token TO BUY (yes u have 0 now...)"
                token={
                  {
                    address: Keypair.generate().publicKey.toBase58(),
                    name: 'Memecoin',
                    symbol: 'MEME',
                    decimals: 6,
                    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
                    chainId: 101,
                    logoURI: '',
                    tags: [],
                    extensions: {},
                    priority: 1000
                  } as TokenInfo
                }
                value={tokenAmount.base}
                onChange={(val: string) => setTokenAmount((prev) => ({ ...prev, base: val }))}
                onTokenChange={(token: ApiV3Token | TokenInfo) => handleSelectToken(token as TokenInfo, 'input')}
              />
            )}
            <Box my={'-10px'} zIndex={1}>
              <AddLiquidityPlus />
            </Box>
            {quoteTokenInfo && (
              <TokenInput
                ctrSx={{ w: '100%', textColor: 'gray.500' }}
                topLeftLabel="Quote Token"
                token={quoteTokenInfo}
                value={tokenAmount.quote}
                onChange={(val: string) => setTokenAmount((prev) => ({ ...prev, quote: val }))}
                onTokenChange={(token: ApiV3Token | TokenInfo) => handleSelectToken(token as TokenInfo, 'output')}
              />
            )}
          </Flex>
          <Text fontSize="2xl" fontWeight="bold" mt={6}>
            Select Pool Types
          </Text>
          <CheckboxGroup>
            <VStack alignItems="flex-start">
              <Checkbox isChecked={poolTypes.gobbler} onChange={(e) => setPoolTypes({ ...poolTypes, gobbler: e.target.checked })}>
                Gobbler Pool
              </Checkbox>
              <Checkbox isChecked={poolTypes.raydium} onChange={(e) => setPoolTypes({ ...poolTypes, raydium: e.target.checked })}>
                Raydium Pool
              </Checkbox>
              <Checkbox isChecked={poolTypes.meteora} onChange={(e) => setPoolTypes({ ...poolTypes, meteora: e.target.checked })}>
                Meteora Pool
              </Checkbox>
            </VStack>
          </CheckboxGroup>
          <Button type="submit" colorScheme="green" width="full" onClick={handleCreate}>
            Launch Memecoin
          </Button>
        </VStack>
      </PanelCard>
    </Box>
  )
}
