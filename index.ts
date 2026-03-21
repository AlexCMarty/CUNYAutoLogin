import { Ok, err, Err, Result, ok } from 'neverthrow'

type UserData = {
  email: string;
  'totp-code': string;
  'password-initial': string;
  'password-confirmation': string;
};

type NonNullableProperties<T> = {
  [K in keyof T]: NonNullable<T[K]>
}

function getFormData(): Result<UserData, string> {
  const form = document.getElementById('info-form') as HTMLFormElement | null;
  if (!form) return err('Form not found!!!');

  let raw = Object.fromEntries(new FormData(form)) as Record<string, string>;
  raw = raw as NonNullableProperties<typeof raw>;

  raw['email'] = raw['email']!.trim();
  raw['totp-code'] = raw['totp-code']!.trim();

  const cunyEmailPattern = /@login\.cuny\.edu$/;

  if (Object.values(raw).some((val) => !val)) {
    return err('All fields are required');
  }

  const emailInput = document.getElementById('email') as HTMLInputElement | null;
  if (emailInput?.validity.typeMismatch) {
    return err('Doesn\'t look like a valid email.');
  }

  if (!cunyEmailPattern.test(raw['email'])) {
    return err('Must enter a CUNY email, ending in @login.cuny.edu');
  }

  if (raw['password-initial'] !== raw['password-confirmation']) {
    return err('Passwords do not match');
  }

  return ok({
    email: raw['email']!,
    'totp-code': raw['totp-code']!,
    'password-initial': raw['password-initial']!,
    'password-confirmation': raw['password-confirmation']!,
  });
}

function showError(errorMessage: string): void {
  console.log(errorMessage);
}

document.getElementById('submit-button')!.addEventListener('click', () => {
  const data = getFormData();
  if (data.isOk()) {
    console.log(data.value);
  } else {
    showError(data.error);
  }
});

console.log('entered');