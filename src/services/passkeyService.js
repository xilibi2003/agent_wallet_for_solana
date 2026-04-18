import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

export function createPasskeyService({ config, database, sessionService }) {
  return {
    hasPasskeys() {
      return database.listPasskeys().length > 0;
    },

    listPasskeys() {
      return database.listPasskeys();
    },

    async createRegistrationChallenge() {
      const passkeys = database.listPasskeys();
      const options = await generateRegistrationOptions({
        rpID: config.webauthn.rpID,
        rpName: config.webauthn.rpName,
        userID: Buffer.from('agent-wallet-admin'),
        userName: 'admin@localhost',
        userDisplayName: 'Agent Wallet Admin',
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        excludeCredentials: passkeys.map((passkey) => ({
          id: passkey.credentialID,
          transports: passkey.transports,
        })),
      });

      const challengeToken = sessionService.createPasskeyChallenge({
        type: 'registration',
        challenge: options.challenge,
      });

      return {
        challengeToken,
        options,
      };
    },

    async verifyRegistration({ challengeToken, response }) {
      const challenge = sessionService.takePasskeyChallenge(challengeToken);
      if (!challenge || challenge.type !== 'registration') {
        throw new Error('registration_challenge_expired');
      }

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.webauthn.expectedOrigin,
        expectedRPID: config.webauthn.rpID,
        requireUserVerification: true,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new Error('passkey_registration_failed');
      }

      const credential =
        verification.registrationInfo.credential ?? verification.registrationInfo;

      database.savePasskey({
        credentialID: credential.id,
        credentialPublicKey: credential.publicKey,
        counter: credential.counter ?? verification.registrationInfo.counter ?? 0,
        transports: response.response?.transports ?? [],
        deviceType: verification.registrationInfo.credentialDeviceType ?? 'singleDevice',
        backedUp: verification.registrationInfo.credentialBackedUp ?? false,
      });

      return verification;
    },

    async createAuthenticationChallenge() {
      const passkeys = database.listPasskeys();
      if (passkeys.length === 0) {
        throw new Error('no_passkeys_enrolled');
      }

      const options = await generateAuthenticationOptions({
        rpID: config.webauthn.rpID,
        userVerification: 'preferred',
        allowCredentials: passkeys.map((passkey) => ({
          id: passkey.credentialID,
          transports: passkey.transports,
        })),
      });

      const challengeToken = sessionService.createPasskeyChallenge({
        type: 'authentication',
        challenge: options.challenge,
      });

      return {
        challengeToken,
        options,
      };
    },

    async verifyAuthentication({ challengeToken, response }) {
      const challenge = sessionService.takePasskeyChallenge(challengeToken);
      if (!challenge || challenge.type !== 'authentication') {
        throw new Error('authentication_challenge_expired');
      }

      const authenticator = database.getPasskey(response.id);
      if (!authenticator) {
        throw new Error('unknown_passkey');
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.webauthn.expectedOrigin,
        expectedRPID: config.webauthn.rpID,
        requireUserVerification: true,
        credential: {
          id: authenticator.credentialID,
          publicKey: authenticator.credentialPublicKey,
          counter: authenticator.counter,
          transports: authenticator.transports,
        },
      });

      if (!verification.verified) {
        throw new Error('passkey_authentication_failed');
      }

      database.savePasskey({
        ...authenticator,
        counter: verification.authenticationInfo.newCounter,
      });

      return verification;
    },
  };
}
