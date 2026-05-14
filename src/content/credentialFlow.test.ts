// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { fillCredentials } from "./credentialFlow";
import { CREDENTIAL_INPUT_IDS } from "../cuny/ssoSite";
import { unwrapErr } from "../testUtils/resultUnwrap";

describe("fillCredentials", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("fills username/password and clicks submit", async () => {
    const username = document.createElement("input");
    username.id = CREDENTIAL_INPUT_IDS.username;
    const password = document.createElement("input");
    password.id = CREDENTIAL_INPUT_IDS.password;
    const submit = document.createElement("button");
    submit.id = CREDENTIAL_INPUT_IDS.submitButton;
    const clickSpy = vi.spyOn(submit, "click");
    document.body.append(username, password, submit);

    const result = await fillCredentials("student@login.cuny.edu", "hunter2");
    expect(result.isOk()).toBe(true);
    expect(username.value).toBe("student@login.cuny.edu");
    expect(password.value).toBe("hunter2");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  describe("err paths — missing elements", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("returns err when username input is missing", async () => {
      const password = document.createElement("input");
      password.id = CREDENTIAL_INPUT_IDS.password;
      const submit = document.createElement("button");
      submit.id = CREDENTIAL_INPUT_IDS.submitButton;
      document.body.append(password, submit);

      const resultPromise = fillCredentials("student@login.cuny.edu", "hunter2");
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result.isErr()).toBe(true);
      expect(unwrapErr(result)).toBe("username_input_not_found");
    });

    test("returns err when password input is missing", async () => {
      const username = document.createElement("input");
      username.id = CREDENTIAL_INPUT_IDS.username;
      const submit = document.createElement("button");
      submit.id = CREDENTIAL_INPUT_IDS.submitButton;
      document.body.append(username, submit);

      const resultPromise = fillCredentials("student@login.cuny.edu", "hunter2");
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result.isErr()).toBe(true);
      expect(unwrapErr(result)).toBe("password_input_not_found");
    });

    test("returns err when submit button is missing", async () => {
      const username = document.createElement("input");
      username.id = CREDENTIAL_INPUT_IDS.username;
      const password = document.createElement("input");
      password.id = CREDENTIAL_INPUT_IDS.password;
      document.body.append(username, password);

      const resultPromise = fillCredentials("student@login.cuny.edu", "hunter2");
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result.isErr()).toBe(true);
      expect(unwrapErr(result)).toBe("submit_button_not_found");
    });
  });
});
