import { useEffect } from 'react'
import { useAppStore, useClmmStore } from '@/store'

function FarmEditPage() {
  const raydium = useAppStore((s) => s.raydium)
  const loadAddRewardWhiteListAct = useClmmStore((s) => s.loadAddRewardWhiteListAct)

  useEffect(() => {
    raydium && loadAddRewardWhiteListAct({ checkFetch: true })
  }, [loadAddRewardWhiteListAct, raydium])

  return (<></>)
}

export default FarmEditPage

export async function getStaticProps() {
  return {
    props: { title: 'Edit Farm' }
  }
}
