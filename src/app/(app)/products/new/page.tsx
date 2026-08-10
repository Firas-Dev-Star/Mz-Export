import { PageHeader } from '@/components/layout/page-header'
import { ProductForm } from '@/components/products/product-form'
import { requirePermission } from '@/lib/auth'
import { listCategories } from '@/services/product.service'

export const metadata = { title: 'Nouveau produit — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function NewProductPage() {
  await requirePermission('product.write')
  const categories = await listCategories()
  return (
    <>
      <PageHeader title="Nouveau produit" description="Ajoutez un article au catalogue export." />
      <ProductForm categories={categories.map((c) => c.name)} />
    </>
  )
}
