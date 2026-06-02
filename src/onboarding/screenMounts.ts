/**
 * Central registry of onboarding screen mount functions so `render.ts` does not
 * import every screen module directly (integration hub stays readable).
 */

import type { OnboardingState } from "./state";
import type { ScreenMount } from "./screens/screenContext";
import { mountAllowGateScreen } from "./screens/allowGate";
import { mountBiometricOfferScreen } from "./screens/biometricOffer";
import { mountBiometricPrepScreen } from "./screens/biometricPrep";
import { mountChooseSetupPathScreen } from "./screens/chooseSetupPath";
import { mountCompleteDemoScreen } from "./screens/completeDemo";
import { mountCompleteDoneScreen } from "./screens/completeDone";
import { mountCunyTotpScreen } from "./screens/cunyTotp";
import { mountEmailEntryScreen } from "./screens/emailEntry";
import { mountKeyFromAuthAppScreen } from "./screens/keyFromAuthApp";
import { mountKeyFromOtherDeviceScreen } from "./screens/keyFromOtherDevice";
import { mountExtPasswordSetupScreen } from "./screens/extPasswordSetup";
import { mountGuidedAddFactorScreen } from "./screens/guidedAddFactor";
import { mountGuidedFactorTypeScreen } from "./screens/guidedFactorType";
import { mountGuidedManageScreen } from "./screens/guidedManage";
import { mountGuidedSecretCaptureScreen } from "./screens/guidedSecretCapture";
import { mountOaaSpaHomeScreen } from "./screens/oaaSpaHome";
import { mountOpeningCunyScreen } from "./screens/openingCuny";
import { mountPasswordEntryScreen } from "./screens/passwordEntry";
import { mountSetDefaultScreen } from "./screens/setDefault";
import { mountTestLoginScreen } from "./screens/testLogin";
import { mountTestLoginBadCredentialsScreen } from "./screens/testLoginBadCredentials";
import { mountTestLoginBadKeyScreen } from "./screens/testLoginBadKey";
import { mountVerifyLoginCodeScreen } from "./screens/verifyLoginCode";
import { mountWelcomeScreen } from "./screens/welcome";

export const SCREEN_MOUNTS: Partial<Record<OnboardingState, ScreenMount>> = {
  WELCOME: mountWelcomeScreen,
  EMAIL_ENTRY: mountEmailEntryScreen,
  PASSWORD_ENTRY: mountPasswordEntryScreen,
  // Advanced "use your existing key" branch — visuals reachable via dev #qa=.
  CHOOSE_SETUP_PATH: mountChooseSetupPathScreen,
  KEY_FROM_OTHER_DEVICE: mountKeyFromOtherDeviceScreen,
  KEY_FROM_AUTH_APP: mountKeyFromAuthAppScreen,
  TEST_LOGIN: mountTestLoginScreen,
  TEST_LOGIN_BAD_CREDENTIALS: mountTestLoginBadCredentialsScreen,
  TEST_LOGIN_BAD_KEY: mountTestLoginBadKeyScreen,
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
  BIOMETRIC_OFFER: mountBiometricOfferScreen,
  BIOMETRIC_PREP: mountBiometricPrepScreen,
  COMPLETE_DEMO: mountCompleteDemoScreen,
  COMPLETE_DONE: mountCompleteDoneScreen,
};
