"use client";

import { createContext, useContext } from "react";

export const DrawerContext = createContext<{ openDrawer: () => void }>({
  openDrawer: () => {},
});

export function useDrawer() {
  return useContext(DrawerContext);
}
