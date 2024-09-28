import { NextApiRequest, NextApiResponse } from 'next'
import NodeCache from 'node-cache'

// Initialize cache with a default TTL of 5 minutes
const cache = new NodeCache({ stdTTL: 300 })

const fetchWithExponentialBackoff = async (url: string, options: RequestInit, retries = 5, delay = 1000) => {
  try {
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying... (${retries} retries left)`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return fetchWithExponentialBackoff(url, options, retries - 1, delay * 2)
    } else {
      throw error
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { url, options, cacheKey } = req.body

  if (!url || !cacheKey) {
    return res.status(400).json({ message: 'Missing required parameters' })
  }

  try {
    // Check cache first
    const cachedData = cache.get(cacheKey)
    if (cachedData) {
      return res.status(200).json({ data: cachedData, cached: true })
    }

    // If not in cache, fetch data
    const data = await fetchWithExponentialBackoff(url, options)

    // Store in cache
    cache.set(cacheKey, data)

    res.status(200).json({ data, cached: false })
  } catch (error) {
    console.error('Error in fetchWithCache:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
