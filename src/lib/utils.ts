import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Keep the caller's typography role when a shared component supplies a default.
const merge = extendTailwindMerge<"typography">({
  extend: {
    classGroups: {
      typography: [
        {
          type: [
            "display-md",
            "room-sign",
            "building-sign",
            "heading-lg",
            "heading-md",
            "heading-sm",
            "body-md",
            "body-sm",
            "body-xs",
            "label-md",
            "label-sm",
            "metric-md",
          ],
        },
      ],
    },
  },
});
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
