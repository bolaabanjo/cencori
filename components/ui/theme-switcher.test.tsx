import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeSwitcher } from "./theme-switcher";

const themeState = vi.hoisted(() => ({
    theme: undefined as string | undefined,
}));

vi.mock("next-themes", () => ({
    useTheme: () => ({
        theme: themeState.theme,
        setTheme: vi.fn(),
    }),
}));

describe("ThemeSwitcher", () => {
    it("keeps its initial markup stable when the saved browser theme differs from SSR", () => {
        themeState.theme = undefined;
        const serverMarkup = renderToString(<ThemeSwitcher />);

        themeState.theme = "dark";
        const initialClientMarkup = renderToString(<ThemeSwitcher />);

        expect(initialClientMarkup).toBe(serverMarkup);
    });
});
