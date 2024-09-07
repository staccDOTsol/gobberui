import { AvatarProps, Box, Center, Image, forwardRef, useColorMode, Text } from '@chakra-ui/react'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { ApiV3Token } from '@raydium-io/raydium-sdk-v2'
import { colors } from '@/theme/cssVariables'
import useTokenInfo from '@/hooks/token/useTokenInfo'
import { fetchMetadata, Metadata, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata"
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { publicKey } from '@metaplex-foundation/umi'
import { PublicKey } from '@solana/web3.js'

export type TokenAvatarSize = 'xs' | 'sm' | 'smi' | 'md' | 'lg' | '2xl' | (string & {})

type RawTokenAvatarProps = {
  token?: ApiV3Token | Pick<ApiV3Token, 'address' | 'symbol' | 'decimals' | 'logoURI'>
  tokenMint?: string
  size?: TokenAvatarSize | TokenAvatarSize[]
  bgBlur?: boolean
  icon?: string
  name?: string
  haveHTMLTitle?: boolean
}

export type TokenAvatarProps = RawTokenAvatarProps & Omit<AvatarProps, keyof RawTokenAvatarProps>

const sizeMap = {
  xs: '16px',
  sm: '20px',
  smi: '24px',
  md: '32px',
  lg: '48px',
  '2xl': '80px'
}

const parseSize = (size: TokenAvatarSize) => sizeMap[size as keyof typeof sizeMap] || size

export default forwardRef(function TokenAvatar(
  { token: originalToken, tokenMint, icon, size = 'md', name, bgBlur, haveHTMLTitle, ...restProps }: TokenAvatarProps,
  ref
) {
  const { colorMode } = useColorMode()
  const isLight = colorMode !== 'dark'
  const [queryUrl, setQueryUrl] = useState(icon ?? '')
  const { tokenInfo } = useTokenInfo({ mint: tokenMint })
  const token = tokenInfo || originalToken
  async function fetchImageAsDataUrl(uri: any) {
    try {
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = 'application/octet-stream';
      const dataUrl = `data:${contentType};base64,${base64}`;
      console.log('Image as data URL:', dataUrl);
      return dataUrl;
    } catch (error) {
      console.error('Error fetching or processing image:', error);
    }
  }
  const [metadata, setMetadata] = useState<any>(null)
  const fetchTokenMetadata = useCallback(async () => {
    if (!token?.address || tokenInfo?.logoURI) return

    try {
      const umi = createUmi('https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW').use(mplTokenMetadata())
      const metadataPDA = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
          new PublicKey(token.address).toBuffer(),
        ],
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
      )[0]

      const metadata = await fetchMetadata(umi, publicKey(metadataPDA.toString()))
      setMetadata(metadata)
      if (metadata?.uri) {
        const jsonData = await fetchJsonData(metadata.uri)
        if (jsonData?.image) {
          let proxyUrl = jsonData.image
          const ipfsGateway = 'https://ipfs.io/ipfs/'
          
          if (jsonData.image.startsWith('ipfs://')) {
            proxyUrl = `${ipfsGateway}${jsonData.image.slice(7)}`
          } else if (jsonData.image.includes('/ipfs/')) {
            proxyUrl = `${ipfsGateway}${jsonData.image.substring(jsonData.image.indexOf('/ipfs/') + 6)}`
          } else if (jsonData.image.includes('.ipfs.nftstorage.link')) {
            const cid = jsonData.image.split('.ipfs.nftstorage.link')[0].split('/').pop()
            proxyUrl = `${ipfsGateway}${cid}`
          } else {
            proxyUrl = `https://gobbler.fun/cors/${jsonData.image}`
          }
          const dataUrl = await fetchImageAsDataUrl(proxyUrl);
          setQueryUrl(dataUrl || `https://gobbler.fun/cors/${jsonData.image}`);
        }
      }
    } catch (error) {
      console.error('Error fetching token metadata:', error)
    }
  }, [token?.address])

  const fetchJsonData = async (uri: string) => {
    try {
      const ipfsGateway = 'https://ipfs.io/ipfs/'
      
    let proxyUrl = uri
    
    if (uri.startsWith('ipfs://')) {
      proxyUrl = `${ipfsGateway}${uri.slice(7)}`
    } else if (uri.includes('/ipfs/')) {
      proxyUrl = `${ipfsGateway}${uri.substring(uri.indexOf('/ipfs/') + 6)}`
    } else if (uri.includes('.ipfs.nftstorage.link')) {
      const cid = uri.split('.ipfs.nftstorage.link')[0].split('/').pop()
      proxyUrl = `${ipfsGateway}${cid}`
    } else {
      proxyUrl = `https://gobbler.fun/cors/${uri}`
    }

    const response = await fetch(proxyUrl)
    if (response.ok) {
      return await response.json()
    } else {
      console.error('Failed to fetch JSON data:', response.status, response.statusText)
      return null
    }
    } catch (error) {
      console.error('Error fetching JSON data:', error)
    }
    return null
  }

  useEffect(() => {
    if (icon) {
      setQueryUrl(icon)
    } else {
      fetchTokenMetadata()
    }
  }, [icon, fetchTokenMetadata])

  const boxSize = useMemo(() => 
    Array.isArray(size) ? size.map(parseSize) : parseSize(size),
    [size]
  )

  return (
    <Box
      ref={ref}
      bg={colors.tokenAvatarBg}
      border={isLight ? `1px solid ${colors.primary}` : 'none'}
      minWidth={boxSize}
      minHeight={boxSize}
      maxWidth={boxSize}
      maxHeight={boxSize}
      borderRadius="50%"
      p={'.15em'}
      fontSize={boxSize}
      backdropFilter={bgBlur ? 'blur(2px)' : undefined}
      {...restProps}
    >
      <Box borderRadius="50%" aspectRatio={'1'} overflow="hidden">
        <Image
          objectFit="cover"
          src={tokenInfo?.logoURI || queryUrl}
          alt={name || token?.address}
          title={haveHTMLTitle && (name || token) ? `${name || token?.symbol || token?.address}` : undefined}
        />
        {(metadata?.symbol || tokenInfo?.symbol) && (
          <Center width="100%" height="100%" bg={colors.tokenAvatarBg}>
            <Text>
              {tokenInfo?.symbol || metadata?.symbol || ''}
            </Text>
          </Center>
        )}
      </Box>
    </Box>
  )
})
