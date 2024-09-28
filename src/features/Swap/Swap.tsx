import { Box, Grid, GridItem, HStack, VStack, Collapse, useDisclosure, Input, useClipboard, Image } from '@chakra-ui/react'
import { RAYMint, SOLMint } from '@raydium-io/raydium-sdk-v2'
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js'
import { useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import PanelCard from '@/components/PanelCard'
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect'
import SwapChatEmptyIcon from '@/icons/misc/SwapChatEmptyIcon'
import SwapChatIcon from '@/icons/misc/SwapChatIcon'
import SwapExchangeIcon from '@/icons/misc/SwapExchangeIcon'
import LinkIcon from '@/icons/misc/LinkIcon'
import DollarIcon from '@/icons/misc/DollarIcon'
import { useAppStore, useTokenStore } from '@/store'
import { colors } from '@/theme/cssVariables'
import { getVHExpression } from '../../theme/cssValue/getViewportExpression'
import { getSwapPairCache, setSwapPairCache } from './util'
import { SwapKlinePanel } from './components/SwapKlinePanel'
import { SwapKlinePanelMobileDrawer } from './components/SwapKlinePanelMobileDrawer'
import { SwapKlinePanelMobileThumbnail } from './components/SwapKlinePanelMobileThumbnail'
import { SwapPanel } from './components/SwapPanel'
import { TimeType } from '@/hooks/pool/useFetchPoolKLine'
import { SlippageAdjuster } from '@/components/SlippageAdjuster'
import { getMintPriority } from '@/utils/token'
import Tooltip from '@/components/Tooltip'
import { MoonpayBuy } from '@/components/Moonpay'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import useResponsive from '@/hooks/useResponsive'
import { fetchProgramAccounts } from '@/api/curves'
import { ApiV3Token, solToWSol, toApiV3Token } from 'tokengobbler'
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  MintLayout,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token'
import { getUTCOffset } from '@/utils/date'
import { birdeyeAuthorizeKey, birdeyeKlineApiAddress } from '@/utils/config/birdeyeAPI'
import axios from 'axios'
import { SECONDS } from '@/hooks/pool/useFetchPoolChartVolume'
import Button from '@/components/Button'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { useAnchorWallet } from '@solana/wallet-adapter-react'
import { BN } from 'bn.js'

const PROGRAM_IDS = ['65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9', 'Ei1CgRq6SMB8wQScEKeRMGYkyb3YmRTaej1hpHcqAV9r']

const GLOBAL_SEED = 'global'
const BONDING_CURVE_SEED = 'bonding-curve'

export default function Swap() {
  const [buyAmount, setBuyAmount] = useState('')
  const [sellAmount, setSellAmount] = useState('')

  const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW')
  const programId = new PublicKey('65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9')

  const wallet = useAnchorWallet()
  const [programs, setPrograms] = useState<{ [key: string]: Program<any> }>({})

  useEffect(() => {
    if (!wallet) return
    const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions())
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

  const handleBuy = async (amm: AMM) => {
    if (!amm.program || !amm.mintPubkey) {
      console.log(amm.program)
      console.log(amm.mintPubkey)
      console.log('AMM program or mintPubkey is missing')
      return
    }

    const tokenAmount = new BN(Math.floor(parseFloat(buyAmount) * 1e6)) // Assuming 6 decimal places
    const maxSolAmount = new BN(Number.MAX_SAFE_INTEGER)

    const user = amm.program.provider.publicKey
    if (!user) {
      console.log('User public key is missing')
      return
    }

    try {
      console.log('Preparing buy transaction...')
      if (amm.programId === '65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9') {
        const preixs: any[] = []
        const ata = getAssociatedTokenAddressSync(amm.mintPubkey, user, true, TOKEN_2022_PROGRAM_ID)
        const ataAccountMaybe = await connection.getAccountInfo(ata)
        if (!ataAccountMaybe) {
          const ataAccount = createAssociatedTokenAccountInstruction(user, ata, user, amm.mintPubkey, TOKEN_2022_PROGRAM_ID)
          preixs.push(ataAccount)
        }
        // @ts-ignore
        const tx = await amm.program.methods
          .buy(tokenAmount, maxSolAmount)
          .accounts({
            user: user,
            mint: amm.mintPubkey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: amm.program.programId,
            hydra: new PublicKey('AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ')
          })
          .preInstructions(preixs)
          .transaction()

        console.log('Fetching latest blockhash...')
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        tx.feePayer = user

        if (!wallet) {
          console.log('Wallet is missing')
          return
        }

        console.log('Signing transaction...')
        const signedTx = await wallet.signTransaction(tx)
        console.log('Sending transaction...')
        const sig = await connection.sendRawTransaction(signedTx.serialize())

        console.log(`Buy transaction successful: ${sig}`)
      } else {
        const preixs: any[] = []
        const ata = getAssociatedTokenAddressSync(amm.mintPubkey, user, true, TOKEN_PROGRAM_ID)
        const ataAccountMaybe = await connection.getAccountInfo(ata)
        if (!ataAccountMaybe) {
          const ataAccount = createAssociatedTokenAccountInstruction(user, ata, user, amm.mintPubkey, TOKEN_PROGRAM_ID)
          preixs.push(ataAccount)
        }
        const tx = await amm.program.methods
          .buy(tokenAmount, maxSolAmount)
          .accounts({
            user: user,
            mint: amm.mintPubkey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: amm.program.programId,
            hydra: new PublicKey('AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ')
          })
          .preInstructions(preixs)
          .transaction()

        console.log('Fetching latest blockhash...')
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        tx.feePayer = user

        if (!wallet) {
          console.log('Wallet is missing')
          return
        }

        console.log('Signing transaction...')
        const signedTx = await wallet.signTransaction(tx)
        console.log('Sending transaction...')
        const sig = await connection.sendRawTransaction(signedTx.serialize())

        console.log(`Buy transaction successful: ${sig}`)
      }
    } catch (error) {
      console.error('Error buying tokens:', error)
    }
  }

  const handleSell = async (amm: AMM) => {
    if (!amm.program || !amm.mintPubkey) return

    const tokenAmount = new BN(Math.floor(parseFloat(sellAmount) * 1e6)) // Assuming 6 decimal places
    const minSolAmount = new BN(0)

    const user = amm.program.provider.publicKey
    if (!user) return

    try {
      const tx = await amm.program.methods
        .sell(tokenAmount, minSolAmount)
        .accounts({
          user: user,
          mint: amm.mintPubkey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          program: amm.program.programId
        })
        .transaction()

      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = user
      if (!wallet) return
      const signedTx = await wallet.signTransaction(tx)
      const sig = await connection.sendRawTransaction(signedTx.serialize())

      console.log(`Sell transaction: ${sig}`)
      // Here you would typically update the UI or fetch updated balances
    } catch (error) {
      console.error('Error selling tokens:', error)
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
      public program: Program<any>
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

  const fetcher = (
    url: string
  ): Promise<{
    success: boolean
    data: { items: any[] }
  }> => {
    return axios.get(url, {
      skipError: true,
      headers: {
        'x-api-key': birdeyeAuthorizeKey
      }
    })
  }

  const offsetSize: Record<TimeType, number> = {
    '15m': 100,
    '1H': 300,
    '4H': 300,
    '1D': 300,
    '1W': 300
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
      const programAccountsPromises = PROGRAM_IDS.map((programId) =>
        fetchProgramAccounts(connection, programId, {
          encoding: 'base64',
          filters: [{ dataSize: 49 }]
        }).then((accounts) => ({ programId, accounts }))
      )

      const programAccountsResults = await Promise.all(programAccountsPromises)

      for (const { programId, accounts } of programAccountsResults) {
        console.log(`Found ${accounts.length} accounts for program ${programId}`)

        const accountDataPromises = accounts.map(async (account: any) => {
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
            amm.apiV3Token = toApiV3Token({
              address: amm.mintPubkey?.toBase58(),
              programId:
                programId == '65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9'
                  ? TOKEN_2022_PROGRAM_ID.toString()
                  : TOKEN_PROGRAM_ID.toString(),
              decimals: 6
            })
            const response = await fetcher(
              birdeyeKlineApiAddress({
                baseMint: solToWSol(amm.apiV3Token.address).toString(),
                quoteMint: solToWSol(quoteToken?.address || NATIVE_MINT.toBase58()).toString(),
                timeType: selectedTimeType,
                timeFrom: untilDate.current - getOffset(selectedTimeType, 1),
                timeTo: untilDate.current
              })
            )
            try {
              // @ts-ignore
              const klineData = response.data.data.items
              const lastPrice = klineData[klineData.length - 1]?.c
              if (lastPrice !== undefined) {
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
                    apiV3Token: amm.apiV3Token
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

                const options = {
                  method: 'GET',
                  headers: {
                    accept: 'application/json',
                    'x-chain': 'solana',
                    'X-API-KEY': '76e4f97ddfa74b42b3e757721f231279'
                  }
                }

                fetch(`https://public-api.birdeye.so/defi/token_overview?address=${amm.mintPubkey?.toBase58()}`, options)
                  .then((response) => response.json())
                  .then((response) => {
                    console.log(response)
                    amm.metadata = {
                      image: response.logoURI,
                      name: response.name,
                      symbol: response.symbol
                    }
                  })
                  .catch((err) => console.error(err))
              }
            } catch (error) {
              console.error('Error fetching kline data:', error)
            }
          }
        })

        await Promise.all(accountDataPromises)
      }
    }
  }

  useEffect(() => {
    fetchAMMs()
  }, [programs])
  // const { inputMint: cacheInput, outputMint: cacheOutput } = getSwapPairCache()
  const [inputMint, setInputMint] = useState<string>(PublicKey.default.toBase58())
  const [outputMint, setOutputMint] = useState<string>(RAYMint.toBase58())
  const [isPCChartShown, setIsPCChartShown] = useState<boolean>(true)
  const [isMobileChartShown, setIsMobileChartShown] = useState<boolean>(false)
  const [isChartLeft, setIsChartLeft] = useState<boolean>(true)
  const { isMobile } = useResponsive()
  const publicKey = useAppStore((s) => s.publicKey)
  const connected = useAppStore((s) => s.connected)
  const [directionReverse, setDirectionReverse] = useState<boolean>(false)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const swapPanelRef = useRef<HTMLDivElement>(null)
  const klineRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const { onCopy, setValue } = useClipboard('')
  const [isBlinkReferralActive, setIsBlinkReferralActive] = useState(false)
  const solMintAddress = SOLMint.toBase58()

  const baseMint = directionReverse ? outputMint : inputMint
  const quoteMint = directionReverse ? inputMint : outputMint
  const tokenMap = useTokenStore((s) => s.tokenMap)
  const baseToken = useMemo(() => tokenMap.get(baseMint), [tokenMap, baseMint])
  const quoteToken = useMemo(() => tokenMap.get(NATIVE_MINT.toBase58()), [tokenMap, quoteMint])
  const [isDirectionNeedReverse, setIsDirectionNeedReverse] = useState<boolean>(false)
  const { isOpen, onToggle } = useDisclosure()

  useEffect(() => {
    const { inputMint: cacheInput, outputMint: cacheOutput } = getSwapPairCache()
    if (cacheInput) setInputMint(cacheInput)
    if (cacheOutput && cacheOutput !== cacheInput) setOutputMint(cacheOutput)
    setCacheLoaded(true)
  }, [])
  useEffect(() => {
    // preserve swap chart default direction on page refresh by mint priority
    if (cacheLoaded) {
      if (getMintPriority(baseMint) > getMintPriority(quoteMint)) {
        setDirectionReverse(true)
      }
    }
  }, [cacheLoaded])
  // reset directionReverse when inputMint or outputMint changed
  useIsomorphicLayoutEffect(() => {
    if (!cacheLoaded) return
    if (isDirectionNeedReverse) {
      setDirectionReverse(true)
      setIsDirectionNeedReverse(false)
    } else {
      setDirectionReverse(false)
    }

    setSwapPairCache({
      inputMint,
      outputMint
    })
  }, [inputMint, outputMint, cacheLoaded])

  useIsomorphicLayoutEffect(() => {
    if (klineRef.current) {
      const swapPanelHeight = swapPanelRef.current?.getBoundingClientRect().height
      const height = Number(swapPanelHeight) > 500 ? `${swapPanelHeight}px` : '522px'
      klineRef.current.style.height = height
    }
  }, [])

  useEffect(() => {
    // inputMint === solMintAddress || outputMint === solMintAddress ? setIsBlinkReferralActive(true) : setIsBlinkReferralActive(false)
    setIsBlinkReferralActive(true)
    const def = PublicKey.default.toString()
    const _inputMint = inputMint === def ? 'sol' : inputMint
    const _outputMint = outputMint === def ? 'sol' : outputMint
    const href = `https://raydium.io/swap/?inputMint=${_inputMint}&outputMint=${_outputMint}`
    const walletAddress = publicKey?.toBase58()
    const copyUrl = connected ? href + `&referrer=${walletAddress}` : href
    setValue(copyUrl)
  }, [inputMint, outputMint, connected, publicKey])

  return (
    <VStack
      mx={['unset', 'auto']}
      mt={[0, getVHExpression([0, 800], [32, 1300])]}
      width={!isMobile && isPCChartShown ? 'min(100%, 1300px)' : undefined}
    >
      <HStack alignSelf="flex-end" my={[1, 0]}>
        <SlippageAdjuster />
        <Tooltip
          label={t('swap.blink_referral_desc', {
            symbol: outputMint === solMintAddress ? tokenMap.get(inputMint)?.symbol : tokenMap.get(outputMint)?.symbol
          })}
        >
          <Box
            cursor="pointer"
            opacity={isBlinkReferralActive ? 1 : 0.6}
            onClick={() => {
              if (isBlinkReferralActive) {
                onCopy()
                toastSubject.next({
                  status: 'success',
                  title: t('common.copy_success')
                })
              }
            }}
          >
            <LinkIcon />
          </Box>
        </Tooltip>
        <MoonpayBuy>
          <DollarIcon />
        </MoonpayBuy>

        {!isMobile && isPCChartShown && (
          <Box
            cursor="pointer"
            onClick={() => {
              setIsChartLeft((b) => !b)
            }}
          >
            <SwapExchangeIcon />
          </Box>
        )}
        <Box
          cursor="pointer"
          onClick={() => {
            if (!isMobile) {
              setIsPCChartShown((b) => !b)
            } else {
              setIsMobileChartShown(true)
            }
          }}
        >
          {isMobile || isPCChartShown ? (
            <SwapChatIcon />
          ) : (
            <Box color={colors.textSecondary}>
              <SwapChatEmptyIcon />
            </Box>
          )}
        </Box>
      </HStack>

      <Grid
        width="full"
        gridTemplateColumns={isPCChartShown ? (isChartLeft ? '1.5fr 1fr' : '1fr 1.5fr') : '1fr'}
        gridTemplateRows="auto"
        gap={[3, isPCChartShown ? 4 : 0]}
      >
        {amms
          .filter((amm) => amm.mintPubkey instanceof PublicKey)
          .map((amm) => (
            <GridItem key={amm.mintPubkey?.toBase58()} mb={isMobile ? 3 : 0}>
              <PanelCard ref={klineRef} p={[3, 3]} gap={4} height="800px" display={isMobile || !isPCChartShown ? 'none' : 'block'}>
                <VStack spacing={4} align="stretch">
                  <HStack justify="space-between" height="120px">
                    {' '}
                    {/* Doubled height */}
                    <VStack align="flex-start" spacing={2}>
                      <HStack>
                        <Box>
                          <Image src={amm.metadata?.image || ''} alt={amm.metadata?.symbol || ''} width="66px" height="66px" />
                        </Box>
                        <Box fontSize="2xl" fontWeight="bold">
                          {amm.metadata?.symbol} / WSOL
                        </Box>
                      </HStack>
                    </VStack>
                    <VStack align="flex-end" spacing={2}>
                      <HStack>
                        <Input placeholder="Buy amount" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} size="sm" />
                        <Button onClick={() => handleBuy(amm)} size="sm">
                          Buy
                        </Button>
                      </HStack>
                      <HStack>
                        <Input placeholder="Sell amount" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} size="sm" />
                        <Button onClick={() => handleSell(amm)} size="sm">
                          Sell
                        </Button>
                      </HStack>
                    </VStack>
                  </HStack>
                  <HStack spacing={4}>
                    <Box>24/09/28 01:09</Box>
                    <HStack spacing={2}>
                      {['15m', '1H', '4H', '1D', '1W'].map((timeType) => (
                        <Button
                          key={timeType}
                          size="sm"
                          variant={selectedTimeType === timeType ? 'solid' : 'ghost'}
                          onClick={() => setSelectedTimeType(timeType as TimeType)}
                        >
                          {timeType}
                        </Button>
                      ))}
                    </HStack>
                  </HStack>
                </VStack>
                <SwapKlinePanel
                  untilDate={untilDate.current}
                  baseToken={amm.apiV3Token as ApiV3Token}
                  quoteToken={quoteToken}
                  timeType={selectedTimeType}
                  onDirectionToggle={() => setDirectionReverse((b) => !b)}
                />
              </PanelCard>

              {isMobile && (
                <PanelCard p={[3, 6]} gap={0} onClick={() => setIsMobileChartShown(true)} height="100%">
                  <SwapKlinePanelMobileThumbnail
                    untilDate={untilDate.current}
                    baseToken={amm.apiV3Token as ApiV3Token}
                    quoteToken={quoteToken}
                  />
                  <SwapKlinePanelMobileDrawer
                    untilDate={untilDate.current}
                    isOpen={isMobileChartShown}
                    onClose={() => setIsMobileChartShown(false)}
                    baseToken={amm.apiV3Token as ApiV3Token}
                    quoteToken={quoteToken}
                    timeType={selectedTimeType}
                    onDirectionToggle={() => setDirectionReverse((b) => !b)}
                    onTimeTypeChange={setSelectedTimeType}
                  />
                  <VStack spacing={4} align="stretch" mt={4}>
                    <Button onClick={onToggle}>{isOpen ? 'Hide' : 'Show'} Buy/Sell Options</Button>
                    <Collapse in={isOpen} animateOpacity>
                      <VStack spacing={4} align="stretch">
                        <HStack spacing={4}>
                          <Input placeholder="Buy amount" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} />
                          <Button onClick={() => handleBuy(amm)}>Buy</Button>
                        </HStack>
                        <HStack spacing={4}>
                          <Input placeholder="Sell amount" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} />
                          <Button onClick={() => handleSell(amm)}>Sell</Button>
                        </HStack>
                      </VStack>
                    </Collapse>
                  </VStack>
                </PanelCard>
              )}
            </GridItem>
          ))}
      </Grid>
    </VStack>
  )
}
