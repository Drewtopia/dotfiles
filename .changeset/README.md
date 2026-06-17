# Changesets

This directory drives a versioned `CHANGELOG.md` for the dotfiles. Nothing is
published to a registry — `changeset version` only rolls accumulated notes into
the changelog and bumps `version` in `package.json`.

Workflow:

1. After a meaningful change, run `npm run changeset` and describe it. This writes
   a markdown file here.
2. When you want to cut a changelog entry, run `npm run version`. It consumes the
   pending markdown files, updates `CHANGELOG.md`, and bumps the version.

The changelog uses `@changesets/changelog-github`, which links commits/PRs against
`Drewtopia/dotfiles`. `npm run version` therefore needs a `GITHUB_TOKEN` in the
environment (a classic token with `public_repo`/`repo` scope) to resolve those
links. Authoring changesets (`npm run changeset`) needs no token.

See https://github.com/changesets/changesets for full docs.
