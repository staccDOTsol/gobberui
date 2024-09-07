import { SvgIcon } from '@/icons/type'

export default function Logo(props: SvgIcon) {
  const { width = 228, height = 60 } = props

  return (
    <svg width={width} height={height} viewBox="0 0 228 60" fill="none" className="chakra-icon" {...props}>
      <text x="10" y="40" fontFamily="Arial" fontSize="24" fill="#F1F1F2">rebrand sewn tm</text>
    </svg>
  )
}