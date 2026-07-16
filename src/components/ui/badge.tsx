import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-brand-orange/15 text-brand-orange',
        secondary: 'bg-brand-gray-light text-brand-steel',
        outline: 'border border-brand-gray-light text-brand-steel',
        success: 'bg-green-100 text-green-800',
        muted: 'bg-brand-gray-bg text-brand-steel',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
