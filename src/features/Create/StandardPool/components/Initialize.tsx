import { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import { Box, Flex, FormControl, FormLabel, HStack, Input, Text, Textarea, VStack, useDisclosure } from '@chakra-ui/react'
import { shallow } from 'zustand/shallow'
import FocusTrap from 'focus-trap-react'
import { usePopper } from 'react-popper'
import { useTranslation } from 'react-i18next'
import { PublicKey } from '@solana/web3.js'
import { ApiV3Token, RAYMint, TokenInfo, solToWSolToken } from '@raydium-io/raydium-sdk-v2'
import { DatePick, HourPick, MinutePick } from '@/components/DateTimePicker'
import DecimalInput from '@/components/DecimalInput'
import Button from '@/components/Button'
import TokenInput from '@/components/TokenInput'
import Tabs from '@/components/Tabs'
import { QuestionToolTip } from '@/components/QuestionToolTip'
import HorizontalSwitchSmallIcon from '@/icons/misc/HorizontalSwitchSmallIcon'
import AddLiquidityPlus from '@/icons/misc/AddLiquidityPlus'
import { useLiquidityStore, useTokenStore } from '@/store'
import { colors } from '@/theme/cssVariables'
import { wSolToSolString, wsolToSolToken } from '@/utils/token'
import { TxErrorModal } from '@/components/Modal/TxErrorModal'

import CreateSuccessModal from './CreateSuccessModal'
import useInitPoolSchema from '../hooks/useInitPoolSchema'

import Decimal from 'decimal.js'
import dayjs from 'dayjs'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'

export default function Initialize() {
  const { t } = useTranslation()
  const tokenMap = useTokenStore((s) => s.tokenMap)
  const [inputMint, setInputMint] = useState<string>(PublicKey.default.toBase58())
  const [outputMint, setOutputMint] = useState<string>(RAYMint.toBase58())
  const [baseToken, quoteToken] = [tokenMap.get(inputMint), tokenMap.get(outputMint)]
  const [poolImage, setPoolImage] = useState<File | undefined>()
  const [poolSymbol, setPoolSymbol] = useState<string>('')
  const [poolUri, setPoolUri] = useState<string>('')

  const [poolName, setPoolName] = useState<string>('')
  const [poolDescription, setPoolDescription] = useState<string>('')
  const [twitterHandle, setTwitterHandle] = useState<string>('')
  const [website, setWebsite] = useState<string>('')
  const [telegramHandle, setTelegramHandle] = useState<string>('')
  const [discordHandle, setDiscordHandle] = useState<string>('')
  const [githubHandle, setGithubHandle] = useState<string>('')

  // Telegram handle input
  const handleTelegramChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTelegramHandle(e.target.value)
  }

  // Discord handle input
  const handleDiscordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDiscordHandle(e.target.value)
  }

  // GitHub handle input
  const handleGithubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGithubHandle(e.target.value)
  }

  // Add these new fields to the form, right after the website input
  const additionalSocialFields = (
    <>
      {/* Telegram Handle */}
      <FormControl>
        <FormLabel>{t('create_standard_pool.telegram_handle')}</FormLabel>
        <Input value={telegramHandle} onChange={handleTelegramChange} placeholder="@username or t.me/username" />
      </FormControl>

      {/* Discord Handle */}
      <FormControl>
        <FormLabel>{t('create_standard_pool.discord_handle')}</FormLabel>
        <Input value={discordHandle} onChange={handleDiscordChange} placeholder="username#0000" />
      </FormControl>

      {/* GitHub Handle */}
      <FormControl>
        <FormLabel>{t('create_standard_pool.github_handle')}</FormLabel>
        <Input value={githubHandle} onChange={handleGithubChange} placeholder="username" />
      </FormControl>
    </>
  )

  // Twitter handle input
  const handleTwitterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTwitterHandle(e.target.value)
  }

  // Website input
  const handleWebsiteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWebsite(e.target.value)
  }

  // Add these new fields to the form, right after the pool description
  const additionalFields = (
    <>
      {/* Twitter Handle */}
      <FormControl>
        <FormLabel>{t('create_standard_pool.twitter_handle')}</FormLabel>
        <Input value={twitterHandle} onChange={handleTwitterChange} placeholder="@username" />
      </FormControl>

      {/* Website */}
      <FormControl>
        <FormLabel>{t('create_standard_pool.website')}</FormLabel>
        <Input value={website} onChange={handleWebsiteChange} placeholder="https://example.com" />
      </FormControl>
    </>
  )

  const [createPoolAct, newCreatedPool] = useLiquidityStore((s) => [s.createPoolAct, s.newCreatedPool], shallow)

  const [baseIn, setBaeIn] = useState(true)
  const [startDate, setStartDate] = useState<Date | undefined>()
  const { isOpen: isTxError, onOpen: onTxError, onClose: offTxError } = useDisclosure()
  const { isOpen: isLoading, onOpen: onLoading, onClose: offLoading } = useDisclosure()

  const { isOpen: isPopperOpen, onOpen: onPopperOpen, onClose: closePopper } = useDisclosure()
  const popperRef = useRef<HTMLDivElement>(null)
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null)
  const popper = usePopper(popperRef.current, popperElement, {
    placement: 'top-start'
  })
  const [tokenAmount, setTokenAmount] = useState<{ base: string; quote: string }>({ base: '', quote: '' })
  const [baseSymbol, quoteSymbol] = [wSolToSolString(baseToken?.symbol), wSolToSolString(quoteToken?.symbol)]

  const [startDateMode, setStartDateMode] = useState<'now' | 'custom'>('now')
  const isStartNow = startDateMode === 'now'

  const currentPrice =
    new Decimal(tokenAmount.base || 0).lte(0) || new Decimal(tokenAmount.quote || 0).lte(0)
      ? ''
      : new Decimal(tokenAmount[baseIn ? 'quote' : 'base'] || 0)
          .div(tokenAmount[baseIn ? 'base' : 'quote'] || 1)
          .toDecimalPlaces(baseToken?.decimals ?? 6)
          .toString()

  const error = useInitPoolSchema({ baseToken, quoteToken, tokenAmount, startTime: startDate })

  useEffect(() => () => useLiquidityStore.setState({ newCreatedPool: undefined }), [])

  const handleSelectToken = useCallback(
    (token: TokenInfo | ApiV3Token, side?: 'input' | 'output') => {
      if (side === 'input') {
        setInputMint(token.address)
        setOutputMint((mint) => (token.address === mint ? '' : mint))
      }
      if (side === 'output') {
        setOutputMint(token.address)
        setInputMint((mint) => (token.address === mint ? '' : mint))
      }
    },
    [inputMint, outputMint]
  )
  const { connection } = useConnection()
  const wallet = useWallet()
  const umi = useMemo(() => {
    const u = createUmi(connection).use(irysUploader()).use(mplToolbox())

    if (wallet) {
      return u.use(walletAdapterIdentity(wallet))
    }
    return u
  }, [wallet, connection])

  const onInitializeClick = async () => {
    if (!poolImage) return
    onLoading()
    const genericFile = {
      buffer: new Uint8Array(await poolImage.arrayBuffer()),
      fileName: poolImage.name,
      displayName: poolImage.name,
      uniqueName: `${Date.now()}-${poolImage.name}`,
      contentType: poolImage.type,
      extension: poolImage.name.split('.').pop() || '',
      tags: []
    }
    const firstImageUri = await umi.uploader.upload([genericFile])
    const r = await fetch(firstImageUri[0])
    const imageUri = r.url

    const metadata = {
      name: poolName,
      symbol: poolSymbol,
      description: poolDescription,
      image: imageUri,
      website,
      telegram: telegramHandle,
      discord: discordHandle,
      github: githubHandle,
      twitter: twitterHandle,

      extensions: {
        website,
        telegram: telegramHandle,
        discord: discordHandle,
        github: githubHandle,
        twitter: twitterHandle
      }
    }
    const firstUri = await umi.uploader.uploadJson(metadata)
    const response = await fetch(firstUri)
    const uri = response.url
    createPoolAct({
      pool: {
        mintA: solToWSolToken(baseToken!),
        mintB: solToWSolToken(quoteToken!)
      },
      baseAmount: new Decimal(tokenAmount.base).mul(10 ** baseToken!.decimals).toFixed(0),
      quoteAmount: new Decimal(tokenAmount.quote).mul(10 ** quoteToken!.decimals).toFixed(0),
      startTime: startDate,
      name: poolName,
      symbol: poolSymbol,
      uri,
      onError: onTxError,
      onFinally: offLoading
    })
  }

  return (
    <VStack borderRadius="20px" w="full" bg={colors.backgroundLight} p={6} spacing={5}>
      {/* initial liquidity */}
      <Flex direction="column" w="full" align={'flex-start'} gap={4}>
        <Text fontWeight="medium" fontSize="sm">
          For some fuckin reason u need to set these way less than what u want, yolo
        </Text>
        <Flex direction="column" w="full" align={'center'}>
          <TokenInput
            ctrSx={{ w: '100%', textColor: colors.textTertiary }}
            topLeftLabel={t('common.base_token')}
            token={baseToken ? wsolToSolToken(baseToken) : undefined}
            value={tokenAmount.base}
            onChange={(val) => setTokenAmount((prev) => ({ ...prev, base: val }))}
            onTokenChange={(token) => handleSelectToken(token, 'input')}
          />
          <Box my={'-10px'} zIndex={1}>
            <AddLiquidityPlus />
          </Box>
          <TokenInput
            ctrSx={{ w: '100%', textColor: colors.textTertiary }}
            topLeftLabel={t('common.quote_token')}
            token={quoteToken ? wsolToSolToken(quoteToken) : undefined}
            value={tokenAmount.quote}
            onChange={(val) => setTokenAmount((prev) => ({ ...prev, quote: val }))}
            onTokenChange={(token) => handleSelectToken(token, 'output')}
          />
        </Flex>
      </Flex>

      <Flex direction="column" w="full" align={'flex-start'} gap={3}>
        <HStack gap={1}>
          <Text fontWeight="medium" fontSize="sm">
            {t('clmm.initial_price')}
          </Text>
          <QuestionToolTip iconType="question" label={t('create_standard_pool.initial_price_tooltip')} />
        </HStack>
        <DecimalInput
          postFixInField
          variant="filledDark"
          readonly
          value={currentPrice}
          inputSx={{ pl: '4px', fontWeight: 500, fontSize: ['md', 'xl'] }}
          ctrSx={{ bg: colors.backgroundDark, borderRadius: 'xl', pr: '14px', py: '6px' }}
          inputGroupSx={{ w: '100%', bg: colors.backgroundDark, alignItems: 'center', borderRadius: 'xl' }}
          postfix={
            <Text variant="label" size="sm" whiteSpace="nowrap" color={colors.textTertiary}>
              {baseIn ? quoteSymbol : baseSymbol}/{baseIn ? baseSymbol : quoteSymbol}
            </Text>
          }
        />
        <HStack spacing={1}>
          <Text fontWeight="400" fontSize="sm" color={colors.textTertiary}>
            {t('create_standard_pool.current_price')}:
          </Text>
          <Text pl={1} fontSize="sm" color={colors.textSecondary} fontWeight="medium">
            1 {baseIn ? baseSymbol : quoteSymbol} ≈ {currentPrice || '-'} {baseIn ? quoteSymbol : baseSymbol}
          </Text>
          <Box
            padding="1px"
            border={`1px solid ${colors.secondary}`}
            borderRadius="2px"
            width={'fit-content'}
            height={'fit-content'}
            lineHeight={0}
          >
            <HorizontalSwitchSmallIcon fill={colors.secondary} cursor="pointer" onClick={() => setBaeIn((val) => !val)} />
          </Box>
        </HStack>
      </Flex>

      {/* start time */}
      <Flex direction="column" w="full" gap={3}>
        <Text fontWeight="medium" textAlign="left" fontSize="sm">
          {t('field.start_time')}:
        </Text>
        <Tabs
          w="full"
          tabListSX={{ display: 'flex' }}
          tabItemSX={{ flex: 1, fontWeight: 400, fontSize: '12px', py: '4px' }}
          variant="squarePanelDark"
          value={startDateMode}
          onChange={(val) => {
            setStartDateMode(val)
            if (val === 'now') setStartDate(undefined)
            else setStartDate(dayjs().add(10, 'minutes').toDate())
          }}
          items={[
            {
              value: 'now',
              label: t('create_standard_pool.start_now')
            },
            {
              value: 'custom',
              label: t('create_standard_pool.custom')
            }
          ]}
        />
        {isStartNow ? null : (
          <div ref={popperRef}>
            <DecimalInput
              postFixInField
              readonly
              onClick={onPopperOpen}
              variant="filledDark"
              value={startDate ? dayjs(startDate).format('YYYY/MM/DD') : ''}
              ctrSx={{ bg: colors.backgroundDark, borderRadius: 'xl', pr: '14px', py: '6px' }}
              inputGroupSx={{ w: 'fit-content', bg: colors.backgroundDark, alignItems: 'center', borderRadius: 'xl' }}
              inputSx={{ pl: '4px', fontWeight: 500, fontSize: ['md', 'xl'] }}
              postfix={
                <Text variant="label" size="sm" whiteSpace="nowrap" fontSize="xl" fontWeight="normal" color={colors.textSecondary}>
                  {startDate ? dayjs(startDate).utc().format('HH:mm (UTC)') : ''}
                </Text>
              }
            />
            {isPopperOpen && (
              <FocusTrap
                active
                focusTrapOptions={{
                  initialFocus: false,
                  allowOutsideClick: true,
                  clickOutsideDeactivates: true,
                  onDeactivate: closePopper
                }}
              >
                <Box
                  tabIndex={-1}
                  style={{
                    ...popper.styles.popper,
                    zIndex: 3
                  }}
                  className="dialog-sheet"
                  {...popper.attributes.popper}
                  ref={setPopperElement}
                  role="dialog"
                  aria-label="DayPicker calendar"
                  bg={colors.backgroundDark}
                  rounded={'xl'}
                >
                  <DatePick
                    initialFocus={isPopperOpen}
                    mode="single"
                    selected={startDate || new Date()}
                    onSelect={(val) =>
                      setStartDate((preVal) =>
                        dayjs(val)
                          .set('hour', dayjs(preVal).hour())
                          .set(
                            'minute',
                            dayjs(preVal)
                              .add(preVal ? 0 : 10, 'minutes')
                              .minute()
                          )
                          .toDate()
                      )
                    }
                  />
                  <Flex>
                    <HourPick
                      sx={{ w: '100%', borderRadius: '0', fontSize: 'md', px: '20px' }}
                      value={dayjs(startDate).hour()}
                      onChange={(h) => setStartDate((val) => dayjs(val).set('h', h).toDate())}
                    />
                    <MinutePick
                      sx={{ w: '100%', borderRadius: '0', fontSize: 'md', px: '20px' }}
                      value={dayjs(startDate).minute()}
                      onChange={(m) => setStartDate((val) => dayjs(val).set('m', m).toDate())}
                    />
                  </Flex>
                  <Flex bg={colors.backgroundDark} px="10px" justifyContent="flex-end" borderRadius="0 0 10px 10px">
                    <Button variant="outline" size="sm" onClick={closePopper}>
                      {t('button.confirm')}
                    </Button>
                  </Flex>
                </Box>
              </FocusTrap>
            )}
          </div>
        )}
        <HStack color={colors.semanticWarning}>
          <Text fontWeight="medium" fontSize="sm" my="-2">
            {t('create_standard_pool.pool_creation_fee_note', { subject: '~0.2' })}
          </Text>
          <QuestionToolTip iconType="question" label={t('create_standard_pool.pool_creation_fee_tooltip')} />
        </HStack>
        <Text color="red" my="-2">
          {tokenAmount.base || tokenAmount.quote ? error : ''}
        </Text>
        {/* Pool Name */}
        <FormControl isRequired>
          <FormLabel>Pool Name</FormLabel>
          <Input value={poolName} onChange={(e) => setPoolName(e.target.value)} />
        </FormControl>

        {/* Pool Symbol */}
        <FormControl isRequired>
          <FormLabel>Pool Symbol</FormLabel>
          <Input value={poolSymbol} onChange={(e) => setPoolSymbol(e.target.value)} />
        </FormControl>

        {/* Pool Description */}
        <FormControl>
          <FormLabel>Pool Description</FormLabel>
          <Textarea
            value={poolDescription}
            onChange={(e) => setPoolDescription(e.target.value)}
            placeholder="Provide a brief description of your pool"
            resize="vertical"
          />
        </FormControl>

        {/* Pool Image */}
        <FormControl>
          <FormLabel>Pool Image</FormLabel>
          <Input type="file" accept="image/*" onChange={(e) => setPoolImage(e.target.files?.[0])} />
        </FormControl>

        {/* Pool URI */}
        <FormControl>
          <FormLabel>Pool URI</FormLabel>
          <Input value={poolUri} onChange={(e) => setPoolUri(e.target.value)} placeholder="https://example.com/pool-info" />
        </FormControl>

        {/* Website */}
        <FormControl>
          <FormLabel>Website</FormLabel>
          <Input value={website} onChange={handleWebsiteChange} placeholder="https://example.com" />
        </FormControl>

        {/* Twitter Handle */}
        <FormControl>
          <FormLabel>Twitter Handle</FormLabel>
          <Input value={twitterHandle} onChange={handleTwitterChange} placeholder="@username" />
        </FormControl>

        {/* Telegram Handle */}
        <FormControl>
          <FormLabel>Telegram Handle</FormLabel>
          <Input value={telegramHandle} onChange={handleTelegramChange} placeholder="@username or t.me/username" />
        </FormControl>

        {/* Discord Handle */}
        <FormControl>
          <FormLabel>Discord Handle</FormLabel>
          <Input value={discordHandle} onChange={handleDiscordChange} placeholder="username#0000" />
        </FormControl>

        {/* GitHub Handle */}
        <FormControl>
          <FormLabel>GitHub Handle</FormLabel>
          <Input value={githubHandle} onChange={handleGithubChange} placeholder="username" />
        </FormControl>
      </Flex>
      <HStack w="full" spacing={4} mt={2}>
        <Button w="full" isLoading={isLoading} isDisabled={!!error} onClick={onInitializeClick}>
          {t('create_standard_pool.button_initialize_liquidity_pool')}
        </Button>
      </HStack>
      {newCreatedPool ? <CreateSuccessModal ammId={newCreatedPool.poolId.toString()} /> : null}
      <TxErrorModal description="Failed to create pool. Please try again later." isOpen={isTxError} onClose={offTxError} />
    </VStack>
  )
}
