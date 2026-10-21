import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/lib/utils"


const Slider = React.forwardRef<React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[var(--line)]">
      <SliderPrimitive.Range className="absolute h-full bg-[var(--primary)]" />
    </SliderPrimitive.Track>
    {/* Thumb 1 (Mínimo) */}
    <SliderPrimitive.Thumb className="block h-5 w-5 cursor-grab rounded-full border-2 border-[var(--primary)] bg-[var(--background)] ring-offset-[var(--background)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50" />
    {/* Thumb 2 (Máximo) */}
    <SliderPrimitive.Thumb className="block h-5 w-5 cursor-grab rounded-full border-2 border-[var(--primary)] bg-[var(--background)] ring-offset-[var(--background)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }