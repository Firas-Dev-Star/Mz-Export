import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProductForm } from '@/components/products/product-form'
import { requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isUnitCode } from '@/lib/units'
import { listCategories } from '@/services/product.service'

export const dynamic = 'force-dynamic'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('product.write')
  const { id } = await params

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { category: true } }),
    listCategories(),
  ])
  if (!product) notFound()

  return (
    <>
      <PageHeader title={`Modifier — ${product.designation}`} />
      <ProductForm
        productId={product.id}
        categories={categories.map((c) => c.name)}
        defaultValues={{
          reference: product.reference,
          sku: product.sku,
          designation: product.designation,
          description: product.description,
          // Colonne `String` en base : un produit anterieur a la fermeture de
          // la liste peut porter une unite hors liste. On retombe sur PCS
          // plutot que de casser le formulaire.
          unit: isUnitCode(product.unit) ? product.unit : 'PCS',
          categoryName: product.category?.name ?? '',
          salePriceEur: String(product.salePriceEur),
          purchasePriceTnd: String(product.purchasePriceTnd),
          trackStock: product.trackStock,
          minStock: String(product.minStock),
          vatMode: product.vatMode,
          vatRate: String(product.vatRate),
          ngp: product.ngp,
          originCountry: product.originCountry,
          unitWeightKg: String(product.unitWeightKg),
          lengthCm: String(product.lengthCm),
          widthCm: String(product.widthCm),
          heightCm: String(product.heightCm),
          unitsPerPackage: product.unitsPerPackage,
          isActive: product.isActive,
        }}
      />
    </>
  )
}