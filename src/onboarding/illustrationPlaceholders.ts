/**
 * Temporary striped blocks where onboarding illustrations will ship later.
 * Excluded from the default production bundle (`npm run build`); still shown
 * in development, e2e, and Vitest (`import.meta.env.PROD` is false there).
 */
export const showOnboardingIllustrationPlaceholders = !import.meta.env.PROD;
