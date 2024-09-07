
function FarmCreatePage() {
  return (<></>)
}

export default FarmCreatePage

export async function getStaticProps() {
  return {
    props: { title: 'Create Farm' }
  }
}
