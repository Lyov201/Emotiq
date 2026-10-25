# Emotiq authentication collection

This collection creates a test account and refresh-token records. Run it only against a backend connected to an isolated test database. The normal project backend uses your existing Neon database; do not run this account-creation collection against it for automated testing. The automated `npm test` suite uses mocks and needs no database setup.

1. In Postman, click **Import**, then select `Emotiq_Auth.postman_collection.json` and `Emotiq_Auth.local.postman_environment.example.json` from this directory.
2. Select the imported **Emotiq Auth LOCAL ONLY - isolated DB** environment.
3. Set `testPassword` to your own 12–128 character test password as a local value, and keep it out of shared/exported values. No real password is included in these files.
4. Start a separate backend process configured with the isolated database's `DATABASE_URL` and `DIRECT_URL`, a private JWT secret, and `FRONTEND_URL=http://localhost:5173`. Apply existing migrations to that isolated database before running. Do not change or reset your normal Neon database.
5. Set collection variable `baseUrl` to that process's address. Its default is the requested `http://localhost:5000`; the normal application default is port 4000. Start the isolated backend with `PORT=5000 npm start` from `backend/`, or adjust the collection variable to the port you chose. The frontend origin is independent of the API port.
6. Only after checking that the backend uses the isolated database, set local environment variable `isolatedDatabaseConfirmed` to `true`. Requests are skipped until this is set and a valid test password is supplied. This is an explicit acknowledgement, not automatic database detection.
7. Open the collection and choose **Run collection**. Keep all 15 requests selected, in their numbered order, with one iteration. Keep Postman's cookie jar enabled. Use a 100 ms delay if desired. Do not add a manual Cookie header.
8. Inspect the runner's assertions. Register returns 201; login/profile/refresh return 200; logout returns 204; refresh after logout returns 401. Negative cases check repeated logout, missing/invalid JWTs, duplicates, incorrect credentials, invalid input, missing CSRF, and incorrect Origin.

Each run generates a new email in the reserved `example.com` domain. Login captures `accessToken`, refresh updates it, and the profile request uses it automatically. Postman's cookie jar stores and rotates the HttpOnly cookie, then removes it on logout. Collection scripts check that private fields are absent from JSON. Access JWT strings can be identical when issued in the same second; refresh-token cookies must rotate. Automated tests verify cookie rotation, hash storage, token expiry/reuse, concurrent refresh and transaction rollback.

The collection uses a custom `Origin` and `X-CSRF-Protection: 1` on auth POST requests. `frontendOrigin` defaults to `http://localhost:5173` and must match the target process's `FRONTEND_URL`.

The runner does not delete its test users. Dispose of the isolated test database according to your own test workflow. Keep exported environments/cookies private; the `.gitignore` excludes `*.local.postman_environment.json`. The committed example has no credentials. Clear `accessToken` and `testUserId` before exporting/sharing a collection after a run.

Verification limits: scripts and request order are executed in the automated suite through a local Postman API harness against a mocked Express backend. The desktop Postman runner itself is not automated by this repository. PostgreSQL concurrent row locking is not exercised by mocked tests and requires an isolated PostgreSQL database for an integration test. No authentication writes are performed against the normal Neon database.
