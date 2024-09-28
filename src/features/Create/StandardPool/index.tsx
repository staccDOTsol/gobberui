'use client'

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { FaTwitter, FaTelegram, FaDiscord, FaGithub } from 'react-icons/fa'
import { Box, VStack, HStack, Input, Button, Text, Textarea, Select, Image, useToast, Icon, Flex } from '@chakra-ui/react'
import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import Decimal from 'decimal.js'
import dayjs from 'dayjs'
import BN from 'bn.js'
import { ApiV3Token, getATAAddress, TokenInfo } from 'tokengobbler'
import { TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { makeCreateAmmConfig, makeCreateCpmmPoolInInstruction, makeInitializeMetadata } from 'tokengobbler'
import { getCreatePoolKeys } from 'tokengobbler'
import { useRouter } from 'next/navigation'
import PanelCard from '@/components/PanelCard'
import SelectPoolTokenAndFee from '../ClmmPool/components/SelectPoolTokenAndFee'
import { Program } from '@coral-xyz/anchor'
import { TimeType } from '@/hooks/pool/useFetchPoolKLine'
import { SlippageAdjuster } from '@/components/SlippageAdjuster'
import { getMintPriority } from '@/utils/token'
import Tooltip from '@/components/Tooltip'
import { MoonpayBuy } from '@/components/Moonpay'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import useResponsive from '@/hooks/useResponsive'
import { solToWSol, toApiV3Token } from '@raydium-io/raydium-sdk-v2'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, MintLayout } from '@solana/spl-token'
import { getUTCOffset } from '@/utils/date'
import { birdeyeAuthorizeKey, birdeyeKlineApiAddress } from '@/utils/config/birdeyeAPI'
import axios from 'axios'
import { SECONDS } from '@/hooks/pool/useFetchPoolChartVolume'
import { AnchorProvider } from '@coral-xyz/anchor'
import { useAnchorWallet } from '@solana/wallet-adapter-react'
import TokenInput from '@/components/TokenInput'
import AddLiquidityPlus from '@/icons/misc/AddLiquidityPlus'

const MAX_URI_LENGTH = 200
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
const PROGRAM_ID = new PublicKey('CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj') // Replace with your actual program ID

const PROGRAM_IDS = ['65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9', 'Ei1CgRq6SMB8wQScEKeRMGYkyb3YmRTaej1hpHcqAV9r']

export default function CreatePage() {
  const router = useRouter()
  const toast = useToast()
  const [poolName, setPoolName] = useState('')
  const [poolSymbol, setPoolSymbol] = useState('')
  const [poolDescription, setPoolDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [telegramHandle, setTelegramHandle] = useState<string | undefined>(undefined)
  const [discordHandle, setDiscordHandle] = useState<string | undefined>(undefined)
  const [githubHandle, setGithubHandle] = useState<string | undefined>(undefined)
  const [twitterHandle, setTwitterHandle] = useState<string | undefined>(undefined)
  const [poolImage, setPoolImage] = useState<File | null>(null)
  const [baseAmount, setBaseAmount] = useState('')
  const [quoteAmount, setQuoteAmount] = useState('')
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [startTime, setStartTime] = useState('')
  const [startDateMode, setStartDateMode] = useState<'now' | 'custom'>('now')

  const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW')

  const wallet = useWallet()
  const anchorWallet = useAnchorWallet()
  const umi = useMemo(() => {
    const u = createUmi(connection).use(irysUploader()).use(mplToolbox())

    if (wallet.publicKey) {
      return u.use(walletAdapterIdentity(wallet))
    }
    return u
  }, [wallet, connection])

  const shortenUrl = async (url: string): Promise<string> => {
    try {
      const response = await fetch(`http://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`)
      return await response.text()
    } catch (error) {
      console.error('Error shortening URL:', error)
      return url.substring(0, MAX_URI_LENGTH)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      const isFront = new BN(new PublicKey(baseTokenInfo?.address as string).toBuffer()).lte(
        new BN(new PublicKey(quoteTokenInfo?.address as string).toBuffer())
      )

      const [mintA, mintB] = isFront ? [baseTokenInfo?.address, quoteTokenInfo?.address] : [quoteTokenInfo?.address, baseTokenInfo?.address]
      const [mintAAmount, mintBAmount] = isFront ? [baseAmount, quoteAmount] : [quoteAmount, baseAmount]

      const mintAUseSOLBalance = mintA === NATIVE_MINT.toBase58()
      const mintBUseSOLBalance = mintB === NATIVE_MINT.toBase58()
      const [mintAPubkey, mintBPubkey] = [new PublicKey(mintA as string), new PublicKey(mintB as string)]

      const configId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      const [ammConfigKey, _bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('amm_config'), new BN(configId).toArrayLike(Buffer, 'be', 8)],
        PROGRAM_ID
      )
      const poolKeys = getCreatePoolKeys({
        creator: wallet.publicKey,
        programId: PROGRAM_ID,
        mintA: mintAPubkey,
        mintB: mintBPubkey,
        configId: ammConfigKey
      })
      poolKeys.configId = ammConfigKey

      const startTimeValue =
        startDateMode === 'custom' && startDate && startTime
          ? new Date(`${startDate.toDateString()} ${startTime}`).getTime() / 1000
          : Math.floor(Date.now() / 1000)

      const instructions = [
        makeCreateAmmConfig(
          PROGRAM_ID,
          wallet.publicKey,
          ammConfigKey,
          new BN(configId),
          new BN(2500), // token1LpRate
          new BN(2500), // token0LpRate
          new BN(2500), // token0CreatorRate
          new BN(2500) // token1CreatorRate
        ),
        makeCreateCpmmPoolInInstruction(
          PROGRAM_ID,
          wallet.publicKey,
          ammConfigKey,
          poolKeys.authority,
          poolKeys.poolId,
          mintAPubkey,
          mintBPubkey,
          poolKeys.lpMint,
          await getATAAddress(wallet.publicKey, mintAPubkey).publicKey,
          await getATAAddress(wallet.publicKey, mintBPubkey).publicKey,
          await getATAAddress(wallet.publicKey, poolKeys.lpMint).publicKey,
          poolKeys.vaultA,
          poolKeys.vaultB,
          TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          poolKeys.observationId,
          new BN(mintAAmount),
          new BN(mintBAmount),
          new BN(startTimeValue)
        ),
        makeInitializeMetadata(
          PROGRAM_ID,
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

      const transaction = new Transaction().add(...instructions)
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = wallet.publicKey
      if (!wallet.signTransaction) {
        throw new Error('Wallet does not support signing transactions')
      }
      const signedTransaction = await wallet.signTransaction(transaction)
      const txid = await connection.sendRawTransaction(signedTransaction.serialize())
      await connection.confirmTransaction(txid)

      const poolId = poolKeys.poolId.toString()
      router.push(`/explorer/${poolId}`)

      toast({
        title: 'Success',
        description: 'Your memecoin has been created! Redirecting to explorer...',
        status: 'success',
        duration: 5000,
        isClosable: true
      })
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

  type BuyResult = {
    token_amount: bigint
    sol_amount: bigint
  }

  type SellResult = {
    token_amount: bigint
    sol_amount: bigint
  }
  class AMM {
    constructor(
      public virtualSolReserves: bigint,
      public virtualTokenReserves: bigint,
      public realSolReserves: bigint,
      public realTokenReserves: bigint,
      public initialVirtualTokenReserves: bigint,
      public program: Program
    ) {}
    metadata: {
      image: string | null
      name: string | null
      symbol: string | null
    } | null = null
    mintPubkey: PublicKey | null = null
    programId: string | null = null
    apiV3Token: ApiV3Token | null = null
    getBuyPrice(tokens: bigint): bigint {
      const productOfReserves = this.virtualSolReserves * this.virtualTokenReserves
      const newVirtualTokenReserves = this.virtualTokenReserves - tokens
      const newVirtualSolReserves = productOfReserves / newVirtualTokenReserves + BigInt(1)
      const amountNeeded = newVirtualSolReserves - this.virtualSolReserves

      return amountNeeded
    }

    applyBuy(token_amount: bigint): BuyResult {
      const final_token_amount = token_amount > this.realTokenReserves ? this.realTokenReserves : token_amount
      const sol_amount = this.getBuyPrice(final_token_amount)

      this.virtualTokenReserves = this.virtualTokenReserves - final_token_amount
      this.realTokenReserves = this.realTokenReserves - final_token_amount

      this.virtualSolReserves = this.virtualSolReserves + sol_amount
      this.realSolReserves = this.realSolReserves + sol_amount

      return {
        token_amount: final_token_amount,
        sol_amount: sol_amount
      }
    }

    applySell(token_amount: bigint): SellResult {
      this.virtualTokenReserves = this.virtualTokenReserves + token_amount
      this.realTokenReserves = this.realTokenReserves + token_amount

      const sell_price = this.getSellPrice(token_amount)

      this.virtualSolReserves = this.virtualSolReserves - sell_price
      this.realSolReserves = this.realSolReserves - sell_price

      return {
        token_amount: token_amount,
        sol_amount: sell_price
      }
    }

    getSellPrice(tokens: bigint): bigint {
      const scaling_factor = this.initialVirtualTokenReserves
      const token_sell_proportion = (tokens * scaling_factor) / this.virtualTokenReserves
      const sol_received = (this.virtualSolReserves * token_sell_proportion) / scaling_factor
      return sol_received < this.realSolReserves ? sol_received : this.realSolReserves
    }
  }

  const [amms, setAmms] = useState<AMM[]>([])
  const [selectedTimeType, setSelectedTimeType] = useState<TimeType>('15m')
  const untilDate = useRef(Math.floor(Date.now() / 1000))

  const fetcher = async (
    url: string,
    retries = 5,
    backoff = 300
  ): Promise<{
    success: boolean
    data: { items: any[] }
  }> => {
    try {
      const response = await axios.get(url, {
        skipError: true,
        headers: {
          'x-api-key': birdeyeAuthorizeKey
        }
      })
      return response.data
    } catch (error: any) {
      if (error.response && error.response.status === 429 && retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoff))
        return fetcher(url, retries - 1, backoff * 2)
      } else {
        throw error
      }
    }
  }

  const offsetSize: Record<TimeType, number> = {
    '15m': 100,
    '1H': 300,
    '4H': 300,
    '1D': 300,
    '1W': 300
  }
  const [programs, setPrograms] = useState<{ [key: string]: Program<any> }>({})

  useEffect(() => {
    if (!anchorWallet) return
    const provider = new AnchorProvider(connection, anchorWallet, AnchorProvider.defaultOptions())
    async function getIDL(programId: string, provider: AnchorProvider): Promise<Program> {
      try {
        const IDL = await Program.fetchIdl(new PublicKey(programId), provider)
        console.log(IDL)

        if (!IDL) {
          throw new Error('Failed to fetch IDL')
        }

        if (!provider) {
          throw new Error('Provider is null or undefined')
        }

        return new Program(IDL as any, provider)
      } catch (error) {
        console.error('Error in getIDL:', error)
        throw error
      }
    }
    async function fetchPrograms() {
      const newPrograms = await Promise.all(PROGRAM_IDS.map((programId) => getIDL(programId, provider)))
      const programsObject = PROGRAM_IDS.reduce((acc: { [key: string]: Program<any> }, programId: string, index: number) => {
        acc[programId] = newPrograms[index]
        return acc
      }, {})
      setPrograms(programsObject)
    }
    fetchPrograms()
  }, [wallet])

  const fetchWithCache = async (url: string, options: RequestInit, cacheKey: string) => {
    try {
      const response = await axios.post('/api/fetchWithCache', {
        url,
        options,
        cacheKey
      })
      return response.data
    } catch (error) {
      console.error('Error in fetchWithCache:', error)
      throw error
    }
  }
  const getOffset = (timeType: TimeType, page: number) => SECONDS[timeType] * (offsetSize[timeType] * page)
  let lastFetchDate = Math.floor(Date.now() / 1000)

  const fetchAMMs = async () => {
    const allAmms: AMM[] = []
    for (const programId of PROGRAM_IDS) {
      const program = programs[programId]
      if (!program) {
        console.error(`Program not found for programId: ${programId}`)
        continue
      }

      const accounts = await connection
        .getProgramAccounts(new PublicKey(programId), {
          encoding: 'base64',
          filters: [{ dataSize: 49 }]
        })
        .then((accounts) => {
          console.log(accounts)
          return { programId, accounts }
        })
      console.log(`Found ${accounts.accounts.length} accounts for program ${programId}`)

      const accountDataPromises = accounts.accounts.map(async (account) => {
        const data = Buffer.from(account.account.data).slice(8)
        const virtualSolReserves = data.readBigUInt64LE(0)
        const virtualTokenReserves = data.readBigUInt64LE(8)
        const realSolReserves = data.readBigUInt64LE(16)
        const realTokenReserves = data.readBigUInt64LE(24)
        const initialVirtualTokenReserves = data.readBigUInt64LE(32)
        const amm = new AMM(
          virtualSolReserves,
          virtualTokenReserves,
          realSolReserves,
          realTokenReserves,
          initialVirtualTokenReserves,
          program
        )
        amm.programId = programId
        const signatures = await connection.getSignaturesForAddress(account.pubkey, { limit: 50 })
        const transactions = await connection.getTransactions(signatures.map((sig) => sig.signature))

        let mintPubkey: PublicKey | null = null
        for (const tx of transactions) {
          if (!tx) continue
          for (const tokenTransfer of tx.meta?.postTokenBalances ?? []) {
            const [maybeUs] = PublicKey.findProgramAddressSync(
              [Buffer.from('bonding-curve'), new PublicKey(tokenTransfer.mint).toBuffer()],
              new PublicKey(programId)
            )
            if (maybeUs.equals(account.pubkey)) {
              mintPubkey = new PublicKey(tokenTransfer.mint)
              break
            }
          }
          if (mintPubkey) break
        }
        if (mintPubkey) {
          amm.programId = programId
          amm.mintPubkey = mintPubkey
          // Only fetch metadata if it doesn't exist yet
          if (!amm.metadata) {
            try {
              const result = await fetchWithCache(
                `https://mainnet.helius-rpc.com/?api-key=0d4b4fd6-c2fc-4f55-b615-a23bab1ffc85`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'my-id',
                    method: 'getAsset',
                    params: {
                      id: amm.mintPubkey?.toBase58()
                    }
                  })
                },
                amm.mintPubkey?.toBase58() || ''
              )
              const resultJson = await result.data
              if (resultJson?.result?.content?.metadata) {
                console.log(resultJson)
                amm.metadata = {
                  image: resultJson.result.content.links.image,
                  name: resultJson.result.content.metadata.name,
                  symbol: resultJson.result.content.metadata.symbol
                }
                amm.apiV3Token = toApiV3Token({
                  name: resultJson.result.content.metadata.name,
                  symbol: resultJson.result.content.metadata.symbol,
                  address: amm.mintPubkey?.toBase58() || '',
                  programId:
                    programId === '65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9'
                      ? TOKEN_2022_PROGRAM_ID.toString()
                      : TOKEN_PROGRAM_ID.toString(),
                  decimals: 6
                })
              }
            } catch (error) {
              console.error('Error fetching AMM metadata:', error)
            }
          }

          const newAmm = Object.assign(
            new AMM(
              amm.virtualSolReserves,
              amm.virtualTokenReserves,
              amm.realSolReserves,
              amm.realTokenReserves,
              amm.initialVirtualTokenReserves,
              amm.program
            ),
            {
              mintPubkey: amm.mintPubkey,
              programId: amm.programId,
              apiV3Token: amm.apiV3Token,
              metadata: amm.metadata
            }
          )

          setAmms((prevAmms) => {
            const isDuplicate = prevAmms.some(
              (existingAmm) =>
                existingAmm.mintPubkey?.toBase58() === newAmm.mintPubkey?.toBase58() && existingAmm.programId === newAmm.programId
            )
            if (isDuplicate) {
              return prevAmms
            } else {
              return [...prevAmms, newAmm]
            }
          })
        }
      })
      await Promise.all(accountDataPromises)
    }
  }
  useEffect(() => {
    if (Object.keys(programs).length == 2) {
      fetchAMMs()
    }
  }, [programs])
  const currentPrice = useMemo(() => {
    try {
      if (new Decimal(baseAmount).lte(0) || new Decimal(quoteAmount).lte(0)) {
        return ''
      }
    } catch (err) {
      return ''
    }
    return new Decimal(quoteAmount).div(baseAmount).toString()
  }, [baseAmount, quoteAmount])
  const [step, setStep] = useState(0)
  const handleSelectToken = (token: TokenInfo, side: 'input' | 'output') => {
    if (side === 'input') {
      setBaseTokenInfo(token)
    } else {
      setQuoteTokenInfo(token)
    }
  }
  console.log(amms.filter((amm) => amm.apiV3Token).map((amm) => amm.apiV3Token as ApiV3Token))
  const [baseTokenInfo, setBaseTokenInfo] = useState<TokenInfo | null>(null)
  const [quoteTokenInfo, setQuoteTokenInfo] = useState<TokenInfo | null>(null)
  const [tokenAmount, setTokenAmount] = useState<{ base: string; quote: string }>({ base: '', quote: '' })

  return (
    <Box minH="100vh" bg="black" p={8} color="#39FF14">
      <Text fontSize="4xl" fontWeight="bold" mb={6} className="animate-pulse">
        Launch Your Memecoin 🚀
      </Text>
      <Text fontSize="xl" mb={6}>
        Gobbler Pool creators get half the swap fees for life!
      </Text>
      <PanelCard>
        <Text fontSize="2xl" fontWeight="bold" mb={4}>
          Memecoin Details
        </Text>
        <form onSubmit={handleSubmit}>
          <VStack spacing={4} align="stretch">
            <Input placeholder="Pool Name" value={poolName} onChange={(e) => setPoolName(e.target.value)} required />
            <Input placeholder="Pool Symbol" value={poolSymbol} onChange={(e) => setPoolSymbol(e.target.value)} required />
            <Textarea placeholder="Pool Description" value={poolDescription} onChange={(e) => setPoolDescription(e.target.value)} />{' '}
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
            <Input type="file" accept="image/*,video/*,audio/*" onChange={(e) => setPoolImage(e.target.files?.[0] || null)} />
            <SelectPoolTokenAndFee
              customTokens={amms.filter((amm) => amm.apiV3Token).map((amm) => amm.apiV3Token as ApiV3Token)}
              completed={step > 0}
              isLoading={false}
              onEdit={() => {}}
              onConfirm={({ token1, token2, ammConfig }) => {
                let step = 0
                if ((token1 && quoteTokenInfo) || (token2 && baseQuoteInfo)) {
                  step = 1
                }
                setStep(step)
                if (token1) {
                  setBaseTokenInfo(token1 as TokenInfo)
                }
                if (token2) {
                  setQuoteTokenInfo(token2 as TokenInfo)
                }
              }}
            />
            <Flex direction="column" w="full" align={'center'}>
              {baseTokenInfo && (
                <TokenInput
                  ctrSx={{ w: '100%', textColor: 'gray.500' }}
                  topLeftLabel="Base Token"
                  token={baseTokenInfo}
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
            <Text>Current Price: {currentPrice || '-'}</Text>
            <Select
              placeholder="Select start time"
              value={startDateMode}
              onChange={(e) => setStartDateMode(e.target.value as 'now' | 'custom')}
            >
              <option value="now">Start Now</option>
              <option value="custom">Custom</option>
            </Select>
            {startDateMode === 'custom' && (
              <HStack>
                <Input
                  type="date"
                  value={startDate?.toISOString().split('T')[0] || ''}
                  onChange={(e) => setStartDate(new Date(e.target.value))}
                  min={new Date().toISOString().split('T')[0]}
                />
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </HStack>
            )}
            <Button type="submit" colorScheme="green" width="full">
              Launch Memecoin
            </Button>
          </VStack>
        </form>
      </PanelCard>
    </Box>
  )
}
