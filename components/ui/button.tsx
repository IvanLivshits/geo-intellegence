import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-normal leading-none transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        nav: 'border-2 border-stellar-white bg-transparent text-stellar-white hover:text-ash hover:border-ash',
        ghost: 'border-2 border-smoke bg-transparent text-stellar-white hover:border-stellar-white',
        icon: 'border-2 border-graphite bg-void-black text-stellar-white hover:border-signal-blue',
      },
      size: {
        default: 'h-10 px-5 text-[14px] rounded-full',
        sm: 'h-8 px-3 text-mono-badge rounded-full',
        icon: 'h-10 w-10 p-0 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
