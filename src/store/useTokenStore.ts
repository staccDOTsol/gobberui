import { PublicKey } from '@solana/web3.js'
import { MintLayout, RawMint } from '@solana/spl-token'
import { TokenInfo, JupTokenType, ApiV3Token } from '@raydium-io/raydium-sdk-v2'
import createStore from './createStore'
import { useAppStore } from './useAppStore'
import { getStorageItem, setStorageItem } from '@/utils/localStorage'
import logMessage from '@/utils/log'
export const EXTRA_TOKEN_KEY = '_r_cus_t_'

export interface TokenPrice {
  value: number
}

export interface TokenStore {
  tokenList: TokenInfo[]
  displayTokenList: TokenInfo[]
  tokenMap: Map<string, TokenInfo>
  tokenPriceRecord: Map<
    string,
    {
      fetchTime: number
      data?: TokenPrice
    }
  >
  mintGroup: { official: Set<string>; jup: Set<string> }
  extraLoadedTokenList: TokenInfo[]
  whiteListMap: Set<string>

  loadTokensAct: (forceUpdate?: boolean, jupTokenType?: JupTokenType) => void
  setDisplayTokenListAct: () => void
  setExtraTokenListAct: (props: { token: TokenInfo; addToStorage?: boolean; update?: boolean }) => void
  unsetExtraTokenListAct: (token: TokenInfo) => void

  getChainTokenInfo: (mint: string | PublicKey) => Promise<RawMint | undefined>
  getTokenDecimal: (mint: string | PublicKey, tokenInfo?: RawMint) => Promise<number>
  isVerifiedToken: (props: { mint: string | PublicKey; tokenInfo?: ApiV3Token; useWhiteList?: boolean }) => Promise<boolean>
}

const initTokenSate = {
  tokenList: [],
  displayTokenList: [],
  extraLoadedTokenList: [],
  tokenMap: new Map(),
  tokenPriceRecord: new Map(),
  mintGroup: { official: new Set<string>(), jup: new Set<string>() },
  whiteListMap: new Set<string>()
}

export const cachedTokenInfo: Map<string, RawMint> = new Map()

const createMarketWhiteList = [
  { mint: 'Fishy64jCaa3ooqXw7BHtKvYD8BTkSyAPh6RNE3xZpcN', decimals: 6, is2022Token: false },
  { mint: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', decimals: 8, is2022Token: false },
  { mint: '33eWALS9GkzSMS3EsKSdYCsrUiMdQDgX2QzGx4vA9wE8', decimals: 8, is2022Token: false },
  { mint: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6', decimals: 6, is2022Token: false },
  { mint: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', decimals: 6, is2022Token: false }
]

export const setTokenToStorage = (token: TokenInfo) => {
  const storageTokenList: (TokenInfo & { time?: number })[] = JSON.parse(getStorageItem(EXTRA_TOKEN_KEY) || '[]')
  if (storageTokenList.some((t) => t.address === token.address)) return
  setStorageItem(
    EXTRA_TOKEN_KEY,
    JSON.stringify(
      storageTokenList.concat([
        {
          ...token,
          time: Date.now()
        }
      ])
    )
  )
}

export const unsetTokenToStorage = (token: TokenInfo) => {
  const storageTokenList: TokenInfo[] = JSON.parse(getStorageItem(EXTRA_TOKEN_KEY) || '[]')
  setStorageItem(EXTRA_TOKEN_KEY, JSON.stringify(storageTokenList.filter((t) => t.address !== token.address)))
}

export const getStorageToken = (mint: string): TokenInfo | undefined => {
  const storageTokenList: (TokenInfo & { time?: number })[] = JSON.parse(getStorageItem(EXTRA_TOKEN_KEY) || '[]')
  const cacheInfo = storageTokenList.find((t) => t.address === mint)
  return cacheInfo
}

export const useTokenStore = createStore<TokenStore>(
  (set, get) => ({
    ...initTokenSate,
    loadTokensAct: (forceUpdate?: boolean, jupTokenType?: JupTokenType) => {
      console.log('loadTokensAct called with forceUpdate:', forceUpdate, 'jupTokenType:', jupTokenType);
      const raydium = useAppStore.getState().raydium
      console.log('Raydium instance:', raydium);
      if (!raydium) {
        console.log('Raydium not available, returning');
        return;
      }
      const action = { type: 'loadTokensAct' }
      const type = jupTokenType || JupTokenType.Strict

      useAppStore.setState({ jupTokenType: type }, false, action)
      console.log('JupTokenType set to:', type);

      const update = !!forceUpdate || useAppStore.getState().jupTokenType !== type
      console.log('Update flag:', update);

      raydium.token.load({ forceUpdate: update, type }).then(() => {
        console.log('Token load completed');
        get().extraLoadedTokenList.forEach((t) => {
          const existed = raydium.token.tokenMap.has(t.address)
          console.log('Processing extra token:', t.address, 'Existed:', existed);
          if (!existed) {
            raydium.token.tokenList.push(t)
            raydium.token.tokenMap.set(t.address, t)
            raydium.token.mintGroup.official.add(t.address)
            console.log('Added extra token to raydium token lists');
          }
        })
        const tokenMap = new Map(Array.from(raydium.token.tokenMap))
        const tokenList = (JSON.parse(JSON.stringify(raydium.token.tokenList)) as TokenInfo[]).map((t) => {
          if (t.type === 'jupiter') {
            console.log('Processing Jupiter token:', t.address);
            const newInfo = { ...t, logoURI: t.logoURI ? `https://wsrv.nl/?w=48&h=48&url=${t.logoURI}` : t.logoURI }
            tokenMap.set(t.address, newInfo)
            return newInfo
          }
          return t
        })
        console.log('Setting new token state');
        set(
          {
            tokenList,
            tokenMap,
            mintGroup: raydium.token.mintGroup,
            whiteListMap: new Set(Array.from(raydium.token.whiteListMap))
          },
          false,
          action
        )
        get().setDisplayTokenListAct()
      })
    },

    setDisplayTokenListAct: () => {
      console.log('setDisplayTokenListAct called');
      const { raydium, displayTokenSettings, jupTokenType } = useAppStore.getState()
      console.log('Current settings:', { displayTokenSettings, jupTokenType });
      if (!raydium) {
        console.log('Raydium not available, returning');
        return;
      }
      const isJupAll = jupTokenType === JupTokenType.ALL
      console.log('isJupAll:', isJupAll);
      set(
        {
          displayTokenList: get().tokenList.filter((token) => {
            const isOfficial = displayTokenSettings.official && get().mintGroup.official.has(token.address);
            const isJup = displayTokenSettings.jup && raydium.token.mintGroup.jup.has(token.address) && (isJupAll || !token.tags.includes('unknown'));
            console.log('Filtering token:', token.address, 'isOfficial:', isOfficial, 'isJup:', isJup);
            return isOfficial || isJup;
          })
        },
        false,
        { type: 'setDisplayTokenListAct' }
      )
      console.log('Display token list updated');
    },
    setExtraTokenListAct: ({ token, addToStorage = true, update }) => {
      console.log('setExtraTokenListAct called with token:', token.address, 'addToStorage:', addToStorage, 'update:', update);
      const { tokenList, tokenMap, mintGroup, extraLoadedTokenList, setDisplayTokenListAct } = get()

      if (tokenMap.has(token.address) && !update) {
        console.log('Token already exists and update not requested, returning');
        return;
      }
      tokenMap.set(token.address, token)
      mintGroup.official.add(token.address)
      console.log('Token added to tokenMap and mintGroup');

      set({
        tokenList: tokenList.some((t) => t.address === token.address)
          ? tokenList.map((t) => (t.address === token.address ? token : t))
          : [...tokenList, token],
        tokenMap: new Map(Array.from(tokenMap)),
        mintGroup: {
          official: new Set(Array.from(mintGroup.official)),
          jup: mintGroup.jup
        },
        extraLoadedTokenList: extraLoadedTokenList.some((t) => t.address === token.address)
          ? extraLoadedTokenList.map((t) => (t.address === token.address ? token : t))
          : [...extraLoadedTokenList, token]
      })
      console.log('Token lists updated');
      setDisplayTokenListAct()
      if (addToStorage && token.type === 'unknown') {
        console.log('Adding token to storage');
        setTokenToStorage(token)
      }
    },
    unsetExtraTokenListAct: (token) => {
      console.log('unsetExtraTokenListAct called with token:', token.address);
      const { tokenList, tokenMap, mintGroup, extraLoadedTokenList, setDisplayTokenListAct } = get()
      if (!get().tokenMap.has(token.address)) {
        console.log('Token not found in tokenMap, returning');
        return;
      }
      tokenMap.set(token.address, { ...token, userAdded: false })
      console.log('Token marked as not user-added');
      set({
        tokenList: [...tokenList.map((t) => (t.address === token.address ? { ...token, userAdded: false } : t))],
        tokenMap: new Map(Array.from(tokenMap)),
        mintGroup: {
          official: new Set(Array.from(mintGroup.official)),
          jup: mintGroup.jup
        },
        extraLoadedTokenList: extraLoadedTokenList.filter((t) => t.address !== token.address)
      })
      console.log('Token lists updated');
      setDisplayTokenListAct()
      console.log('Removing token from storage');
      unsetTokenToStorage(token)
    },
    getChainTokenInfo: async (mint) => {
      console.log('getChainTokenInfo called for mint:', mint);
      const cacheData = cachedTokenInfo.get(mint.toString())
      if (cacheData) {
        console.log('Token info found in cache');
        return cacheData;
      }
      const connection = useAppStore.getState().connection
      if (!connection) {
        console.log('No connection available, returning');
        return;
      }
      console.log('Fetching token info from RPC');
      const accountData = await connection.getAccountInfo(new PublicKey(mint), { commitment: useAppStore.getState().commitment })
      if (!accountData || accountData.data.length !== MintLayout.span) {
        console.log('Invalid account data received');
        return;
      }
      const tokenInfo = MintLayout.decode(accountData.data)
      console.log('Token info decoded:', tokenInfo);
      cachedTokenInfo.set(mint.toString(), tokenInfo)
      return tokenInfo
    },
    getTokenDecimal: async (mint, tokenInfo) => {
      console.log('getTokenDecimal called for mint:', mint);
      const { tokenMap, getChainTokenInfo } = get()
      const token = tokenMap.get(mint.toString())
      if (tokenInfo) {
        console.log('Token info provided, returning decimals:', tokenInfo.decimals);
        return tokenInfo.decimals;
      }
      if (token) {
        console.log('Token found in tokenMap, returning decimals:', token.decimals);
        return token.decimals;
      }
      console.log('Fetching token info from chain');
      const info = await getChainTokenInfo(mint.toString())
      console.log('Chain token info:', info);
      return info?.decimals ?? 0
    },

    isVerifiedToken: async ({ mint, tokenInfo, useWhiteList = false }) => {
      console.log('isVerifiedToken called for mint:', mint, 'useWhiteList:', useWhiteList);
      const { getChainTokenInfo, mintGroup } = get()
      const mintStr = mint.toString()
      const tokenData = tokenInfo ? undefined : await getChainTokenInfo(mint)
      console.log('Token data:', tokenData);
      if (!tokenData) {
        console.log('No token data available, returning false');
        return false;
      }
      const isWhiteList = useWhiteList && createMarketWhiteList.some((d) => d.mint === mint)
      console.log('Is whitelisted:', isWhiteList);
      const isFreezed = !isWhiteList && (tokenInfo?.tags.includes('hasFreeze') || tokenData?.freezeAuthorityOption === 1)
      console.log('Is freezed:', isFreezed);

      const isAPIToken = mintGroup.official.has(mintStr) || mintGroup.jup.has(mintStr)
      console.log('Is API token:', isAPIToken);
      if (tokenData.decimals !== null && !isAPIToken && isFreezed) {
        console.log('Token not verified due to decimals, API status, or freeze status');
        return false;
      }

      console.log('Token verified');
      return true
    }
  }),
  'useTokenStore'
)
