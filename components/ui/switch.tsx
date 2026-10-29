"use client";
import * as Primitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
export function Switch(props: ComponentProps<typeof Primitive.Root>) { return <Primitive.Root {...props} className="ui-switch"><Primitive.Thumb className="ui-switch-thumb" /></Primitive.Root>; }
