import dynamic from 'next/dynamic'

function CreateFarmPage() {
  return (<></>)
}

export default CreateFarmPage

export async function getStaticProps() {
  return {
    props: { title: 'Create Farm' }
  }
}
