import dynamic from 'next/dynamic'
const CreatePage = dynamic(() => import('@/features/Create/StandardPool'))

function CreatePoolPage() {
  return <CreatePage />
}

export default CreatePoolPage

export async function getStaticProps() {
  return {
    props: { title: 'Create Pool' }
  }
}
