// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { fillCredentials } from "./credentialFlow";

describe("fillCredentials", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("fills username/password and clicks submit", async () => {
    const username = document.createElement("input");
    username.id = "CUNYLoginUsernameDisplay";
    const password = document.createElement("input");
    password.id = "CUNYLoginPassword";
    const submit = document.createElement("button");
    submit.id = "submit";
    const clickSpy = vi.spyOn(submit, "click");
    document.body.append(username, password, submit);

    const result = await fillCredentials("student@login.cuny.edu", "hunter2");
    expect(result.isOk()).toBe(true);
    expect(username.value).toBe("student@login.cuny.edu");
    expect(password.value).toBe("hunter2");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
