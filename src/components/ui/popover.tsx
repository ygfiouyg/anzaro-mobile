"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

// ═══════════════════════════════════════════════════════════════════════
// PREMIUM POPOVER — "Apple/Stripe" aesthetic
// ═══════════════════════════════════════════════════════════════════════

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // ── PREMIUM BASE ──
          "bg-popover bg-gradient-to-br from-popover via-popover to-muted/30 text-popover-foreground",
          // ── GLOWING BORDER & DEPTH ──
          "border border-border/60 dark:border-white/10",
          "ring-1 ring-black/[0.03] dark:ring-white/[0.04]",
          "shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40",
          // ── ELEGANT GEOMETRY ──
          "rounded-xl",
          // ── ANIMATION ──
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "z-[100] w-72 origin-(--radix-popover-content-transform-origin) p-4 outline-hidden duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
