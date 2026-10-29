"use client";
import * as Primitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
export const Tabs = Primitive.Root;
export function TabsList(props: ComponentProps<typeof Primitive.List>) { return <Primitive.List data-slot="tabs-list" {...props} />; }
export function TabsTrigger(props: ComponentProps<typeof Primitive.Trigger>) { return <Primitive.Trigger data-slot="tabs-trigger" {...props} />; }
export const TabsContent = Primitive.Content;
