'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/router'
import { PublicKey, Transaction } from '@solana/web3.js'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"
import BN from 'bn.js'
import { CurveLaunchpad } from "../components/types/curve_launchpad"
import * as IDL from "../components/types/curve_launchpad.json"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function TokenDetails() {
  const router = useRouter()
  const { mintAddress } = router.query
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const [amount, setAmount] = useState('')
  const [isBuying, setIsBuying] = useState(false)
  const [isSelling, setIsSelling] = useState(false)
  const [candlestickData, setCandlestickData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const program = wallet ? new Program<CurveLaunchpad>(IDL as any, new AnchorProvider(connection, wallet, {})) : null

  const handleBuy = useCallback(async () => {
    if (!program || !wallet || !mintAddress) return
    setIsBuying(true)
    try {
      const tokenAmount = new BN(amount)
      const maxSolAmount = new BN(Number.MAX_SAFE_INTEGER) // This should be calculated based on your AMM logic
      const ix = await program.methods
        .buy(tokenAmount, maxSolAmount)
        .accounts({
          user: wallet.publicKey,
          mint: new PublicKey(mintAddress as string),
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          program: program.programId,
        })
        .instruction()
      const tx = new Transaction().add(ix)
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
      const signed = await wallet.signTransaction(tx)
      const txSignature = await connection.sendRawTransaction(signed.serialize())
      console.log('Buy transaction:', txSignature)
    } catch (error) {
      console.error('Error buying token:', error)
      setError('Failed to buy token. Please try again.')
    } finally {
      setIsBuying(false)
    }
  }, [program, wallet, connection, mintAddress, amount])

  const handleSell = useCallback(async () => {
    if (!program || !wallet || !mintAddress) return
    setIsSelling(true)
    try {
      const tokenAmount = new BN(amount)
      const minSolAmount = new BN(0) // This should be calculated based on your AMM logic
      const ix = await program.methods
        .sell(tokenAmount, minSolAmount)
        .accounts({
          user: wallet.publicKey,
          mint: new PublicKey(mintAddress as string),
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          program: program.programId,
        })
        .instruction()
      const tx = new Transaction().add(ix)
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
      const signed = await wallet.signTransaction(tx)
      const txSignature = await connection.sendRawTransaction(signed.serialize())
      console.log('Sell transaction:', txSignature)
    } catch (error) {
      console.error('Error selling token:', error)
      setError('Failed to sell token. Please try again.')
    } finally {
      setIsSelling(false)
    }
  }, [program, wallet, connection, mintAddress, amount])

  useEffect(() => {
    const fetchCandlestickData = async () => {
      if (!mintAddress) return
      try {
        setIsLoading(true)
        const response = await fetch(`/api/candlesticks?mint=${mintAddress}&timeframe=1s`)
        if (!response.ok) {
          throw new Error('Failed to fetch candlestick data')
        }
        const data = await response.json()
        setCandlestickData(data)
      } catch (error) {
        console.error('Error fetching candlestick data:', error)
        setError('Failed to load token data. Please try again later.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchCandlestickData()
    const interval = setInterval(fetchCandlestickData, 60000) // Fetch every minute

    return () => clearInterval(interval)
  }, [mintAddress])

  if (isLoading) {
    return <div className="text-center py-8">Loading token data...</div>
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">{error}</div>
  }

  if (!mintAddress) {
    return <div className="text-center py-8">Invalid token address</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8 text-center">Token Details</h1>
      <div className="max-w-md mx-auto">
        <div className="mb-4">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            type="number"
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div className="flex gap-4 mb-8">
          <button
            onClick={handleBuy}
            disabled={isBuying}
            className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:bg-gray-400"
          >
            {isBuying ? 'Buying...' : 'Buy'}
          </button>
          <button
            onClick={handleSell}
            disabled={isSelling}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:bg-gray-400"
          >
            {isSelling ? 'Selling...' : 'Sell'}
          </button>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={candlestickData}>
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="close" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}