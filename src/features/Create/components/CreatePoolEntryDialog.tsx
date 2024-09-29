import ListItem from '@/components/ListItem'
import { Desktop, Mobile } from '@/components/MobileDesktop'
import CircleCheck from '@/icons/misc/CircleCheck'
import { colors } from '@/theme/cssVariables'
import {
  Badge,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  UnorderedList,
  VStack
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'

type CreateTarget = 'standard-amm' | 'concentrated-liquidity' | 'standard-farm'

export function CreatePoolEntryDialog({
  isOpen,
  onClose,
  defaultType = 'concentrated-liquidity'
}: {
  isOpen: boolean
  onClose: () => void
  defaultType?: CreateTarget
}) {
  const router = useRouter()
  const [type, setType] = useState<CreateTarget>(defaultType)

  const onConfirm = useCallback(() => {
    const isStandardAmm = type === 'standard-amm'
    const isStandardFarm = type === 'standard-farm'
    const to = isStandardAmm ? '/liquidity/create-pool' : '/clmm/create-pool'
    router.push({
      pathname: to,
      query: {
        ...router.query
      }
    })
  }, [router, type])

  return (
    <>
      <Mobile>
        <CreatePoolEntryMobileDrawer isOpen={isOpen} onClose={onClose} onConfirm={onConfirm}>
          <CreatePoolEntryDialogBody type={type} onChange={setType} />
          <Button onClick={onConfirm}>Create</Button>
        </CreatePoolEntryMobileDrawer>
      </Mobile>
      <Desktop>
        <CreatePoolEntryModal isOpen={isOpen} onClose={onClose} onConfirm={onConfirm}>
          <CreatePoolEntryDialogBody type={type} onChange={setType} />
        </CreatePoolEntryModal>
      </Desktop>
    </>
  )
}

type CreatePoolEntryModalProps = {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode

  onConfirm?: () => void
}

function CreatePoolEntryModal({ isOpen, onClose, onConfirm, children }: CreatePoolEntryModalProps) {
  const { t } = useTranslation()
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t('create_pool.modal_title')}</ModalHeader>
        <ModalCloseButton />

        <ModalBody>{children}</ModalBody>

        <ModalFooter mt={8}>
          <VStack w="full">
            <Button w="full" onClick={onConfirm}>
              {t('button.continue')}
            </Button>
            <Button w="full" variant="ghost" onClick={onClose}>
              {t('button.cancel')}
            </Button>
          </VStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function CreatePoolEntryMobileDrawer({
  isOpen,
  onClose,
  onConfirm,
  children
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm?: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Drawer isOpen={isOpen} variant="popFromBottom" placement="bottom" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader>{t('create_pool.modal_title')}</DrawerHeader>
        <DrawerBody>{children}</DrawerBody>
        <DrawerFooter mt={4}>
          <VStack w="full">
            <Button w="full" onClick={onConfirm}>
              {t('button.continue')}
            </Button>
            <Button w="full" variant="ghost" onClick={onClose}>
              {t('button.cancel')}
            </Button>
          </VStack>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function CreatePoolEntryDialogBody({ type, onChange }: { type: CreateTarget; onChange: (val: CreateTarget) => void }) {
  const { t } = useTranslation()
  return (
    <Flex direction="column" gap={4}>
      <CreateBlock
        title={t('create_pool.modal_section_header_pool')}
        description={
          <Text>
            Create a liquidity pool for any token pair. The Fomo3D Raydium CP Swap Client offers a unique Solana-based AMM with features
            like:
            <UnorderedList spacing={2} mt={2}>
              <ListItem>Exponential LP token curve: Early liquidity providers potentially earn more rewards</ListItem>
              <ListItem>Flat-rate fees: Beneficial for larger trades (e.g. 0.000025 SOL and 0.025 USDC per trade)</ListItem>
              <ListItem>Customizable LP token metadata: Enhances utility in the broader DeFi ecosystem</ListItem>
              <ListItem>Constant product formula for token pricing</ListItem>
              <ListItem>Fee split between liquidity providers and protocol creator</ListItem>
            </UnorderedList>
          </Text>
        }
        selected={type === 'concentrated-liquidity' || type === 'standard-amm'}
        renderPoolType={
          type === 'concentrated-liquidity' || type === 'standard-amm'
            ? () => (
                <Stack flexDirection={['column', 'row']}>
                  <PoolTypeItem isActive={type === 'standard-amm'} name={'Coin + Pools'} onClickSelf={() => onChange('standard-amm')} />
                  <PoolTypeItem
                    isActive={type === 'concentrated-liquidity'}
                    name={'Fomo3d Memecoin Launch'}
                    onClickSelf={() => onChange('concentrated-liquidity')}
                  />
                </Stack>
              )
            : undefined
        }
        onClick={() => onChange('concentrated-liquidity')}
      />
    </Flex>
  )
}
function CreateBlock(props: {
  title: string
  description: React.ReactNode
  selected?: boolean
  onClick?: () => void
  detailLinkUrl?: string
  renderPoolType?: () => React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Box
      backgroundColor={colors.backgroundDark}
      p={4}
      borderRadius={8}
      position="relative"
      cursor="pointer"
      borderWidth="1.5px"
      borderColor={props.selected ? colors.secondary : 'transparent'}
      onClick={props.onClick}
    >
      <Flex justify={'space-between'}>
        <Text fontWeight="500">{props.title}</Text>
        {props.selected && <CircleCheck width={16} height={16} fill={colors.secondary} />}
      </Flex>

      <Box color={props.selected ? colors.textSecondary : colors.textTertiary} fontSize={'sm'}>
        {props.description}
      </Box>

      {props.renderPoolType && (
        <Box mt={2}>
          <Text fontSize={'sm'} mb={2}>
            {t('create_pool.modal_tab_label')}:
          </Text>
          {props.renderPoolType()}
        </Box>
      )}
    </Box>
  )
}

function PoolTypeItem({
  name,
  isActive,
  onClickSelf,
  isSuggested
}: {
  name: string
  isActive?: boolean
  onClickSelf?: () => void
  isSuggested?: boolean
}) {
  const domRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  useEffect(() => {
    domRef.current?.addEventListener('click', (ev) => {
      ev.stopPropagation()
      onClickSelf?.()
    })
  })
  return (
    <HStack
      ref={domRef}
      flexGrow={1}
      color={isActive ? colors.secondary : colors.textTertiary}
      bg={colors.backgroundTransparent12}
      px={3}
      py={1.5}
      rounded={'md'}
      position="relative"
    >
      {isSuggested && (
        <Box position={'absolute'} top={0} right={2} transform={'auto'} translateY={'-50%'}>
          <Badge variant="crooked">{t('badge.suggested')}</Badge>
        </Box>
      )}
      <Box display="grid" placeItems={'center'}>
        <Box gridRow={1} gridColumn={1} rounded="full" p="3px" bg={isActive ? colors.secondary : colors.textSecondary}></Box>
        <Box gridRow={1} gridColumn={1} rounded="full" p="8px" opacity={0.3} bg={isActive ? colors.secondary : colors.textSecondary}></Box>
      </Box>
      <Text whiteSpace="nowrap" fontSize="sm">
        {name}
      </Text>
    </HStack>
  )
}
