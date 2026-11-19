# Contributing

Thanks for your interest in RT Author Desk!

This is **proprietary software** (see [LICENSE](LICENSE)). The source is public for transparency, but
**code contributions are by invitation only**. Please don't open pull requests unless you've been
asked to.

You are very welcome to:

- **Report bugs.** Open an issue using the *Bug report* template.
- **Suggest features.** Use the *Feature request* template.
- **Report security issues** privately, as described in [SECURITY.md](SECURITY.md).

Please never post a real sales report, an ISBN list, an account number or a login in an issue. Made-up numbers show a
problem just as well.

By submitting an issue, suggestion or other feedback you agree to the terms in Section 5 of the
[LICENSE](LICENSE).

## For invited collaborators

```bash
npm ci
npm start       # launch the app
npm test        # must pass before you open a PR
npm run test:e2e  # drives the real app through its window; needs a screen (on a server: xvfb-run -a npm run test:e2e)
```

- Money is always a whole number of the currency's smallest unit, with its currency code beside it. Never a floating-point number.
- The window never touches the database. Everything it can ask for is a named call in `src/main/api.js`, and a new one has a test.
- Tests use made-up data only. Real reports go in `test/private/`, which is never committed.
- Check a visual change in the real app, in the light and dark themes.
