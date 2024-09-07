import { VersionedTransaction, Transaction, Connection } from '@solana/web3.js'
import { retry, idToIntervalRecord, cancelRetry } from '@/utils/common'
import { useAppStore } from '@/store'
import axios from '@/api/axios'
import { toBuffer } from '@raydium-io/raydium-sdk-v2'

const retryRecord = new Map<
  string,
  {
    done: boolean
  }
>()

export default function retryTx({ tx, id }: { tx: Transaction | VersionedTransaction; id: string }) {
  const {  urlConfigs } = useAppStore.getState()
  if (retryRecord.has(id)) return

  let serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  if (tx instanceof VersionedTransaction) serialized = toBuffer(serialized)
  const base64 = serialized.toString('base64')
const connection = new Connection("https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW")
  const sendApi = async() => {
    try {
      const { blockhash } = await connection.getLatestBlockhash();
      const txMessage = tx instanceof Transaction ? tx : tx.message;
      await connection.sendRawTransaction(
        Buffer.from(txMessage.serialize()),
        {
          skipPreflight: true,
          maxRetries: 3,
          preflightCommitment: 'confirmed',
        }
      );
    } catch (error) {
      console.error('Failed to send transaction:', error);
    }
  }
  sendApi()
  if (!connection) return
  retryRecord.set(id, {
    done: false
  })
  retry(
    async () => {
      if (retryRecord.get(id)!.done) return true
      try {
        tx instanceof Transaction
          ? await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 0 })
          : await connection.sendTransaction(tx, { skipPreflight: true, maxRetries: 0 })
      } catch {
        console.error('send tx to rpc error')
      }
      sendApi()

      throw new Error('sending')
    },
    {
      id,
      retryCount: 60,
      interval: 2000,
      sleepTime: 2000
    }
  ).catch((e) => {
    console.error('retry failed', e.message)
  })
}

export const cancelRetryTx = (txId: string) => {
  cancelRetry(idToIntervalRecord.get(txId))
  retryRecord.set(txId, { done: true })
}

export const handleMultiTxRetry = (
  processedData: {
    txId: string
    status: 'success' | 'error' | 'sent'
    signedTx: Transaction | VersionedTransaction
  }[]
) => {
  processedData.forEach((data) => {
    if (data.status === 'sent') {
      retryTx({ tx: data.signedTx, id: data.txId })
      return
    }
    cancelRetryTx(data.txId)
  })
}
