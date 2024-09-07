import { Box, Card, VStack, Text } from '@chakra-ui/react'

export default function DisclaimerPage() {
  return (
    <Box
      p={{ base: '2', md: '44' }}
      minHeight="100vh"
      backgroundImage="url('/images/disclaimer-page-bg.webp')"
      backgroundColor="#141041"
      backgroundSize="100% 100%"
      backgroundRepeat="no-repeat"
      display="flow-root"
    >
      <Card
        sx={{
          '--card-bg': 'transparent'
        }}
        rounded={{ base: 'xl', md: '3xl' }}
        py={{ base: '4', md: '12' }}
        px={{ base: '4', md: '24' }}
        mx="auto"
        maxW="6xl"
        position="relative"
        color="white"
        bgGradient="linear(162deg, rgba(255, 255, 255, 0.12) 28.7%, transparent)"
        isolation="isolate"
        _before={{
          content: '""',
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          opacity: 0.7,
          bg: 'transparent',
          borderRadius: 'inherit',
          boxShadow: `inset 0 0 0 1.5px white`,
          maskImage: `
            radial-gradient(at -31% -58%, rgba(0, 0, 0, 0.5) 34%, transparent 60%),
            linear-gradient(to left, rgba(0, 0, 0, 0.2) 0%, transparent 13%),
            linear-gradient(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.05))
          `
        }}
      >
        <VStack spacing={{ base: '2', md: '4' }}>
          <Text mb={4} fontSize={{ base: '2xl', md: '5xl' }} textAlign="center">
            Disclaimer
          </Text>
          <Text color="#adc6ff" fontSize={{ base: 'sm', md: 'md' }} lineHeight={1.625}>
           heehee
          </Text>
        </VStack>
      </Card>
    </Box>
  )
}

export async function getStaticProps() {
  return {
    props: { title: 'Disclaimer' }
  }
}
