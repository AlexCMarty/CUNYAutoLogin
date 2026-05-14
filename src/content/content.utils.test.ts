// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import {
  LOG_PREFIX,
  hasCredentialErrorInDom,
  setInputValue,
  simulateKeystrokes,
  isFillMessage,
  TOTP_SECRET_LEN_MIN,
  TOTP_SECRET_LEN_MAX,
} from "./content.utils";
import {
  CREDENTIAL_ERROR_ELEMENT_ID,
  CREDENTIAL_ERROR_TEXT_MARKER,
} from "../cuny/ssoSite";

describe("constants", () => {
  test('LOG_PREFIX is "[CUNYAutoLogin]"', () => {
    expect(LOG_PREFIX).toBe("[CUNYAutoLogin]");
  });

  test("TOTP_SECRET_LEN_MIN is 10", () => {
    expect(TOTP_SECRET_LEN_MIN).toBe(10);
  });

  test("TOTP_SECRET_LEN_MAX is 128", () => {
    expect(TOTP_SECRET_LEN_MAX).toBe(128);
  });
});

describe("hasCredentialErrorInDom", () => {
  test("returns false when serverError element is absent", () => {
    document.body.innerHTML = "";
    expect(hasCredentialErrorInDom(document)).toBe(false);
  });

  test("returns false when serverError element exists but has no matching text", () => {
    document.body.innerHTML = `<div id="${CREDENTIAL_ERROR_ELEMENT_ID}">Some other message</div>`;
    expect(hasCredentialErrorInDom(document)).toBe(false);
  });

  test("returns true when serverError element contains the credential error marker", () => {
    document.body.innerHTML = `<div id="${CREDENTIAL_ERROR_ELEMENT_ID}">${CREDENTIAL_ERROR_TEXT_MARKER}</div>`;
    expect(hasCredentialErrorInDom(document)).toBe(true);
  });

  test("returns true when marker is embedded in surrounding text", () => {
    document.body.innerHTML = `<div id="${CREDENTIAL_ERROR_ELEMENT_ID}">Error: ${CREDENTIAL_ERROR_TEXT_MARKER}. Please try again.</div>`;
    expect(hasCredentialErrorInDom(document)).toBe(true);
  });

  test("returns false when element text is empty", () => {
    document.body.innerHTML = `<div id="${CREDENTIAL_ERROR_ELEMENT_ID}"></div>`;
    expect(hasCredentialErrorInDom(document)).toBe(false);
  });

  test("returns false when element text is only whitespace", () => {
    document.body.innerHTML = `<div id="${CREDENTIAL_ERROR_ELEMENT_ID}">   </div>`;
    expect(hasCredentialErrorInDom(document)).toBe(false);
  });
});

describe("setInputValue", () => {
  test("sets the input value", () => {
    const input = document.createElement("input");
    setInputValue(input, "hello");
    expect(input.value).toBe("hello");
  });

  test("dispatches an input event", () => {
    const input = document.createElement("input");
    const inputHandler = vi.fn();
    input.addEventListener("input", inputHandler);
    setInputValue(input, "test");
    expect(inputHandler).toHaveBeenCalledOnce();
  });

  test("dispatches a change event", () => {
    const input = document.createElement("input");
    const changeHandler = vi.fn();
    input.addEventListener("change", changeHandler);
    setInputValue(input, "test");
    expect(changeHandler).toHaveBeenCalledOnce();
  });

  test("input event bubbles", () => {
    const container = document.createElement("div");
    const input = document.createElement("input");
    container.appendChild(input);
    const bubbleHandler = vi.fn();
    container.addEventListener("input", bubbleHandler);
    setInputValue(input, "value");
    expect(bubbleHandler).toHaveBeenCalledOnce();
  });

  test("sets empty string", () => {
    const input = document.createElement("input");
    input.value = "existing";
    setInputValue(input, "");
    expect(input.value).toBe("");
  });
});

describe("simulateKeystrokes", () => {
  test("sets the input value character by character", () => {
    const input = document.createElement("input");
    simulateKeystrokes(input, "abc");
    expect(input.value).toBe("abc");
  });

  test("clears an existing value before typing new characters", () => {
    const input = document.createElement("input");
    input.value = "existing";
    simulateKeystrokes(input, "new");
    expect(input.value).toBe("new");
  });

  test("dispatches keydown events for each character", () => {
    const input = document.createElement("input");
    const keydownHandler = vi.fn();
    input.addEventListener("keydown", keydownHandler);
    simulateKeystrokes(input, "ab");
    expect(keydownHandler).toHaveBeenCalledTimes(2);
  });

  test("dispatches keyup events for each character", () => {
    const input = document.createElement("input");
    const keyupHandler = vi.fn();
    input.addEventListener("keyup", keyupHandler);
    simulateKeystrokes(input, "ab");
    expect(keyupHandler).toHaveBeenCalledTimes(2);
  });

  test("dispatches a change event at end", () => {
    const input = document.createElement("input");
    const changeHandler = vi.fn();
    input.addEventListener("change", changeHandler);
    simulateKeystrokes(input, "abc");
    expect(changeHandler).toHaveBeenCalledOnce();
  });

  test("handles empty string without throwing", () => {
    const input = document.createElement("input");
    expect(() => simulateKeystrokes(input, "")).not.toThrow();
    expect(input.value).toBe("");
  });

  test("focuses the input element", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    document.body.appendChild(input);
    const focusSpy = vi.spyOn(input, "focus");
    simulateKeystrokes(input, "x");
    expect(focusSpy).toHaveBeenCalled();
  });

  test("dispatches deleteContentBackward input event when clearing existing value", () => {
    const input = document.createElement("input");
    input.value = "old";
    const inputHandler = vi.fn();
    input.addEventListener("input", inputHandler);
    simulateKeystrokes(input, "new");
    const inputTypes = inputHandler.mock.calls.map(
      (call) => (call[0] as InputEvent).inputType
    );
    expect(inputTypes).toContain("deleteContentBackward");
  });
});

// eslint-disable-next-line max-lines-per-function
describe("isFillMessage", () => {
  const validMessage = {
    type: "FILL_CREDENTIALS",
    payload: {
      email: "student@login.cuny.edu",
      password: "hunter2",
      totpSecret: "JBSWY3DPEHPK3PXP",
    },
  };

  test("valid FILL_CREDENTIALS message → true", () => {
    expect(isFillMessage(validMessage)).toBe(true);
  });

  test("null → false", () => {
    expect(isFillMessage(null)).toBe(false);
  });

  test("undefined → false", () => {
    expect(isFillMessage(undefined)).toBe(false);
  });

  test("string → false", () => {
    expect(isFillMessage("FILL_CREDENTIALS")).toBe(false);
  });

  test("number → false", () => {
    expect(isFillMessage(42)).toBe(false);
  });

  test("wrong type field → false", () => {
    expect(isFillMessage({ ...validMessage, type: "WRONG_TYPE" })).toBe(false);
  });

  test("missing payload → false", () => {
    expect(isFillMessage({ type: "FILL_CREDENTIALS" })).toBe(false);
  });

  test("null payload → false", () => {
    expect(isFillMessage({ type: "FILL_CREDENTIALS", payload: null })).toBe(false);
  });

  test("missing email in payload → false", () => {
    const msg = {
      type: "FILL_CREDENTIALS",
      payload: { password: "x", totpSecret: "y" },
    };
    expect(isFillMessage(msg)).toBe(false);
  });

  test("missing password in payload → false", () => {
    const msg = {
      type: "FILL_CREDENTIALS",
      payload: { email: "a@login.cuny.edu", totpSecret: "y" },
    };
    expect(isFillMessage(msg)).toBe(false);
  });

  test("missing totpSecret in payload → false", () => {
    const msg = {
      type: "FILL_CREDENTIALS",
      payload: { email: "a@login.cuny.edu", password: "x" },
    };
    expect(isFillMessage(msg)).toBe(false);
  });

  test("email is a number → false", () => {
    const msg = {
      type: "FILL_CREDENTIALS",
      payload: { email: 42, password: "x", totpSecret: "y" },
    };
    expect(isFillMessage(msg)).toBe(false);
  });

  test("password is null → false", () => {
    const msg = {
      type: "FILL_CREDENTIALS",
      payload: { email: "a@login.cuny.edu", password: null, totpSecret: "y" },
    };
    expect(isFillMessage(msg)).toBe(false);
  });

  test("totpSecret is an object → false", () => {
    const msg = {
      type: "FILL_CREDENTIALS",
      payload: { email: "a@login.cuny.edu", password: "x", totpSecret: {} },
    };
    expect(isFillMessage(msg)).toBe(false);
  });

  test("empty strings in all payload fields → true (strings are valid)", () => {
    const msg = {
      type: "FILL_CREDENTIALS",
      payload: { email: "", password: "", totpSecret: "" },
    };
    expect(isFillMessage(msg)).toBe(true);
  });

  test("extra payload fields do not break validation → true", () => {
    const msg = {
      type: "FILL_CREDENTIALS",
      payload: { ...validMessage.payload, extra: "ignored" },
    };
    expect(isFillMessage(msg)).toBe(true);
  });
});
