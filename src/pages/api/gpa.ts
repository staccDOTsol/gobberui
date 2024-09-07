import { NextApiRequest, NextApiResponse } from 'next'
import { Connection, PublicKey } from '@solana/web3.js'
import { CpmmPoolInfoLayout, fetchMultipleMintInfos } from '@raydium-io/raydium-sdk-v2'
import Decimal from 'decimal.js-light'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fetchMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { publicKey } from '@metaplex-foundation/umi'

const PAGE_SIZE = 100

async function fetchProgramAccounts(connection: Connection, programId: string) {
  const accounts = await connection.getProgramAccounts(new PublicKey(programId), {
    encoding: "base64",
    filters: [{ dataSize: 741 }]
  })
  return accounts.filter((account: any) => account.pubkey.toString() !== 'AJBTtXxDzoUtZrEPS7ZR5H18gYpLK4r9BH4AxCWD7v1y');
}

// Initialize an in-memory cache
const inMemoryCache = new Map();

// Function to get data from in-memory cache
function getFromCache(key: string) {
  const cachedItem = inMemoryCache.get(key);
  if (cachedItem && Date.now() - cachedItem.timestamp < 5 * 60 * 1000) {
    return cachedItem.data;
  }
  return null;
}

// Function to set data in in-memory cache
function setInCache(key: string, data: any) {
  inMemoryCache.set(key, {
    data,
    timestamp: Date.now()
  });
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  

    const { idList } = req.method === 'POST' ? req.body : req.query;
  
    
    if (!idList || idList.length === 0) {
      // Check for a cached response for all pools
      const cacheKey = 'all_pools';
      const cachedData = getFromCache(cacheKey);
      if (cachedData) {
        // If cache exists and is not too old, return it
        res.status(200).json(JSON.parse(cachedData));
        return;
      }
    }

    const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW');
    const accounts = await fetchProgramAccounts(connection, 'CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj');
    
    const poolData = []

    // Check if idList is empty
 

    for (const acc of accounts) {
      if (idList?.includes(acc.pubkey.toString()) || idList?.length == 0) {
          // Check if we have a cached response for this pool
          const cacheKey = `pool_${acc.pubkey.toString()}`;
          const cachedPool = getFromCache(cacheKey);
          if (cachedPool) {
            poolData.push(JSON.parse(cachedPool));
            continue;
          }
        const decodedData = CpmmPoolInfoLayout.decode(acc.account.data)
        const [mintB, mintA, lpMint] = await Promise.all([
          fetchMultipleMintInfos({connection, mints:[decodedData.mintB]}),
          fetchMultipleMintInfos({connection, mints:[decodedData.mintA]}),
          fetchMultipleMintInfos({connection, mints:[decodedData.mintLp]})
        ])

        const [balanceA, balanceB] = await Promise.all([
          connection.getTokenAccountBalance(decodedData.vaultA),
          connection.getTokenAccountBalance(decodedData.vaultB)
        ])


        const pool = {
          type: "Standard",
          programId: "CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj",
          id: acc.pubkey.toString(),
          mintA: {
            chainId: 101,
            logoURI: "",
            symbol: "",
            name: "",
            tags: [],
            extensions: {},
            ...(mintA[decodedData.mintA.toBase58()] || {}),
            programId: mintA[decodedData.mintA.toBase58()]?.programId?.toBase58() || "",
            address: decodedData.mintA.toBase58(),
            metadata: "",
            uriMetadata: ""
          },
          mintB: {
            chainId: 101,
            logoURI: "",
            symbol: "",
            name: "",
            tags: [],
            extensions: {},
            ...(mintB[decodedData.mintB.toBase58()] || {}),
            programId: mintB[decodedData.mintB.toBase58()]?.programId?.toBase58() || "",
            address: decodedData.mintB.toBase58(),
            metadata: "",
            uriMetadata: ""
          },
          lpMint: {
            chainId: 101,
            logoURI: "",
            symbol: "",
            name: "",
            tags: [],
            extensions: {},
            ...lpMint[decodedData.mintLp.toBase58()],
            programId: lpMint[decodedData.mintLp.toBase58()]?.programId?.toBase58() || "",
            address: decodedData.mintLp.toBase58(),
            metadata: "",
            uriMetadata: ""
          },
          price: new Decimal(1).pow(2).toNumber(),
          mintAmountA: new Decimal(balanceA.value.amount).div(new Decimal(10).pow(decodedData.mintDecimalA)).toNumber(),
          mintAmountB: new Decimal(balanceB.value.amount).div(new Decimal(10).pow(decodedData.mintDecimalB)).toNumber(),
          lpPrice: 569.4747783017777,
          lpAmount: 4106.419887059,
          rewardDefaultInfos: [],
          farmUpcomingCount: 0,
          farmOngoingCount: 0,
          farmFinishedCount: 0,
          pooltype: [],
          rewardDefaultPoolInfos: "Raydium",
          feeRate: 0.0025,
          openTime: "0",
          tvl: 2338502.55,
          day: {
            volume: 315483131.8427547,
            volumeQuote: 11427290160.496674,
            volumeFee: 788707.8296068838,
            apr: 12310.37,
            feeApr: 12310.37,
            priceMin: 1403.822192872823,
            priceMax: 3031743.18992,
            rewardApr: []
          },
          week: {
            volume: 341421107.1899102,
            volumeQuote: 12505067092.7243,
            volumeFee: 853552.7679747725,
            apr: 1095,
            feeApr: 1095,
            priceMin: 1403.822192872823,
            priceMax: 3031743.18992,
            rewardApr: []
          },
          month: {
            volume: 341421107.1899102,
            volumeQuote: 12505067092.7243,
            volumeFee: 853552.7679747725,
            apr: 438,
            feeApr: 438,
            priceMin: 1403.822192872823,
            priceMax: 3031743.18992,
            rewardApr: []
          }
        }
// @ts-ignore
        pool.allApr = {
          day: [pool.day],
          week: [pool.week],
          month: [pool.month]
        }
        // @ts-ignore
        delete pool.lpMint.tlvData;
        // @ts-ignore
        delete pool.mintA.tlvData;
        // @ts-ignore
        delete pool.mintB.tlvData;
// @ts-ignore
pool.mintA.mintAuthority = pool.mintA.mintAuthority?.toBase58()
// @ts-ignore
        pool.mintA.freezeAuthority = pool.mintA.freezeAuthority?.toBase58()
        // @ts-ignore
        pool.mintB.mintAuthority = pool.mintB.mintAuthority?.toBase58()
        // @ts-ignore
        pool.mintB.freezeAuthority = pool.mintB.freezeAuthority?.toBase58()
        // @ts-ignore
        pool.lpMint.mintAuthority = pool.lpMint.mintAuthority?.toBase58()
        // @ts-ignore
        pool.lpMint.freezeAuthority = pool.lpMint.freezeAuthority?.toBase58()
        // Calculate and add supply for mintA, mintB, and lpMint
        // @ts-ignore
        pool.mintA.supply = new Decimal(pool.mintA.supply.toString()).div(new Decimal(10).pow(pool.mintA.decimals)).toString();
        // @ts-ignore
        pool.mintB.supply = new Decimal(pool.mintB.supply.toString()).div(new Decimal(10).pow(pool.mintB.decimals)).toString();
        // @ts-ignore
        pool.lpMint.supply = new Decimal(pool.lpMint.supply.toString()).div(new Decimal(10).pow(pool.lpMint.decimals)).toString();

        poolData.push(pool)

    // Cache the result if it's newer than the existing cache
    // Save the poolData to cache using setInCache function
    await setInCache(cacheKey, JSON.stringify(pool));
    await setInCache(`${cacheKey}:timestamp`, Date.now().toString());

      }
    }
    // Cache the result
    const cacheKey = 'all_pools';
    await setInCache(cacheKey, JSON.stringify(poolData));
    await setInCache(`${cacheKey}:timestamp`, Date.now().toString());
    res.status(200).json(poolData)
}
