import { Flex, Text, Button, Skeleton } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import { routeToPage } from '@/utils/routeTools'
import useFetchStakePools from '@/hooks/pool/useFetchStakePools'
import Decimal from 'decimal.js'
import toApr from '@/utils/numberish/toApr'
import { colors } from '@/theme/cssVariables/colors'
import { panelCard } from '@/theme/cssBlocks'

import { PublicKey } from '@solana/web3.js'

export default function MyPositionTabStaked({
  allFarmBalances,
  farmLpBasedData,
  refreshTag
}: {
  allFarmBalances: any[]
  farmLpBasedData: Map<string, any>
  refreshTag: number
}) {
  const { t } = useTranslation()
  const { activeStakePools, isLoading } = useFetchStakePools({ refreshTag })

  const pool = activeStakePools[0]
  const ataBalance = allFarmBalances.find((f) => f.id === pool?.id)

  const v1Vault = farmLpBasedData.get(pool?.lpMint.address || '')?.data.find((d:any) => d.version === 'V1' && !new Decimal(d.lpAmount).isZero())

  const res = ataBalance?.hasDeposited || (v1Vault && !new Decimal(v1Vault.lpAmount).isZero()) ? ataBalance : { hasDeposited: !!v1Vault, deposited: v1Vault?.lpAmount || '0', pendingRewards: [ '0'], vault: PublicKey.default }

  return (
    <Flex direction="column" gap={4}>
      {pool && res && res.hasDeposited ? (
       <></>
      ) : (
        <Flex
          {...panelCard}
          alignItems="center"
          justifyContent="center"
          minH="200px"
          flexDir="column"
          py={5}
          px={8}
          bg={colors.backgroundLight}
          gap={6}
          borderRadius="xl"
        >
          {isLoading ? (
            <Skeleton height="100px" w="full" borderRadius="xl" />
          ) : (
            <>
              <Text variant="title" fontSize="sm">
                {t('portfolio.no_staked_farm')}
              </Text>
              <Button onClick={() => routeToPage('staking')}>{t('common.go_to_staking')}</Button>
            </>
          )}
        </Flex>
      )}
    </Flex>
  )
}
