# Context
Presently the onboarding process requires the user to read a README. As I plan to put this on the Chrome web store, that is unacceptable. Today we overhaul the user onboarding process to provide a seamless user experience.

## Popup structure during onboarding.
Every page will have:
- a back button (where applicable)
- a forwards button (where applicable). It should be grayed out / visibly unclickable until the current page is done by the user
- progress beads / circles on the bottom. Their color & brightness indicate progress. 
- input fields are pill shaped and have a width of about the whole page.

## Key todos
1. Allow autofill without the master password. Note how presently, no autofill occurs until the master password is saved. Add the feature where the email and CUNY password can be entered into the extension and those will be autofilled (but ofc not the TOTP because it will be empty). This is required for the below autofill to show the user the immediate value.
2. Presently if the extension holds a wrong email / password / TOTP, it will still click verify. enters loop. keeps trying, will lock account!!! Add feature for both email and TOTP pages: if there's an error, detect this and don't automatically retry.
3. Some way to direct user attention on what buttons on the webpage to click. I'm imagining the page grays out and the appropiate button is highlighted so it's very obvious what to click.
4. In self-service page, get the input field "Friendly Name" and autofill it with "CUNYAutoLogin" automatically for the user.
5. Add support for biometric authentication. When the vault is set up (after all these onboarding steps) the user will open their browser and scan their face or tap their finger, then their vault will unlock. Retain the master password as a fallback since not every laptop or computer will support this.

## Agent notes
You can edit this to provide the best UX possible. I'm not a UX nor UI expert.

## The CUNY Self-Service page's existing flow (without extension)
This is at https://ssologin.cuny.edu/oaa/rui.

This is where people go to add 2FA

1. Sign in as usual 
2. A thing pops up **Allow CUNY Login to Access MFA Self-Service?**, they must click **Allow**.

This is where they manage two factor authentication and also signed in session on other devices btw.

3. Under **My authentication factors**, click **Manage**.
4. Choose **Add authentication factor**.

They could delete some authentication factors on this page, max is 5.

5. Select **Mobile Authenticator - TOTP**.
6. They will see a **secret key** (letters and digits) and a QR code.

Most people here like use Microsoft or Google Authenticator or whatever to scan the QR code

7. Enter a name for the 2FA factor like "Microsoft Authenticator" or whatever. Click "Verify"

A field pops up and they type in the six digit done then click continue and that's it

# New desired flow for the extension

1. **Popup**

Welcome screen. Preview full flow:

- enter email and CUNY password
- log into the sso self service page
- all the annoying steps to get totp secret
- enter master password for extension
- set up biometrics if device allows

The whole self service page means it will be quite the task to make this as minimally annoying as possible!!!

2. **Popup**

blurb: "Welcome to CUNYAutoLogin! Never manually login to CUNY ever again."
add to the blurb a security notice that their information is safe, such as "Your credentials are encrypted locally and never leave your device."

The box for email entry. `@login.cuny.edu` is already prefilled.

No back button.

3. **Popup** 

The box for CUNY password entry.

4. **Popup**

"To continue, we need information from CUNYFirst please [log in](https://ssologin.cuny.edu/oaa/rui)"

Put a spinner or waiting icon of some kind as visual feedback they they need to log in.

Forwards button should always be grayed out / unclickable here. The only thing should be a back button and a link so it's clear to the user then must log in. This page will automatically proceed once they get to the "**Allow CUNY Login to Access MFA Self-Service?**" page.

5. **Webpage**

The pop is in the above "we need information please log in" state. Since the user has already entered their username and password into the extension, **log them in automatically** to CUNYFirst. This will immediately convey to the user the value of the extension. Of course, there will be no TOTP secret information, so they will still have to do that manually.

This also check if their username and password are correct. If not, the extension will detect this. In the popup add red text for feedback to indicate that they must change either their email or password since it didnt' work.

6. **Webpage**

On the page "**Allow CUNY Login to Access MFA Self-Service?**", gray everything else out a bit and highlight the "allow" button.

7. **Popup**

Prominent text "Please follow the instructions on the page to continue with setup."

Now it's clear to the user then should look at the page and click click click. However, the popup will have field:

Input field 1: TOTP secret

Forward button is grayed out / unclickable until it's filled in.

The secret should be automatically filled in from the CUNY page once it shows up. Once they go through steps (see below) and get their secret key, this popup page will transition to the "choose master password"

8. **Webpage**

Gray everything else out. Under **My authentication factors** (it's a heading), highlight **Manage** (button).

9. **Webpage**

Gray everything else out. Highlight **Choose authentication factor** (a dropdown)

10. **Webpage**

Gray everything else out. Highlight the button **Mobile Authentication Factor - TOTP**.

It might be the case that the user already has 5 factors (the max). I don't know why any CUNY student would do that, but hey edge cases. Sub-plan: let's figure this out. The user will already be in a bit of a "click the button... ugh i won't even read i'll just do it" mode. I don't want to tell them "delete this" then ruin their account... hmmm. 

11. **Webpage**

At this point the TOTP secret shows up. The extension will autofill the popup as usual. The popup shouldn't transition just yet.

12. **Webpage**

Get the input field "Friendly Name" and autofill it with "CUNYAutoLogin" automatically for the user. This functionality will have to be added. It won't let the user leave it blank.

Gray everything else out. Highlight the button "Verify Now"

13. **Webpage**

The extension will autofill the OTP code. Highlight the button "Verify and Save". Once the user clicks it, if successful it goes back to the "My Authentication Factors" page. To detect success, I'm thinking that we check if "CUNYAutoLogin" is on that page 🤔 . Or maybe assume success when the button "Verify and Save" is clicked. hmmm. If there's an error (empty name or wrong code) the webpage shows a message underneath the input field. 

I'll just think about the happy path.

14. **Popup**

Now the user must choose a **strong master password**. They enter it twice.

15. **Popup**

Can we enroll the user in biometric auth so they can just scan their face / tap their finger when they open the browser?

16. **Popup**

"You're all set!"