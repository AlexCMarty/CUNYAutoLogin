/**
 * Central registry of onboarding screen mount functions so `render.ts` does not
 * import every screen module directly (integration hub stays readable).
 */

import type { OnboardingState } from "./state";
import type { ScreenMount } from "./screens/screenContext";
import { mountAllowGateScreen } from "./screens/allowGate";
import { mountBiometricOfferScreen } from "./screens/biometricOffer";
import { mountBiometricPrepScreen } from "./screens/biometricPrep";
import { mountCompleteDemoScreen } from "./screens/completeDemo";
import { mountCompleteDoneScreen } from "./screens/completeDone";
import { mountCunyTotpScreen } from "./screens/cunyTotp";
import { mountEmailEntryScreen } from "./screens/emailEntry";
import { mountExtPasswordSetupScreen } from "./screens/extPasswordSetup";
import { mountGuidedAddFactorScreen } from "./screens/guidedAddFactor";
import { mountGuidedFactorTypeScreen } from "./screens/guidedFactorType";
import { mountGuidedManageScreen } from "./screens/guidedManage";
import { mountGuidedSecretCaptureScreen } from "./screens/guidedSecretCapture";
import { mountOaaSpaHomeScreen } from "./screens/oaaSpaHome";
import { mountOpeningCunyScreen } from "./screens/openingCuny";
import { mountPasswordEntryScreen } from "./screens/passwordEntry";
import { mountSetDefaultScreen } from "./screens/setDefault";
import { mountVerifyLoginCodeScreen } from "./screens/verifyLoginCode";
import { mountWelcomeScreen } from "./screens/welcome";

export const SCREEN_MOUNTS: Partial<Record<OnboardingState, ScreenMount>> = {
  WELCOME: mountWelcomeScreen,
  EMAIL_ENTRY: mountEmailEntryScreen,
  PASSWORD_ENTRY: mountPasswordEntryScreen,
  OPENING_CUNY: mountOpeningCunyScreen,
  CUNY_TOTP: mountCunyTotpScreen,
  ALLOW_GATE: mountAllowGateScreen,
  OAA_SPA_HOME: mountOaaSpaHomeScreen,
  GUIDED_MANAGE: mountGuidedManageScreen,
  GUIDED_ADD_FACTOR: mountGuidedAddFactorScreen,
  GUIDED_FACTOR_TYPE: mountGuidedFactorTypeScreen,
  GUIDED_SECRET_CAPTURE: mountGuidedSecretCaptureScreen,
  VERIFY_LOGIN_CODE: mountVerifyLoginCodeScreen,
  SET_DEFAULT: mountSetDefaultScreen,
  EXT_PASSWORD_SETUP: mountExtPasswordSetupScreen,
  ...(import.meta.env.MODE !== "production"
    ? { BIOMETRIC_OFFER: mountBiometricOfferScreen, BIOMETRIC_PREP: mountBiometricPrepScreen }
    : {}),
  COMPLETE_DEMO: mountCompleteDemoScreen,
  COMPLETE_DONE: mountCompleteDoneScreen,
};
