'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, children, required, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none text-navy-800', className)}
    {...props}
  >
    {children}
    {required ? <span className="ml-0.5 text-destructive">*</span> : null}
  </LabelPrimitive.Root>
))
Label.displayName = 'Label'

export { Label }
