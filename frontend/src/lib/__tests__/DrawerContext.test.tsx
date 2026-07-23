import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { DrawerContext, useDrawer } from "@/lib/DrawerContext";

describe("DrawerContext / useDrawer", () => {
  it("provides a no-op openDrawer by default when used outside any Provider", () => {
    const { result } = renderHook(() => useDrawer());
    expect(typeof result.current.openDrawer).toBe("function");
    // Should not throw — the default context value's openDrawer is a no-op.
    expect(() => result.current.openDrawer()).not.toThrow();
  });

  it("returns the value supplied by the nearest Provider", () => {
    const openDrawer = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DrawerContext.Provider value={{ openDrawer }}>{children}</DrawerContext.Provider>
    );
    const { result } = renderHook(() => useDrawer(), { wrapper });
    expect(result.current.openDrawer).toBe(openDrawer);
  });

  it("calling openDrawer from the hook invokes the Provider's function", () => {
    const openDrawer = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DrawerContext.Provider value={{ openDrawer }}>{children}</DrawerContext.Provider>
    );
    const { result } = renderHook(() => useDrawer(), { wrapper });
    result.current.openDrawer();
    expect(openDrawer).toHaveBeenCalledTimes(1);
  });

  it("nested Providers: the innermost value wins", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DrawerContext.Provider value={{ openDrawer: outer }}>
        <DrawerContext.Provider value={{ openDrawer: inner }}>{children}</DrawerContext.Provider>
      </DrawerContext.Provider>
    );
    const { result } = renderHook(() => useDrawer(), { wrapper });
    result.current.openDrawer();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
