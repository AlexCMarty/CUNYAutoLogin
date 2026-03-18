function getFormData() { // Either returns object or error
  let data = Object.fromEntries(new FormData(document.getElementById('info-form')));
  data['email'] = data['email'].trim();
  data['totp-code'] = data['totp-code'].trim();
  const re = /@login.cuny.edu$/;
  

  if (Object.values(data).some((val) => !val)) {
    return {result: 'error', message: 'All fields are required'};
  }

  if (!document.getElementById('email').validity.typeMismatch) {
    return {result: 'error', message: 'Doesn\'t look like a valid email.'};
  }

  if (!re.test(data['email'])) {
    return {result: 'error', message: 'Must enter a CUNY email, ending in @login.cuny.edu'};
  }

  if (data['password-initial'] !== data['password-confirmation']) {
    return {result: 'error', message: 'Passwords do not match'};
  }

  data.result = 'result';
  return data;
}

function showError(errorMessage) {
  console.log(errorMessage);
}

document.getElementById('submit-button').addEventListener('click', () => {
  const data = getFormData();
  if (data.result == 'result') { // Oh how I long for Rust's enums! Result<T, E>!!!
    console.log(data);
  } else {
    showError(data.message);
  }
});

console.log('entered');