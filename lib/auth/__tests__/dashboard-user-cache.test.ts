import { beforeEach, describe, expect, test } from "vitest";
import {
  clearDashboardUserCache,
  readDashboardUserCache,
  writeDashboardUserCache,
} from "@/lib/auth/dashboard-user-cache";

describe("dashboard user cache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("restores the display identity needed to render the dashboard shell", () => {
    writeDashboardUserCache({
      email: "bola@cencori.com",
      user_metadata: {
        name: "Bola",
        avatar_url: "https://example.com/avatar.png",
        internal_note: "must not be cached",
      },
    });

    expect(readDashboardUserCache()).toEqual({
      email: "bola@cencori.com",
      user_metadata: {
        name: "Bola",
        avatar_url: "https://example.com/avatar.png",
      },
    });
  });

  test("discards malformed cached values", () => {
    sessionStorage.setItem("cencori:dashboard-user:v1", '"not-a-user"');

    expect(readDashboardUserCache()).toBeNull();
    expect(sessionStorage.getItem("cencori:dashboard-user:v1")).toBeNull();
  });

  test("clears the cached identity on sign-out", () => {
    writeDashboardUserCache({ email: "bola@cencori.com" });

    clearDashboardUserCache();

    expect(readDashboardUserCache()).toBeNull();
  });
});
